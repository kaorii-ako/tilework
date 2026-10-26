import type { CanvasStore } from '../canvas/store'
import { colorFor, shareLinks, shareTile, type Person, type SharedTile, type Wire } from '../../../shared/team'
import { emitMirror, localTerm } from './terminals'

/** How the core reaches peers. A guest has one peer, the host; the host has one per guest. */
export interface Net {
  send(peerId: string, msg: Wire): void
  peers(): string[]
}

/**
 * Team mode routing (KAO-54), without any WebRTC: what to apply locally, what the host relays,
 * and who may say what. The host only takes a tile's output, screen, size or status from that
 * tile's owner, and stamps every `tiles` message with the peer it actually came from.
 */
export class TeamCore {
  /** Host only: each guest's latest `tiles`, replayed to whoever joins next. */
  private shared = new Map<string, Wire & { t: 'tiles' }>()
  private people: Person[]

  constructor(
    readonly role: 'host' | 'guest',
    readonly me: string,
    myName: string,
    private store: CanvasStore,
    private net: Net
  ) {
    this.people = [{ id: me, name: myName, color: colorFor(0) }]
    store.getState().setTeam({ me, role, people: role === 'host' ? this.people : [] })
  }

  private ownerOf = (tileId: string) => {
    const t = this.store.getState().tiles.find((x) => x.id === tileId)
    return t ? (t.ownerId ?? this.me) : null
  }

  /** Mine to everyone (guest: to the host, which relays). */
  private out(msg: Wire, except?: string) {
    for (const p of this.net.peers()) if (p !== except) this.net.send(p, msg)
  }

  /** My tiles and the links between them, without anything private. */
  tilesMessage(): Wire & { t: 'tiles' } {
    const s = this.store.getState()
    const tiles = s.tiles
      .filter((t) => !t.ownerId)
      .map(shareTile)
      .filter((t): t is SharedTile => !!t)
    return { t: 'tiles', owner: this.me, tiles, links: shareLinks(s.links, new Set(tiles.map((t) => t.id))) }
  }

  publishTiles() {
    this.out(this.tilesMessage())
  }

  /** A stream message about one of my tiles. */
  publish(msg: Wire & { tile: string }) {
    if (this.ownerOf(msg.tile) === this.me) this.out(msg)
  }

  /** My mirror of `tileId` needs its owner's current screen. */
  want(tileId: string) {
    const owner = this.ownerOf(tileId)
    if (!owner || owner === this.me) return
    // A guest only talks to the host; the host asks the owner directly.
    this.net.send(this.role === 'host' ? owner : this.net.peers()[0], { t: 'want', tile: tileId })
  }

  private screenOf(tileId: string): Wire | null {
    const term = this.ownerOf(tileId) === this.me ? localTerm(tileId) : undefined
    return term ? { t: 'screen', tile: tileId, d: term.serialize(), cols: term.cols, rows: term.rows } : null
  }

  /** Host: a guest's data channel opened and said hello. */
  private welcome(from: string, name: string) {
    if (!this.people.some((p) => p.id === from))
      this.people.push({ id: from, name, color: colorFor(this.people.length) })
    this.store.getState().setPeople([...this.people])
    this.out({ t: 'people', people: this.people })
    this.net.send(from, this.tilesMessage())
    for (const [owner, msg] of this.shared) if (owner !== from) this.net.send(from, msg)
  }

  /** Host: a guest left or dropped. Their tiles go with them. */
  peerLeft(peerId: string) {
    if (this.role !== 'host') return
    this.people = this.people.filter((p) => p.id !== peerId)
    this.shared.delete(peerId)
    this.store.getState().setRemote(peerId, [], [])
    this.store.getState().setPeople([...this.people])
    this.out({ t: 'tiles', owner: peerId, tiles: [], links: [] })
    this.out({ t: 'people', people: this.people })
  }

  /** Apply a stream message for a teammate's tile. */
  private applyStream(msg: Wire) {
    const s = this.store.getState()
    switch (msg.t) {
      case 'out':
        return emitMirror(msg.tile, { kind: 'out', data: msg.d })
      case 'screen':
        return emitMirror(msg.tile, { kind: 'screen', data: msg.d, cols: msg.cols, rows: msg.rows })
      case 'size':
        return emitMirror(msg.tile, { kind: 'size', cols: msg.cols, rows: msg.rows })
      case 'status':
        return msg.s ? s.setStatus(msg.tile, msg.s) : s.clearStatus(msg.tile)
    }
  }

  receive(from: string, msg: Wire) {
    const s = this.store.getState()
    if (this.role === 'guest') {
      switch (msg.t) {
        case 'people':
          return s.setPeople(msg.people)
        case 'tiles':
          return s.setRemote(msg.owner, msg.tiles, msg.links)
        case 'want': {
          const screen = this.screenOf(msg.tile)
          if (screen) this.net.send(from, screen)
          return
        }
        case 'hello':
          return
        default:
          if (this.ownerOf(msg.tile) && this.ownerOf(msg.tile) !== this.me) this.applyStream(msg)
          return
      }
    }
    // Host: everything a guest says is checked against who they are.
    switch (msg.t) {
      case 'hello':
        return this.welcome(from, msg.name)
      case 'people':
        return // only the host says who's here
      case 'tiles': {
        const stamped = { ...msg, owner: from }
        s.setRemote(from, msg.tiles, msg.links)
        // Relay what was actually accepted, so a guest can't claim someone else's tile ids.
        const kept = new Set(
          this.store
            .getState()
            .tiles.filter((t) => t.ownerId === from)
            .map((t) => t.id)
        )
        const accepted = {
          ...stamped,
          tiles: msg.tiles.filter((t) => kept.has(t.id)),
          links: msg.links.filter((l) => kept.has(l.fromTileId) && kept.has(l.toTileId))
        }
        this.shared.set(from, accepted)
        return this.out(accepted, from)
      }
      case 'want': {
        const owner = this.ownerOf(msg.tile)
        if (owner === this.me) {
          const screen = this.screenOf(msg.tile)
          if (screen) this.net.send(from, screen)
        } else if (owner && owner !== from) this.net.send(owner, msg)
        return
      }
      default:
        if (this.ownerOf(msg.tile) !== from) return // not their tile
        this.applyStream(msg)
        return this.out(msg, from)
    }
  }
}
