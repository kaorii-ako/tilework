import type { Link, Tile } from './types'
import type { AgentState } from './status'

/**
 * Team mode (KAO-54): teammates share one canvas peer to peer. Each tile runs only on its
 * owner's machine; everyone else sees a read-only mirror. Everything here is pure, so the
 * wire format and its validation are unit-tested.
 */

export interface Person {
  id: string
  name: string
  color: string
}

/** What a teammate's tile carries over the wire: never its command, args, folder, session or branch. */
export type SharedTile = Pick<Tile, 'id' | 'title' | 'x' | 'y' | 'w' | 'h' | 'join' | 'router' | 'workerOf'>

/** Messages on the data channel between peers. The host relays between guests. */
export type Wire =
  | { t: 'hello'; name: string }
  | { t: 'people'; people: Person[] }
  | { t: 'tiles'; owner: string; tiles: SharedTile[]; links: Link[] }
  | { t: 'out'; tile: string; d: string }
  | { t: 'screen'; tile: string; d: string; cols: number; rows: number }
  | { t: 'size'; tile: string; cols: number; rows: number }
  | { t: 'status'; tile: string; s: AgentState | null }
  | { t: 'want'; tile: string }

/** Messages on the signaling channel (ntfy.sh), always sealed with the room key. */
export type Signal =
  | { t: 'join'; from: string; name: string }
  | { t: 'denied'; to: string }
  | { t: 'offer' | 'answer'; from: string; to: string; sdp: string }
  | { t: 'ice'; from: string; to: string; c: string }

export const LIMITS = { name: 40, title: 500, tiles: 200, links: 2000, out: 256 * 1024, screen: 2 * 1024 * 1024 }
/** Wire frames above this are split into parts: SCTP messages past ~64 KB aren't safe everywhere. */
export const FRAME = 60_000

const PALETTE = ['#7aa2f7', '#93c79b', '#dfb771', '#e27d7d', '#b99bdc', '#7cc6c9', '#ef9a9a', '#ecca8d']
/** The i-th person to join gets the i-th colour, wrapping round. */
export const colorFor = (i: number) => PALETTE[i % PALETTE.length]

const STATES: (AgentState | null)[] = ['working', 'idle', 'needs-input', 'exited', null]
const ID = /^[\w-]{1,64}$/
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const id = (v: unknown): v is string => typeof v === 'string' && ID.test(v)
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const dim = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) <= 1000

// Control characters would let a name break the layout or a terminal; they become spaces.
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g

/** A display name: trimmed, single line, capped; "Teammate" when empty. */
export const cleanName = (s: unknown) =>
  (typeof s === 'string' ? s.replace(CONTROL, ' ').trim() : '').slice(0, LIMITS.name) || 'Teammate'

/** A tile as it may be shared: geometry, title and flow flags only. Null if malformed. */
export function shareTile(t: any): SharedTile | null {
  if (!t || !id(t.id) || !str(t.title, LIMITS.title)) return null
  if (![t.x, t.y].every(num) || ![t.w, t.h].every((v) => num(v) && v > 0 && v < 20_000)) return null
  const out: SharedTile = { id: t.id, title: t.title, x: t.x, y: t.y, w: t.w, h: t.h }
  if (t.join === true) out.join = true
  if (t.router === true) out.router = true
  if (id(t.workerOf)) out.workerOf = t.workerOf
  return out
}

/** Links between the given tiles only, with the routing fields kept and nothing else. */
export function shareLinks(raw: unknown, tileIds: Set<string>): Link[] {
  if (!Array.isArray(raw)) return []
  const out: Link[] = []
  for (const l of raw.slice(0, LIMITS.links) as any[]) {
    if (!l || !id(l.id) || !tileIds.has(l.fromTileId) || !tileIds.has(l.toTileId)) continue
    if (l.mode !== 'manual' && l.mode !== 'auto') continue
    const link: Link = { id: l.id, fromTileId: l.fromTileId, toTileId: l.toTileId, mode: l.mode }
    if (str(l.instruction, 2000) && l.instruction.trim()) link.instruction = l.instruction
    if (str(l.when, 200) && l.when.trim()) link.when = l.when
    else if (l.otherwise === true) link.otherwise = true
    if (l.split === true) link.split = true
    out.push(link)
  }
  return out
}

/** A data-channel message from a peer, or null if it's malformed or too big. Untrusted input. */
export function parseWire(raw: unknown): Wire | null {
  const m = raw as any
  if (!m || typeof m !== 'object') return null
  switch (m.t) {
    case 'hello':
      return typeof m.name === 'string' ? { t: 'hello', name: cleanName(m.name) } : null
    case 'people': {
      if (!Array.isArray(m.people) || m.people.length > 64) return null
      const people: Person[] = []
      for (const p of m.people)
        if (p && id(p.id) && typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color))
          people.push({ id: p.id, name: cleanName(p.name), color: p.color })
      return { t: 'people', people }
    }
    case 'tiles': {
      if (!id(m.owner) || !Array.isArray(m.tiles) || m.tiles.length > LIMITS.tiles) return null
      const tiles = m.tiles.map(shareTile)
      if (tiles.some((t: SharedTile | null) => !t)) return null
      return {
        t: 'tiles',
        owner: m.owner,
        tiles,
        links: shareLinks(m.links, new Set(tiles.map((t: SharedTile) => t.id)))
      }
    }
    case 'out':
      return id(m.tile) && str(m.d, LIMITS.out) ? { t: 'out', tile: m.tile, d: m.d } : null
    case 'screen':
      return id(m.tile) && str(m.d, LIMITS.screen) && dim(m.cols) && dim(m.rows)
        ? { t: 'screen', tile: m.tile, d: m.d, cols: m.cols, rows: m.rows }
        : null
    case 'size':
      return id(m.tile) && dim(m.cols) && dim(m.rows) ? { t: 'size', tile: m.tile, cols: m.cols, rows: m.rows } : null
    case 'status':
      return id(m.tile) && STATES.includes(m.s) ? { t: 'status', tile: m.tile, s: m.s } : null
    case 'want':
      return id(m.tile) ? { t: 'want', tile: m.tile } : null
    default:
      return null
  }
}

/** A signaling message after decryption, or null. */
export function parseSignal(raw: unknown): Signal | null {
  const m = raw as any
  if (!m || typeof m !== 'object') return null
  if (m.t === 'join' && id(m.from) && typeof m.name === 'string')
    return { t: 'join', from: m.from, name: cleanName(m.name) }
  if (m.t === 'denied' && id(m.to)) return { t: 'denied', to: m.to }
  if ((m.t === 'offer' || m.t === 'answer') && id(m.from) && id(m.to) && str(m.sdp, 20_000))
    return { t: m.t, from: m.from, to: m.to, sdp: m.sdp }
  if (m.t === 'ice' && id(m.from) && id(m.to) && str(m.c, 2000)) return { t: 'ice', from: m.from, to: m.to, c: m.c }
  return null
}

const B64URL = /^[A-Za-z0-9_-]+$/
/** `tw1.<room>.<key>`: room picks the signaling topic, key seals every signaling message. */
export function encodeInvite(room: string, key: string): string {
  return `tw1.${room}.${key}`
}
export function parseInvite(code: string): { room: string; key: string } | null {
  const [v, room, key, ...rest] = code.trim().split('.')
  if (v !== 'tw1' || rest.length || !room || !key || !B64URL.test(room) || !B64URL.test(key)) return null
  if (room.length < 16 || room.length > 64 || key.length !== 43) return null // key: 32 bytes, base64url
  return { room, key }
}
/** The ntfy topic for a room. */
export const topicFor = (room: string) => `tw-${room}`

/** Split a serialized message into frames of at most FRAME chars; small ones go as-is. */
export function frame(json: string, msgId: string): string[] {
  if (json.length <= FRAME) return [json]
  const n = Math.ceil(json.length / FRAME)
  return Array.from({ length: n }, (_, i) =>
    JSON.stringify({ t: 'part', id: msgId, i, n, s: json.slice(i * FRAME, (i + 1) * FRAME) })
  )
}

/** Puts frames back together. Returns a whole message's JSON when its last part arrives. */
export class Reassembler {
  private parts = new Map<string, { n: number; got: string[]; count: number }>()

  constructor(private max = LIMITS.screen * 2) {}

  push(raw: string): string | null {
    if (!raw.startsWith('{"t":"part"')) return raw
    let p: any
    try {
      p = JSON.parse(raw)
    } catch {
      return null
    }
    if (!id(p.id) || !Number.isInteger(p.n) || !Number.isInteger(p.i) || typeof p.s !== 'string') return null
    if (p.n < 1 || p.n * FRAME > this.max || p.i < 0 || p.i >= p.n) return null
    const e = this.parts.get(p.id) ?? { n: p.n, got: [], count: 0 }
    if (e.n !== p.n || e.got[p.i] !== undefined) return null
    e.got[p.i] = p.s
    e.count++
    this.parts.set(p.id, e)
    if (e.count < e.n) return null
    this.parts.delete(p.id)
    return e.got.join('')
  }
}
