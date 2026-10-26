/**
 * Between terminals and the team session (KAO-54). My own tiles register so the session can
 * send a teammate their current screen; a teammate's tile (a read-only mirror) listens for what
 * its owner streams.
 */

export interface LocalTerm {
  /** The screen and recent scrollback as ANSI, ready to replay into a fresh terminal. */
  serialize(): string
  cols: number
  rows: number
}

export type MirrorEvent =
  | { kind: 'screen'; data: string; cols: number; rows: number }
  | { kind: 'out'; data: string }
  | { kind: 'size'; cols: number; rows: number }

const local = new Map<string, () => LocalTerm>()
const mirrors = new Map<string, Set<(e: MirrorEvent) => void>>()
const resizeListeners = new Set<(tileId: string, cols: number, rows: number) => void>()
const wantListeners = new Set<(tileId: string) => void>()

export function registerLocal(tileId: string, get: () => LocalTerm): () => void {
  local.set(tileId, get)
  return () => {
    if (local.get(tileId) === get) local.delete(tileId)
  }
}
export const localTerm = (tileId: string) => local.get(tileId)?.()

/** A mirror listens for its tile's stream; returns the unsubscribe. */
export function onMirror(tileId: string, cb: (e: MirrorEvent) => void): () => void {
  const set = mirrors.get(tileId) ?? new Set()
  set.add(cb)
  mirrors.set(tileId, set)
  return () => {
    set.delete(cb)
    if (!set.size) mirrors.delete(tileId)
  }
}
export const emitMirror = (tileId: string, e: MirrorEvent) => mirrors.get(tileId)?.forEach((cb) => cb(e))

/** One of my terminals changed its grid size. */
export function onLocalResize(cb: (tileId: string, cols: number, rows: number) => void): () => void {
  resizeListeners.add(cb)
  return () => resizeListeners.delete(cb)
}
export const emitLocalResize = (tileId: string, cols: number, rows: number) =>
  resizeListeners.forEach((cb) => cb(tileId, cols, rows))

/** A mirror just mounted and needs its owner's current screen. */
export function onWantScreen(cb: (tileId: string) => void): () => void {
  wantListeners.add(cb)
  return () => wantListeners.delete(cb)
}
export const wantScreen = (tileId: string) => wantListeners.forEach((cb) => cb(tileId))
