import { describe, expect, it } from 'vitest'
import {
  FRAME,
  Reassembler,
  cleanName,
  colorFor,
  encodeInvite,
  frame,
  parseInvite,
  parseSignal,
  parseWire,
  shareTile
} from './team'

const KEY = 'a'.repeat(43)

describe('invite codes', () => {
  it('round-trip and reject anything else', () => {
    const code = encodeInvite('room_1234567890ab', KEY)
    expect(parseInvite(`  ${code}\n`)).toEqual({ room: 'room_1234567890ab', key: KEY })
    expect(parseInvite('tw1.short.' + KEY)).toBeNull()
    expect(parseInvite('tw2.room_1234567890ab.' + KEY)).toBeNull()
    expect(parseInvite('tw1.room_1234567890ab.' + KEY + '.x')).toBeNull()
    expect(parseInvite('tw1.room 1234567890ab.' + KEY)).toBeNull()
    expect(parseInvite('tw1.room_1234567890ab.tooShort')).toBeNull()
  })
})

describe('sharing tiles', () => {
  it('keeps geometry, title and flow flags, and drops everything private', () => {
    const t = {
      id: 'a1',
      title: 'Builder',
      command: 'rm -rf ~',
      args: ['x'],
      shell: true,
      cwd: '/home/me/secret',
      sessionId: 's',
      branch: 'b',
      x: 1,
      y: 2,
      w: 300,
      h: 200,
      join: true,
      ownerId: 'p'
    }
    expect(shareTile(t)).toEqual({ id: 'a1', title: 'Builder', x: 1, y: 2, w: 300, h: 200, join: true })
  })

  it('rejects malformed tiles', () => {
    expect(shareTile({ id: 'a b', title: 'x', x: 0, y: 0, w: 1, h: 1 })).toBeNull()
    expect(shareTile({ id: 'a', title: 'x', x: 0, y: 0, w: -1, h: 1 })).toBeNull()
    expect(shareTile({ id: 'a', title: 'x', x: NaN, y: 0, w: 1, h: 1 })).toBeNull()
  })
})

describe('parseWire', () => {
  it('accepts each message type and caps or rejects bad ones', () => {
    expect(parseWire({ t: 'hello', name: ' Bob\n ' })).toEqual({ t: 'hello', name: 'Bob' })
    expect(parseWire({ t: 'out', tile: 'a', d: 'hi' })).toEqual({ t: 'out', tile: 'a', d: 'hi' })
    expect(parseWire({ t: 'out', tile: 'a', d: 'x'.repeat(300_000) })).toBeNull()
    expect(parseWire({ t: 'size', tile: 'a', cols: 80, rows: 24 })).toEqual({
      t: 'size',
      tile: 'a',
      cols: 80,
      rows: 24
    })
    expect(parseWire({ t: 'size', tile: 'a', cols: 0, rows: 24 })).toBeNull()
    expect(parseWire({ t: 'status', tile: 'a', s: 'working' })).toMatchObject({ s: 'working' })
    expect(parseWire({ t: 'status', tile: 'a', s: 'hacked' })).toBeNull()
    expect(parseWire({ t: 'want', tile: 'a' })).toEqual({ t: 'want', tile: 'a' })
    expect(parseWire({ t: 'exec', cmd: 'ls' })).toBeNull()
    expect(parseWire(null)).toBeNull()
  })

  it('tiles: drops links to tiles not in the message, rejects a bad tile', () => {
    const tiles = [
      { id: 'a', title: 'A', x: 0, y: 0, w: 10, h: 10 },
      { id: 'b', title: 'B', x: 0, y: 0, w: 10, h: 10 }
    ]
    const links = [
      { id: 'l1', fromTileId: 'a', toTileId: 'b', mode: 'auto', when: 'OK' },
      { id: 'l2', fromTileId: 'a', toTileId: 'elsewhere', mode: 'manual' }
    ]
    expect(parseWire({ t: 'tiles', owner: 'p1', tiles, links })).toEqual({
      t: 'tiles',
      owner: 'p1',
      tiles,
      links: [{ id: 'l1', fromTileId: 'a', toTileId: 'b', mode: 'auto', when: 'OK' }]
    })
    expect(parseWire({ t: 'tiles', owner: 'p1', tiles: [{ id: 'a' }], links: [] })).toBeNull()
  })

  it('people: keeps valid entries only', () => {
    expect(
      parseWire({
        t: 'people',
        people: [
          { id: 'p1', name: 'Ann', color: '#7aa2f7' },
          { id: 'p2', name: 'Eve', color: 'red; background:url(x)' }
        ]
      })
    ).toEqual({ t: 'people', people: [{ id: 'p1', name: 'Ann', color: '#7aa2f7' }] })
  })
})

describe('parseSignal', () => {
  it('accepts the four kinds and rejects the rest', () => {
    expect(parseSignal({ t: 'join', from: 'g1', name: 'Bob' })).toEqual({ t: 'join', from: 'g1', name: 'Bob' })
    expect(parseSignal({ t: 'offer', from: 'h', to: 'g1', sdp: 'v=0' })).toMatchObject({ t: 'offer' })
    expect(parseSignal({ t: 'ice', from: 'h', to: 'g1', c: '{}' })).toMatchObject({ t: 'ice' })
    expect(parseSignal({ t: 'denied', to: 'g1' })).toEqual({ t: 'denied', to: 'g1' })
    expect(parseSignal({ t: 'offer', from: 'h', sdp: 'v=0' })).toBeNull()
  })
})

describe('framing', () => {
  it('splits big messages and puts them back together in any order', () => {
    const big = JSON.stringify({ t: 'screen', d: 'x'.repeat(FRAME * 2 + 5) })
    const parts = frame(big, 'm1')
    expect(parts).toHaveLength(3)
    const r = new Reassembler()
    expect(r.push(parts[2])).toBeNull()
    expect(r.push(parts[0])).toBeNull()
    expect(r.push(parts[1])).toBe(big)
  })

  it('passes small messages through and ignores bogus parts', () => {
    const r = new Reassembler()
    expect(frame('{"t":"want"}', 'm')).toEqual(['{"t":"want"}'])
    expect(r.push('{"t":"want"}')).toBe('{"t":"want"}')
    expect(r.push('{"t":"part","id":"m","i":5,"n":2,"s":"x"}')).toBeNull()
    expect(r.push('{"t":"part","id":"m","i":0,"n":99999,"s":"x"}')).toBeNull()
  })
})

describe('names and colours', () => {
  it('cleans names and cycles colours', () => {
    expect(cleanName('  \u0007Alice  ')).toBe('Alice')
    expect(cleanName('')).toBe('Teammate')
    expect(cleanName('x'.repeat(99))).toHaveLength(40)
    expect(colorFor(0)).toBe(colorFor(8))
  })
})
