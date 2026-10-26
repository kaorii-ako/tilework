import { describe, expect, it } from 'vitest'
import type { Tile } from '../../../shared/types'
import { parseWire, type Wire } from '../../../shared/team'
import { createCanvasStore } from '../canvas/store'
import { TeamCore } from './core'
import { onMirror, registerLocal, type MirrorEvent } from './terminals'

const tile = (id: string): Tile => ({ id, title: id, x: 0, y: 0, w: 400, h: 300, command: 'claude', cwd: '/secret' })

/** Host plus guests wired through an in-memory "data channel" that round-trips JSON and parseWire. */
function team(guests: string[]) {
  const cores = new Map<string, TeamCore>()
  const sent: { from: string; to: string; msg: Wire }[] = []
  const net = (me: string, peers: () => string[]) => ({
    peers,
    send(to: string, msg: Wire) {
      sent.push({ from: me, to, msg })
      const wire = parseWire(JSON.parse(JSON.stringify(msg)))
      if (wire) cores.get(to)?.receive(me, wire)
    }
  })
  const joined: string[] = []
  const hostStore = createCanvasStore({ tiles: [tile('h1')] })
  cores.set(
    'host',
    new TeamCore(
      'host',
      'host',
      'Ann',
      hostStore,
      net('host', () => joined)
    )
  )
  const stores = new Map([['host', hostStore]])
  const join = (g: string) => {
    const store = createCanvasStore({ tiles: [tile(`${g}-t`)] })
    stores.set(g, store)
    cores.set(
      g,
      new TeamCore(
        'guest',
        g,
        g,
        store,
        net(g, () => ['host'])
      )
    )
    joined.push(g)
    // The session says hello once the data channel opens, then shares its tiles.
    net(g, () => ['host']).send('host', { t: 'hello', name: g })
    cores.get(g)!.publishTiles()
  }
  for (const g of guests) join(g)
  const leave = (g: string) => {
    joined.splice(joined.indexOf(g), 1)
    cores.get('host')!.peerLeft(g)
  }
  return {
    cores,
    stores,
    sent,
    join,
    leave,
    core: (id: string) => cores.get(id)!,
    store: (id: string) => stores.get(id)!
  }
}

const ids = (s: ReturnType<typeof createCanvasStore>) => s.getState().tiles.map((t) => `${t.id}:${t.ownerId ?? 'me'}`)

describe('TeamCore (KAO-54)', () => {
  it('a guest joining sees the host and is seen, and private fields never cross', () => {
    const t = team(['bob'])
    expect(ids(t.store('bob'))).toEqual(['bob-t:me', 'h1:host'])
    expect(ids(t.store('host'))).toEqual(['h1:me', 'bob-t:bob'])
    expect(
      t
        .store('bob')
        .getState()
        .team?.people.map((p) => p.name)
    ).toEqual(['Ann', 'bob'])
    const remote = t.store('bob').getState().tiles[1]
    expect(remote.command).toBeUndefined()
    expect(remote.cwd).toBeUndefined()
  })

  it('a later guest gets everyone’s tiles, and leaving takes a guest’s tiles away', () => {
    const t = team(['bob', 'cy'])
    expect(ids(t.store('cy'))).toEqual(['cy-t:me', 'h1:host', 'bob-t:bob'])
    expect(ids(t.store('bob'))).toEqual(['bob-t:me', 'h1:host', 'cy-t:cy'])
    t.leave('bob')
    expect(ids(t.store('cy'))).toEqual(['cy-t:me', 'h1:host'])
    expect(
      t
        .store('cy')
        .getState()
        .team?.people.map((p) => p.name)
    ).toEqual(['Ann', 'cy'])
  })

  it('streams a tile’s output and status to everyone, from its owner only', () => {
    const t = team(['bob', 'cy'])
    const got: MirrorEvent[] = []
    const off = onMirror('bob-t', (e) => got.push(e))
    t.core('bob').publish({ t: 'out', tile: 'bob-t', d: 'hello' })
    t.core('bob').publish({ t: 'status', tile: 'bob-t', s: 'working' })
    // Every core shares one bus in this test, so the host and cy each emit once.
    expect(got).toEqual([
      { kind: 'out', data: 'hello' },
      { kind: 'out', data: 'hello' }
    ])
    expect(t.store('cy').getState().status['bob-t']).toBe('working')
    // cy can't speak for bob's tile, and bob can't publish for the host's.
    t.core('host').receive('cy', { t: 'out', tile: 'bob-t', d: 'spoof' })
    t.core('bob').publish({ t: 'out', tile: 'h1', d: 'spoof' })
    expect(got).toHaveLength(2)
    off()
  })

  it('a guest can’t claim tile ids that are already someone else’s', () => {
    const t = team(['bob', 'cy'])
    t.core('host').receive('cy', {
      t: 'tiles',
      owner: 'bob',
      tiles: [
        { id: 'h1', title: 'mine now', x: 0, y: 0, w: 1, h: 1 },
        { id: 'cy-t', title: 'cy', x: 0, y: 0, w: 1, h: 1 }
      ],
      links: []
    })
    expect(ids(t.store('host'))).toEqual(['h1:me', 'bob-t:bob', 'cy-t:cy'])
    expect(t.store('host').getState().tiles[0].title).toBe('h1')
    expect(ids(t.store('bob'))).toEqual(['bob-t:me', 'h1:host', 'cy-t:cy'])
  })

  it('a mirror asking for a screen is routed to the owner, and the screen comes back', () => {
    const t = team(['bob', 'cy'])
    const off1 = registerLocal('bob-t', () => ({ serialize: () => 'SCREEN', cols: 90, rows: 30 }))
    const got: MirrorEvent[] = []
    const off2 = onMirror('bob-t', (e) => got.push(e))
    t.core('cy').want('bob-t')
    expect(t.sent.filter((s) => s.msg.t === 'want').map((s) => `${s.from}->${s.to}`)).toEqual(['cy->host', 'host->bob'])
    expect(got).toContainEqual({ kind: 'screen', data: 'SCREEN', cols: 90, rows: 30 })
    off1()
    off2()
  })
})
