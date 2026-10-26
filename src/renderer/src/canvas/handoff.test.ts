import { describe, expect, it } from 'vitest'
import type { Tile } from '../../../shared/types'
import { LOOP, buildHandoff, buildJoinHandoff, deliver, handoffBlocker, sendHandoff, startHandoffs } from './handoff'
import { STARTUP_MS } from './store'
import { createCanvasStore } from './store'

const tile = (id: string): Tile => ({ id, title: `Tile ${id}`, x: 0, y: 0, w: 400, h: 300 })

/** A and B linked A→B (and B→A when `loop`), with a fake PTY writer and clock. */
function setup(loop = false) {
  const store = createCanvasStore({ tiles: [tile('a'), tile('b')] })
  const s = () => store.getState()
  s().addLink('a', 'b')
  if (loop) s().addLink('b', 'a')
  const ab = s().links[0].id
  const ba = s().links[1]?.id
  const writes: { tileId: string; data: string; enter: boolean }[] = []
  let clock = 0
  const stop = startHandoffs(
    store,
    (tileId, data, enter) => writes.push({ tileId, data, enter }),
    () => clock
  )
  return { store, s, ab, ba, writes, tick: (ms: number) => (clock += ms), stop }
}

describe('buildHandoff', () => {
  it('wraps the handoff in one bracketed paste with CR newlines', () => {
    expect(buildHandoff('A', 'line 1\nline 2')).toBe(
      '\x1b[200~Handoff from A:\r\rline 1\rline 2\r\rContinue from this.\x1b[201~'
    )
  })

  it('ends with the link instruction instead of the default', () => {
    expect(buildHandoff('Planner', 'the plan', '  Implement this plan.\n')).toBe(
      '\x1b[200~Handoff from Planner:\r\rthe plan\r\rImplement this plan.\x1b[201~'
    )
    expect(buildHandoff('A', 'r', '   ')).toContain('Continue from this.')
  })

  it('strips control characters so the result cannot end the paste early', () => {
    const out = buildHandoff('A\x1b', 'x\x1b[201~rm -rf\x07\r\ny\tz\u009b')
    expect(out).toBe('\x1b[200~Handoff from A:\r\rx[201~rm -rf\ry\tz\r\rContinue from this.\x1b[201~')
    expect(out.split('\x1b')).toHaveLength(3) // only the two paste markers
  })
})

describe('manual handoff', () => {
  it('marks links out of a tile pending when it has a new result, and pastes without Enter', () => {
    const { s, ab, writes } = setup()
    expect(sendHandoff(s(), ab, () => {}, false)).toBe(false) // no result yet
    s().setResult('a', 'answer')
    expect(s().handoffPending[ab]).toBe(true)
    expect(writes).toEqual([]) // manual: nothing sent on its own
    expect(sendHandoff(s(), ab, (tileId, data, enter) => writes.push({ tileId, data, enter }), false)).toBe(true)
    expect(writes).toEqual([{ tileId: 'b', data: buildHandoff('Tile a', 'answer'), enter: false }])
  })

  it('never pastes into a tile that has exited', () => {
    const { s, ab } = setup()
    s().setResult('a', 'answer')
    s().setStatus('b', 'exited')
    expect(sendHandoff(s(), ab, () => {}, false)).toBe(false)
  })

  it('explains why Send is disabled', () => {
    const { s, ab } = setup()
    expect(handoffBlocker(s(), ab)).toMatch(/no result to hand off/) // plain shell
    s().setStatus('a', 'working')
    expect(handoffBlocker(s(), ab)).toMatch(/hasn't finished/)
    s().setResult('a', 'answer')
    expect(handoffBlocker(s(), ab)).toBeNull()
    s().setStatus('b', 'exited')
    expect(handoffBlocker(s(), ab)).toMatch(/has exited/)
  })

  it('forgets the result when the tile respawns', () => {
    const { s } = setup()
    s().setResult('a', 'answer')
    s().clearStatus('a')
    expect(s().lastResult.a).toBeUndefined()
  })
})

describe('auto handoff queue', () => {
  it('sends with Enter right away when B is idle or a shell', () => {
    const { s, ab, writes } = setup()
    s().setLinkMode(ab, 'auto')
    s().setResult('a', 'one')
    expect(writes).toEqual([{ tileId: 'b', data: buildHandoff('Tile a', 'one'), enter: true }])
    expect(s().handoffPending[ab]).toBeUndefined()
  })

  it('queues while B is working and sends when B goes idle', () => {
    const { s, ab, writes } = setup()
    s().setLinkMode(ab, 'auto')
    s().setStatus('b', 'working')
    s().setResult('a', 'one')
    expect(writes).toEqual([])
    expect(s().handoffPending[ab]).toBe(true) // shown as "queued"
    s().setStatus('b', 'needs-input')
    expect(writes).toEqual([])
    s().setStatus('b', 'idle')
    expect(writes).toHaveLength(1)
    expect(s().handoffPending[ab]).toBeUndefined()
  })

  it('stays queued for an exited B', () => {
    const { s, ab, writes } = setup()
    s().setLinkMode(ab, 'auto')
    s().setStatus('b', 'exited')
    s().setResult('a', 'one')
    expect(writes).toEqual([])
  })
})

describe('loop guard', () => {
  /** One round of an A→B→A loop: A finishes, B gets it and works, B finishes, A gets it. */
  function bounce(t: ReturnType<typeof setup>, n: number, start = 0) {
    for (let i = start; i < start + n; i++) {
      const [from, to] = i % 2 ? ['b', 'a'] : ['a', 'b']
      t.s().setStatus(from, 'idle')
      t.s().setResult(from, `result ${i}`)
      t.s().setStatus(to, 'working')
      t.tick(1000)
    }
  }

  it('pauses an A→B→A auto loop after 5 handoffs without a keystroke', () => {
    const t = setup(true)
    t.s().setLinkMode(t.ab, 'auto')
    t.s().setLinkMode(t.ba, 'auto')
    bounce(t, 6)
    expect(t.writes).toHaveLength(LOOP.max)
    expect(t.s().links.map((l) => l.mode)).toEqual(['manual', 'manual'])
    expect(t.s().loopPaused).toEqual({ [t.ab]: true, [t.ba]: true })
    expect(t.s().handoffPending[t.ba]).toBe(true) // the 6th waits as a manual "Send →"
  })

  it('a user keystroke resets the count', () => {
    const t = setup(true)
    t.s().setLinkMode(t.ab, 'auto')
    t.s().setLinkMode(t.ba, 'auto')
    bounce(t, 4)
    t.s().userTyped()
    bounce(t, 4)
    expect(t.writes).toHaveLength(8)
    expect(t.s().loopPaused).toEqual({})
  })

  it('only counts handoffs within the last 10 minutes', () => {
    const t = setup(true)
    t.s().setLinkMode(t.ab, 'auto')
    t.s().setLinkMode(t.ba, 'auto')
    bounce(t, 5)
    t.tick(LOOP.windowMs)
    bounce(t, 1, 5)
    expect(t.writes).toHaveLength(6)
    expect(t.s().loopPaused).toEqual({})
  })

  it('turning auto back on clears the note and starts over', () => {
    const t = setup(true)
    t.s().setLinkMode(t.ab, 'auto')
    t.s().setLinkMode(t.ba, 'auto')
    bounce(t, 6)
    t.s().setLinkMode(t.ab, 'auto')
    expect(t.s().loopPaused[t.ab]).toBeUndefined()
    expect(t.s().autoSends).toEqual([])
  })
})

/** Tiles by id with a fake PTY writer and clock, for the KAO-52 flows. */
function flow(ids: string[]) {
  const store = createCanvasStore({ tiles: ids.map(tile) })
  const s = () => store.getState()
  const writes: { tileId: string; data: string; enter: boolean }[] = []
  let clock = 1_000_000
  const stop = startHandoffs(
    store,
    (tileId, data, enter) => writes.push({ tileId, data, enter }),
    () => clock
  )
  const link = (from: string, to: string) => {
    s().addLink(from, to)
    return s().links.find((l) => l.fromTileId === from && l.toTileId === to)!.id
  }
  return { store, s, writes, link, stop, tick: (ms: number) => (clock += ms), now: () => clock }
}

describe('conditional routes (KAO-52)', () => {
  it('marks only the links whose condition the result meets', () => {
    const f = flow(['review', 'build', 'done'])
    const fix = f.link('review', 'build')
    const ship = f.link('review', 'done')
    f.s().setLinkWhen(fix, 'CHANGES REQUESTED')
    f.s().setLinkOtherwise(ship, true)
    f.s().setResult('review', 'Changes requested: add a test')
    expect(f.s().handoffPending).toEqual({ [fix]: true })
    f.s().handoffSent(fix)
    f.s().setResult('review', 'APPROVED')
    expect(f.s().handoffPending).toEqual({ [ship]: true })
  })

  it('a review loop stops on its own once approved', () => {
    const f = flow(['build', 'review'])
    const br = f.link('build', 'review')
    const rb = f.link('review', 'build')
    f.s().setLinkWhen(rb, 'CHANGES REQUESTED')
    f.s().setLinkMode(br, 'auto')
    f.s().setLinkMode(rb, 'auto')
    f.s().setResult('build', 'v1')
    f.s().setResult('review', 'CHANGES REQUESTED: tests')
    f.s().setResult('build', 'v2')
    f.s().setResult('review', 'APPROVED')
    expect(f.writes.map((w) => w.tileId)).toEqual(['review', 'build', 'review'])
  })
})

describe('join (KAO-52)', () => {
  it('waits for every input, then pastes one combined handoff and clears them all', () => {
    const f = flow(['a', 'b', 'rev'])
    const ar = f.link('a', 'rev')
    const br = f.link('b', 'rev')
    f.s().setTileFlag('rev', 'join', true)
    f.s().setLinkInstruction(ar, 'Review both.')
    f.s().setLinkInstruction(br, 'Review both.')
    f.s().setLinkMode(ar, 'auto')
    f.s().setStatus('a', 'working')
    f.s().setStatus('b', 'working')
    f.s().setStatus('a', 'idle')
    f.s().setResult('a', 'part A')
    expect(f.writes).toEqual([])
    expect(handoffBlocker(f.s(), ar)).toMatch(/Still waiting for Tile b/)
    f.s().setStatus('b', 'idle')
    f.s().setResult('b', 'part B')
    expect(f.writes).toEqual([
      {
        tileId: 'rev',
        data: buildJoinHandoff([
          { from: 'Tile a', result: 'part A', instruction: 'Review both.' },
          { from: 'Tile b', result: 'part B', instruction: 'Review both.' }
        ]),
        enter: true
      }
    ])
    expect(f.s().handoffPending).toEqual({})
    expect(f.s().autoSends).toHaveLength(1) // one send for the loop guard
  })

  it('a later round goes once the busy inputs are done, without waiting on idle ones', () => {
    const f = flow(['a', 'b', 'rev'])
    const ar = f.link('a', 'rev')
    f.link('b', 'rev')
    f.s().setTileFlag('rev', 'join', true)
    f.s().setLinkMode(ar, 'auto')
    f.s().setStatus('b', 'idle') // b isn't reworking anything this round
    f.s().setStatus('a', 'working')
    f.s().setStatus('a', 'idle')
    f.s().setResult('a', 'fix')
    expect(f.writes).toHaveLength(1)
    expect(f.writes[0].data).toContain('Handoffs from Tile a:')
    expect(f.writes[0].data).not.toContain('Tile b')
  })

  it('combines results under headings with each distinct instruction once', () => {
    expect(
      buildJoinHandoff([
        { from: 'A', result: '1', instruction: 'Check it.' },
        { from: 'B', result: '2', instruction: 'Check it.' }
      ])
    ).toBe('\x1b[200~Handoffs from A, B:\r\r--- A ---\r1\r\r--- B ---\r2\r\rCheck it.\x1b[201~')
  })
})

describe('split (KAO-52)', () => {
  const plan = 'Plan:\n1. API\n2. UI\n3. Docs'

  it('clones the target per task, copies its outgoing links, and queues each task', () => {
    const f = flow(['plan', 'build', 'rev'])
    const pb = f.link('plan', 'build')
    f.link('build', 'rev')
    f.s().setLinkSplit(pb, true)
    f.s().setResult('plan', plan)
    expect(deliver(f.s(), pb, () => {}, false, f.now())).toEqual([pb])
    const workers = f.s().tiles.filter((t) => t.workerOf === 'build')
    expect(workers.map((w) => w.title)).toEqual(['Tile build 2', 'Tile build 3'])
    expect(f.s().links.filter((l) => l.toTileId === 'rev')).toHaveLength(3)
    // The template (a plain shell) gets its task at once; new workers wait while starting.
    expect(f.writes).toHaveLength(1)
    expect(f.writes[0]).toMatchObject({ tileId: 'build', enter: true })
    expect(f.writes[0].data).toContain('Your task (1 of 3')
    expect(Object.keys(f.s().queued)).toEqual(workers.map((w) => w.id))
    f.s().setStatus(workers[0].id, 'idle') // its SessionStart
    expect(f.writes.at(-1)).toMatchObject({ tileId: workers[0].id })
    expect(f.writes.at(-1)!.data).toContain('Your task (2 of 3')
  })

  it('reuses workers on the next round', () => {
    const f = flow(['plan', 'build'])
    const pb = f.link('plan', 'build')
    f.s().setLinkSplit(pb, true)
    f.s().setResult('plan', plan)
    deliver(f.s(), pb, () => {}, false, f.now())
    f.s().setResult('plan', '- one\n- two')
    deliver(f.s(), pb, () => {}, false, f.now())
    expect(f.s().tiles.filter((t) => t.workerOf === 'build')).toHaveLength(2)
  })

  it('falls back to a plain handoff when there is no list', () => {
    const f = flow(['plan', 'build'])
    const pb = f.link('plan', 'build')
    f.s().setLinkSplit(pb, true)
    f.s().setResult('plan', 'Just one thing.')
    const out: string[] = []
    deliver(f.s(), pb, (_, data) => out.push(data), false, f.now())
    expect(out).toEqual([buildHandoff('Tile plan', 'Just one thing.')])
    expect(f.s().tiles).toHaveLength(2)
  })

  it('a worker that never reports in gets its task after STARTUP_MS', () => {
    const f = flow(['w'])
    f.s().markStarting(['w'], f.now())
    f.s().queueInput('w', 'go', true)
    expect(f.writes).toEqual([])
    f.tick(STARTUP_MS)
    f.s().moveTile('w', 10, 10) // any change re-runs the queue (the app also sets a timer)
    expect(f.writes).toEqual([{ tileId: 'w', data: 'go', enter: true }])
    expect(f.s().queued).toEqual({})
  })
})

describe('router (KAO-52)', () => {
  it('tells the router its choices and follows the one it names', () => {
    const f = flow(['in', 'router', 'fixer', 'writer'])
    const ir = f.link('in', 'router')
    const rf = f.link('router', 'fixer')
    const rw = f.link('router', 'writer')
    f.s().setTileFlag('router', 'router', true)
    f.s().setResult('in', 'Login crashes')
    const out: string[] = []
    deliver(f.s(), ir, (_, data) => out.push(data), false, f.now())
    expect(out[0]).toContain('ROUTE: <Tile fixer | Tile writer>')
    f.s().setResult('router', 'A crash, so:\nROUTE: Tile fixer')
    expect(f.s().handoffPending).toEqual({ [ir]: true, [rf]: true })
    expect(f.s().handoffPending[rw]).toBeUndefined()
  })
})
