import type { Link } from '../../../shared/types'
import { STARTUP_MS, type CanvasState, type CanvasStore } from './store'
import { parseTasks, routerAsk, workerTask } from './flow'

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
  return paste(`Handoff from ${clean(fromTitle)}:\n\n${clean(result)}\n\n${ask}`)
}

const paste = (body: string) => `\x1b[200~${body.replace(/\n/g, '\r')}\x1b[201~`

/** Any text as one clean bracketed paste, e.g. a workflow's goal (KAO-52). */
export const asPaste = (text: string) => paste(clean(text))

/** A join's handoff (KAO-52): every source's result under its own heading, then each distinct instruction. */
export function buildJoinHandoff(parts: { from: string; result: string; instruction?: string }[]): string {
  const asks = [...new Set(parts.map((p) => clean(p.instruction ?? '').trim()).filter(Boolean))]
  const body = parts.map((p) => `--- ${clean(p.from)} ---\n${clean(p.result)}`).join('\n\n')
  const names = parts.map((p) => clean(p.from)).join(', ')
  return paste(`Handoffs from ${names}:\n\n${body}\n\n${asks.join('\n') || DEFAULT_INSTRUCTION}`)
}

/** B can take a paste: it exists and hasn't exited. */
export const canReceive = (s: CanvasState, tileId: string) =>
  s.tiles.some((t) => t.id === tileId) && s.status[tileId] !== 'exited'

/** B is between turns: idle Claude Code, or a plain shell that isn't still starting up. */
export const isReady = (s: CanvasState, tileId: string, now = Date.now()) =>
  s.status[tileId] === 'idle' ||
  (s.status[tileId] === undefined && !(now - (s.starting[tileId] ?? -Infinity) < STARTUP_MS))

const titleOf = (s: CanvasState, id: string) => s.tiles.find((t) => t.id === id)?.title ?? 'The tile'

/** A join target's incoming links, or null when `toId` isn't a join with 2+ inputs. */
function joinInputs(s: CanvasState, toId: string): Link[] | null {
  const into = s.links.filter((l) => l.toTileId === toId)
  return s.tiles.find((t) => t.id === toId)?.join && into.length > 1 ? into : null
}

/** Still producing a result: working, asking you something, owing its result, or about to start. */
const busy = (s: CanvasState, tileId: string, now = Date.now()) =>
  s.status[tileId] === 'working' ||
  s.status[tileId] === 'needs-input' ||
  tileId in s.resultDue ||
  tileId in s.queued ||
  now - (s.starting[tileId] ?? -Infinity) < STARTUP_MS

/**
 * A join waits for the inputs whose source is still busy, then hands off everything that has
 * arrived. So the first round waits for every parallel worker, and a later round where only
 * one builder reworks something goes as soon as that builder is done.
 */
function joinWaiting(s: CanvasState, into: Link[], now = Date.now()): Link[] {
  return into.filter((l) => !s.handoffPending[l.id] && busy(s, l.fromTileId, now))
}

/** The link's instruction, plus the router prompt when the target picks the next step. */
function instructionFor(s: CanvasState, link: Link): string | undefined {
  const to = s.tiles.find((t) => t.id === link.toTileId)
  if (!to?.router) return link.instruction
  const choices = s.links.filter((l) => l.fromTileId === to.id).map((l) => titleOf(s, l.toTileId))
  return choices.length ? [link.instruction ?? DEFAULT_INSTRUCTION, routerAsk(choices)].join('\n\n') : link.instruction
}

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
  const into = joinInputs(s, link.toTileId)
  const waiting = into ? joinWaiting(s, into) : []
  if (waiting.length)
    return `${title(link.toTileId)} waits for all its inputs. Still waiting for ${waiting.map((l) => title(l.fromTileId)).join(', ')}.`
  return null
}

/** Paste the source tile's last result into the link's target. False if there is nothing to send or nowhere to send it. */
export function sendHandoff(s: CanvasState, linkId: string, write: Write, enter: boolean): boolean {
  return deliver(s, linkId, write, enter).length > 0
}

/**
 * Hand off along `linkId` and return every link that delivered (to mark them sent), or [] if
 * it can't go yet (see handoffBlocker). A join target gets one combined paste for all its
 * inputs. A split link turns a task list into parallel workers: the target takes the first
 * task, workers (reused or cloned) the rest, each pressed Enter on when it's ready.
 */
export function deliver(s: CanvasState, linkId: string, write: Write, enter: boolean, now = Date.now()): string[] {
  const link = s.links.find((l) => l.id === linkId)
  if (!link || handoffBlocker(s, linkId)) return []
  const text = s.lastResult[link.fromTileId]
  const fromTitle = titleOf(s, link.fromTileId)

  const into = joinInputs(s, link.toTileId)
  if (into) {
    if (joinWaiting(s, into, now).length) return []
    const join = into.filter((l) => s.handoffPending[l.id])
    const parts = join.map((l) => ({
      from: titleOf(s, l.fromTileId),
      result: s.lastResult[l.fromTileId],
      instruction: instructionFor(s, l)
    }))
    write(link.toTileId, buildJoinHandoff(parts), enter)
    return join.map((l) => l.id)
  }

  const tasks = link.split ? parseTasks(text) : []
  if (tasks.length > 1) {
    const ids = s.spawnWorkers(link.toTileId, tasks.length, now)
    ids.forEach((id, i) =>
      s.queueInput(id, buildHandoff(fromTitle, workerTask(tasks[i], i, ids.length, text), link.instruction), true)
    )
    return [link.id]
  }

  write(link.toTileId, buildHandoff(fromTitle, text, instructionFor(s, link)), enter)
  return [link.id]
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
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = () => {
    if (busy) return // our own store updates below re-enter the subscriber
    busy = true
    try {
      for (const { id } of store.getState().links) {
        const s = store.getState()
        const link = s.links.find((l) => l.id === id)
        if (!link || !s.handoffPending[id] || !isReady(s, link.toTileId, now())) continue
        // A join goes when any of its inputs is auto; a split's workers wait in `queued`, not here.
        const auto = (joinInputs(s, link.toTileId) ?? [link]).some((l) => l.mode === 'auto')
        if (!auto) continue
        const t = now()
        const recent = s.autoSends.filter((a) => t - a.at < LOOP.windowMs)
        if (recent.length >= LOOP.max) {
          s.pauseLoop([...new Set([...recent.map((a) => a.linkId), id])])
          continue
        }
        const sent = deliver(s, id, write, true, t)
        // ponytail: two auto links finishing into the same idle B at once both paste; hold B until its hooks report if that bites.
        // A join counts as one send for the loop guard, however many inputs it combined.
        sent.forEach((linkId, i) => store.getState().handoffSent(linkId, i === 0 ? t : undefined))
      }
      // Split workers' tasks and workflow goals, once their tile is ready.
      let wake = Infinity
      for (const [tileId, q] of Object.entries(store.getState().queued)) {
        const s = store.getState()
        const t = now()
        if (!canReceive(s, tileId)) continue
        if (!isReady(s, tileId, t)) {
          if (tileId in s.starting) wake = Math.min(wake, s.starting[tileId] + STARTUP_MS - t)
          continue
        }
        s.inputDelivered(tileId)
        write(tileId, q.text, q.enter)
      }
      // A tile that never reports a status still gets its input once STARTUP_MS is up.
      clearTimeout(timer)
      if (wake < Infinity) timer = setTimeout(run, Math.max(0, wake) + 50)
    } finally {
      busy = false
    }
  }
  run()
  const unsub = store.subscribe(
    (n, p) =>
      (n.links !== p.links ||
        n.status !== p.status ||
        n.handoffPending !== p.handoffPending ||
        n.queued !== p.queued ||
        n.starting !== p.starting ||
        n.tiles !== p.tiles) &&
      run()
  )
  return () => {
    unsub()
    clearTimeout(timer)
  }
}
