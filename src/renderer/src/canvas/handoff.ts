import type { CanvasState, CanvasStore } from './store'

/** An auto chain may send at most `max` handoffs within `windowMs` without a user keystroke. */
export const LOOP = { max: 5, windowMs: 10 * 60_000 }

/** Writes `data` to a tile's PTY, then presses Enter if asked. */
export type Write = (tileId: string, data: string, enter: boolean) => void

// Control characters (C0 except \t and \n, DEL, C1) could end the paste early or drive the terminal.
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g
const clean = (s: string) => s.replace(/\r\n?/g, '\n').replace(CONTROL, '')

/** Said at the end of a handoff whose link has no instruction (only reachable via Auto-send). */
export const DEFAULT_INSTRUCTION = 'Continue from this.'

/**
 * The handoff text as one bracketed paste, so a multi-line result arrives as a single paste
 * instead of running line by line. Newlines become CR, as a terminal paste sends them.
 * It ends with the link's instruction: what the next agent should do with the result.
 */
export function buildHandoff(fromTitle: string, result: string, instruction?: string): string {
  const ask = clean(instruction ?? '').trim() || DEFAULT_INSTRUCTION
  const body = `Handoff from ${clean(fromTitle)}:\n\n${clean(result)}\n\n${ask}`
  return `\x1b[200~${body.replace(/\n/g, '\r')}\x1b[201~`
}

/** B can take a paste: it exists and hasn't exited. */
export const canReceive = (s: CanvasState, tileId: string) =>
  s.tiles.some((t) => t.id === tileId) && s.status[tileId] !== 'exited'

/** B is between turns: idle Claude Code, or a plain shell. */
export const isReady = (s: CanvasState, tileId: string) => s.status[tileId] === undefined || s.status[tileId] === 'idle'

/** Why a link can't hand off right now, for the disabled "Send handoff" tooltip; null when it can. */
export function handoffBlocker(s: CanvasState, linkId: string): string | null {
  const link = s.links.find((l) => l.id === linkId)
  if (!link) return 'This link no longer exists.'
  const title = (id: string) => s.tiles.find((t) => t.id === id)?.title ?? 'The tile'
  if (!s.lastResult[link.fromTileId])
    return s.status[link.fromTileId]
      ? `${title(link.fromTileId)} hasn't finished a reply yet.`
      : `${title(link.fromTileId)} has no result to hand off. Only Claude Code tiles with the Tilework hook report one.`
  if (!canReceive(s, link.toTileId)) return `${title(link.toTileId)} has exited, so there is nowhere to paste.`
  return null
}

/** Paste the source tile's last result into the link's target. False if there is nothing to send or nowhere to send it. */
export function sendHandoff(s: CanvasState, linkId: string, write: Write, enter: boolean): boolean {
  const link = s.links.find((l) => l.id === linkId)
  if (!link) return false
  const from = s.tiles.find((t) => t.id === link.fromTileId)
  const text = s.lastResult[link.fromTileId]
  if (!from || !text || !canReceive(s, link.toTileId)) return false
  write(link.toTileId, buildHandoff(from.title, text, link.instruction), enter)
  return true
}

/** The real PTY writer. Enter goes a moment after the paste, so the agent sees the paste land first. */
export const ptyWrite: Write = (tileId, data, enter) => {
  window.canvasApi.input({ tileId, data })
  if (enter) setTimeout(() => window.canvasApi.input({ tileId, data: '\r' }), 150)
}

/**
 * Deliver pending handoffs on auto links: right away when the target is ready, otherwise
 * queued until it goes idle. Trips the loop guard after LOOP.max sends without a keystroke.
 */
export function startHandoffs(store: CanvasStore, write: Write, now: () => number = Date.now): () => void {
  let busy = false
  const run = () => {
    if (busy) return // our own store updates below re-enter the subscriber
    busy = true
    try {
      for (const { id } of store.getState().links) {
        const s = store.getState()
        const link = s.links.find((l) => l.id === id)
        if (!link || link.mode !== 'auto' || !s.handoffPending[id] || !isReady(s, link.toTileId)) continue
        const t = now()
        const recent = s.autoSends.filter((a) => t - a.at < LOOP.windowMs)
        if (recent.length >= LOOP.max) {
          s.pauseLoop([...new Set([...recent.map((a) => a.linkId), id])])
          continue
        }
        if (!sendHandoff(s, id, write, true)) continue
        // ponytail: two auto links finishing into the same idle B at once both paste; hold B until its hooks report if that bites.
        s.handoffSent(id, t)
      }
    } finally {
      busy = false
    }
  }
  run()
  return store.subscribe(
    (n, p) => (n.links !== p.links || n.status !== p.status || n.handoffPending !== p.handoffPending) && run()
  )
}
