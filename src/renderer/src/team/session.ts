import { createStore, useStore } from 'zustand'
import type { AgentState } from '../../../shared/status'
import { canvasStore } from '../canvas/store'
import {
  Reassembler,
  encodeInvite,
  frame,
  parseInvite,
  parseSignal,
  parseWire,
  topicFor,
  type Signal,
  type Wire
} from '../../../shared/team'
import { importKey, randomToken, seal, unseal } from './crypto'
import { TeamCore } from './core'
import { onLocalResize, onWantScreen } from './terminals'

/**
 * Team mode sessions (KAO-54): WebRTC data channels between teammates, set up through sealed
 * messages on a public ntfy topic. The host relays between guests (see TeamCore).
 */

export interface TeamUi {
  phase: 'off' | 'hosting' | 'joining' | 'connected'
  invite: string | null
  error: string | null
  /** Host: people asking to join, waiting for Allow or Deny. */
  requests: { id: string; name: string }[]
}
export const teamUi = createStore<TeamUi>()(() => ({ phase: 'off', invite: null, error: null, requests: [] }))
export const useTeamUi = <T>(sel: (s: TeamUi) => T) => useStore(teamUi, sel)

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }]
const JOIN_EVERY_MS = 3000
const JOIN_TIMEOUT_MS = 45_000
const OUT_EVERY_MS = 40
const OUT_MAX = 200_000

/** One teammate's connection: a peer connection with one ordered, reliable data channel. */
class Peer {
  pc = new RTCPeerConnection({ iceServers: ICE })
  dc: RTCDataChannel | null = null
  private pending: RTCIceCandidateInit[] = []
  private reasm = new Reassembler()
  private n = 0

  constructor(
    readonly id: string,
    private onWire: (from: string, msg: Wire) => void,
    private onOpen: (p: Peer) => void,
    private onClose: (p: Peer) => void,
    signal: (s: Signal) => void,
    me: string
  ) {
    this.pc.onicecandidate = (e) =>
      e.candidate && signal({ t: 'ice', from: me, to: id, c: JSON.stringify(e.candidate) })
    this.pc.onconnectionstatechange = () =>
      (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') && this.onClose(this)
    this.pc.ondatachannel = (e) => this.attach(e.channel)
  }

  attach(dc: RTCDataChannel) {
    this.dc = dc
    dc.onopen = () => this.onOpen(this)
    dc.onclose = () => this.onClose(this)
    dc.onmessage = (e) => {
      if (typeof e.data !== 'string') return
      const whole = this.reasm.push(e.data)
      if (!whole) return
      try {
        const msg = parseWire(JSON.parse(whole))
        if (msg) this.onWire(this.id, msg)
      } catch {
        /* not JSON: ignore */
      }
    }
  }

  send(msg: Wire) {
    // ponytail: no backpressure; a slow link just buffers. Drop output and resend a screen if that bites.
    if (this.dc?.readyState !== 'open') return
    for (const part of frame(JSON.stringify(msg), `${this.id}-${++this.n}`)) this.dc.send(part)
  }

  async remoteDescription(desc: RTCSessionDescriptionInit) {
    await this.pc.setRemoteDescription(desc)
    for (const c of this.pending.splice(0)) await this.pc.addIceCandidate(c).catch(() => {})
  }

  async candidate(c: RTCIceCandidateInit) {
    if (this.pc.remoteDescription) await this.pc.addIceCandidate(c).catch(() => {})
    else this.pending.push(c)
  }

  close() {
    this.dc?.close()
    this.pc.close()
  }
}

let current: Session | null = null

class Session {
  core: TeamCore | null = null
  peers = new Map<string, Peer>()
  private key!: CryptoKey
  private offs: (() => void)[] = []
  private timers: ReturnType<typeof setInterval | typeof setTimeout>[] = []
  private closed = false

  constructor(
    readonly role: 'host' | 'guest',
    readonly me: string,
    readonly name: string,
    private topic: string
  ) {}

  async open(keyText: string) {
    this.key = await importKey(keyText)
    this.offs.push(window.canvasApi.onTeamSignal((e) => e.topic === this.topic && void this.signalIn(e.message)))
    window.canvasApi.teamSubscribe(this.topic)
  }

  signal = (s: Signal) => void seal(this.key, s).then((m) => window.canvasApi.teamPublish(this.topic, m))

  private async signalIn(sealed: string) {
    const s = parseSignal(await unseal(this.key, sealed))
    if (!s || this.closed) return
    if (s.t === 'join') {
      if (this.role !== 'host' || this.peers.has(s.from) || s.from === this.me) return
      const ui = teamUi.getState()
      if (!ui.requests.some((r) => r.id === s.from))
        teamUi.setState({ requests: [...ui.requests, { id: s.from, name: s.name }] })
      return
    }
    if (s.to !== this.me) return
    if (s.t === 'denied') return this.end('The host said no to joining this canvas.')
    if (s.t === 'offer' && this.role === 'guest' && !this.peers.size) {
      const peer = this.peer(s.from)
      await peer.remoteDescription({ type: 'offer', sdp: s.sdp })
      const answer = await peer.pc.createAnswer()
      await peer.pc.setLocalDescription(answer)
      this.signal({ t: 'answer', from: this.me, to: s.from, sdp: answer.sdp ?? '' })
      return
    }
    const peer = this.peers.get(s.from)
    if (!peer) return
    if (s.t === 'answer') await peer.remoteDescription({ type: 'answer', sdp: s.sdp })
    if (s.t === 'ice') {
      try {
        await peer.candidate(JSON.parse(s.c))
      } catch {
        /* bad candidate: ignore */
      }
    }
  }

  private peer(id: string): Peer {
    const p = new Peer(
      id,
      (from, msg) => this.core?.receive(from, msg),
      (p) => this.opened(p),
      (p) => this.lost(p),
      this.signal,
      this.me
    )
    this.peers.set(id, p)
    return p
  }

  /** Host: let someone in. */
  async allow(id: string) {
    teamUi.setState((u) => ({ requests: u.requests.filter((r) => r.id !== id) }))
    if (this.peers.has(id)) return
    const peer = this.peer(id)
    peer.attach(peer.pc.createDataChannel('tilework', { ordered: true }))
    const offer = await peer.pc.createOffer()
    await peer.pc.setLocalDescription(offer)
    this.signal({ t: 'offer', from: this.me, to: id, sdp: offer.sdp ?? '' })
  }

  deny(id: string) {
    teamUi.setState((u) => ({ requests: u.requests.filter((r) => r.id !== id) }))
    this.signal({ t: 'denied', to: id })
  }

  private opened(p: Peer) {
    if (this.role === 'guest') {
      this.core = new TeamCore('guest', this.me, this.name, canvasStore, this.net())
      this.wireLocal()
      p.send({ t: 'hello', name: this.name })
      this.core.publishTiles()
      teamUi.setState({ phase: 'connected', error: null })
    }
    // The host waits for the guest's hello (TeamCore.receive) before sending anything.
  }

  private lost(p: Peer) {
    if (!this.peers.has(p.id)) return
    this.peers.delete(p.id)
    p.close()
    if (this.role === 'host') this.core?.peerLeft(p.id)
    else this.end(teamUi.getState().phase === 'connected' ? 'The host ended the session.' : null)
  }

  net() {
    return {
      peers: () => [...this.peers.values()].filter((p) => p.dc?.readyState === 'open').map((p) => p.id),
      send: (to: string, msg: Wire) => this.peers.get(to)?.send(msg)
    }
  }

  /** Share what happens on my own tiles. */
  wireLocal() {
    const core = this.core!
    let last = ''
    let tilesTimer: ReturnType<typeof setTimeout> | undefined
    const sync = () => {
      const msg = JSON.stringify(core.tilesMessage())
      if (msg !== last) {
        last = msg
        core.publishTiles()
      }
    }
    let lastStatus: Record<string, AgentState> = {}
    this.offs.push(
      canvasStore.subscribe((n, p) => {
        if (n.tiles !== p.tiles || n.links !== p.links) {
          clearTimeout(tilesTimer)
          tilesTimer = setTimeout(sync, 100)
        }
        if (n.status === p.status) return
        const mine = new Set(n.tiles.filter((t) => !t.ownerId).map((t) => t.id))
        const now: Record<string, AgentState> = {}
        for (const id of mine) if (n.status[id]) now[id] = n.status[id]
        for (const id of new Set([...Object.keys(now), ...Object.keys(lastStatus)]))
          if (now[id] !== lastStatus[id] && mine.has(id)) core.publish({ t: 'status', tile: id, s: now[id] ?? null })
        lastStatus = now
      })
    )
    // Terminal output, batched per tile so a busy agent sends a few messages a second, not hundreds.
    const pending = new Map<string, string>()
    this.offs.push(
      window.canvasApi.onData((e) => {
        if (!canvasStore.getState().tiles.some((t) => t.id === e.tileId && !t.ownerId)) return
        pending.set(e.tileId, (pending.get(e.tileId) ?? '') + e.data)
      })
    )
    this.timers.push(
      setInterval(() => {
        for (const [tile, d] of pending)
          for (let i = 0; i < d.length; i += OUT_MAX) core.publish({ t: 'out', tile, d: d.slice(i, i + OUT_MAX) })
        pending.clear()
      }, OUT_EVERY_MS)
    )
    this.offs.push(onLocalResize((tile, cols, rows) => core.publish({ t: 'size', tile, cols, rows })))
    this.offs.push(onWantScreen((tile) => core.want(tile)))
  }

  joinLoop() {
    const ask = () => this.signal({ t: 'join', from: this.me, name: this.name })
    ask()
    this.timers.push(setInterval(() => !this.peers.size && ask(), JOIN_EVERY_MS))
    this.timers.push(
      setTimeout(() => {
        if (teamUi.getState().phase !== 'connected')
          this.end(
            "Couldn't connect to the host. Check the invite code and that the host is still sharing. Some strict networks block direct connections; a shared Wi-Fi or Tailscale always works."
          )
      }, JOIN_TIMEOUT_MS)
    )
  }

  end(error: string | null) {
    if (this.closed) return
    this.closed = true
    for (const off of this.offs.splice(0)) off()
    for (const t of this.timers.splice(0)) clearTimeout(t as ReturnType<typeof setTimeout>)
    for (const p of this.peers.values()) p.close()
    this.peers.clear()
    window.canvasApi.teamUnsubscribe(this.topic)
    canvasStore.getState().setTeam(null)
    if (current === this) current = null
    teamUi.setState({ phase: 'off', invite: null, requests: [], error })
  }
}

const NAME_KEY = 'tilework.team.name'
export function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}
function remember(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    /* a convenience only */
  }
}

/** Start sharing this canvas. Returns the invite code to hand to teammates. */
export async function startSharing(name: string): Promise<string> {
  current?.end(null)
  remember(name)
  const room = randomToken(16)
  const key = randomToken(32)
  const s = new Session('host', randomToken(9), name, topicFor(room))
  current = s
  await s.open(key)
  s.core = new TeamCore('host', s.me, name, canvasStore, s.net())
  s.wireLocal()
  const invite = encodeInvite(room, key)
  teamUi.setState({ phase: 'hosting', invite, error: null, requests: [] })
  return invite
}

/** Join a teammate's canvas. False if the code isn't a Tilework invite. */
export async function joinTeam(code: string, name: string): Promise<boolean> {
  const inv = parseInvite(code)
  if (!inv) {
    teamUi.setState({ error: "That doesn't look like a Tilework invite code." })
    return false
  }
  current?.end(null)
  remember(name)
  const s = new Session('guest', randomToken(9), name, topicFor(inv.room))
  current = s
  teamUi.setState({ phase: 'joining', invite: null, error: null, requests: [] })
  await s.open(inv.key)
  s.joinLoop()
  return true
}

export const leaveTeam = () => current?.end(null)
export const allowJoin = (id: string) => void current?.allow(id)
export const denyJoin = (id: string) => current?.deny(id)
