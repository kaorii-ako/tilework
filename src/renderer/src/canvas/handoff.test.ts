import { describe, expect, it } from 'vitest'
import type { Tile } from '../../../shared/types'
import { LOOP, buildHandoff, handoffBlocker, sendHandoff, startHandoffs } from './handoff'
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
