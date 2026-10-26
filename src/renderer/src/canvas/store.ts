import { createStore, useStore } from 'zustand'
import type { AgentState } from '../../../shared/status'
import type { Link, Tile, Viewport } from '../../../shared/types'
import { firingLinks } from './flow'

export type { Viewport }

export interface Point {
  x: number
  y: number
}

export interface CanvasState {
  viewport: Viewport
  tiles: Tile[]
  /** Tile ids back to front; the last one is drawn on top. */
  order: string[]
  focusedTileId: string | null
  links: Link[]
  selectedLinkId: string | null
  /** A link being dragged out of `from`'s output port; `at` is the pointer in canvas px. */
  linkDraft: { from: string; at: Point } | null
  /** Live agent state per tile from Claude Code hooks (KAO-24). No entry means a plain shell. */
  status: Record<string, AgentState>
  /** Last assistant message per Claude Code tile, from its transcript on Stop (KAO-33). Shells have none. */
  lastResult: Record<string, string>
  /** Links whose source has a result not yet handed off: "Send →" when manual, queued when auto. */
  handoffPending: Record<string, true>
  /** Links the loop guard switched back to manual. */
  loopPaused: Record<string, true>
  /** Auto handoffs since the last user keystroke, for the loop guard. */
  autoSends: { linkId: string; at: number }[]
  /** Text waiting for a tile to be ready: a split worker's task, or a workflow's goal (KAO-52). */
  queued: Record<string, { text: string; enter: boolean }>
  /**
   * Tiles just spawned, by start time. Not ready for input until their PTY is up (ptyStarted), or
   * for those in `waitStatus` their first status; at most STARTUP_MS either way.
   */
  starting: Record<string, number>
  /** Starting tiles running an agent that reports a status (Claude Code): wait for it, not just the PTY. */
  waitStatus: Record<string, true>
  /** Tiles that started working and haven't delivered a result yet (Stop's idle lands before the result). */
  resultDue: Record<string, true>

  panBy(dx: number, dy: number): void
  /** Multiply zoom by `factor`, keeping the canvas point under `at` (screen px) still. */
  zoomAt(factor: number, at: Point): void
  /** Zoom to 100% with the tile centered in a surface of `surface` px, and focus it. */
  zoomToTile(id: string, surface: { w: number; h: number }): void
  /** Show every tile (see fitViewport). */
  zoomToFit(surface: { w: number; h: number }): void
  /** Pan just enough to bring a tile fully into view (see revealViewport). */
  revealTile(id: string, surface: { w: number; h: number }): void
  addTile(tile: Tile): void
  removeTile(id: string): void
  /** Place a tile at canvas coordinates (rounded to whole px). */
  moveTile(id: string, x: number, y: number): void
  /** Set a tile's canvas size, clamped to MIN_TILE. */
  resizeTile(id: string, w: number, h: number): void
  /** Focus a tile and bring it to front; null clears focus. */
  focusTile(id: string | null): void
  /** Replace everything, e.g. when restoring a saved layout (KAO-26). Links to missing tiles are dropped. */
  setLayout(tiles: Tile[], viewport: Viewport, links?: Link[]): void
  /** Link `from`'s output to `to`'s input. Ignores self-links, duplicates and unknown tiles. */
  addLink(from: string, to: string): void
  removeLink(id: string): void
  /** Set (or clear, with blank text) what the link's target should do with a handoff. */
  setLinkInstruction(id: string, instruction: string): void
  /** Add a whole workflow's tiles and links at once (KAO-35). */
  addWorkflow(tiles: Tile[], links: Link[]): void
  selectLink(id: string | null): void
  setLinkDraft(draft: CanvasState['linkDraft']): void
  setStatus(tileId: string, state: AgentState): void
  /** Remember the tile's Claude Code session so the next launch resumes it (KAO-48). */
  setSession(tileId: string, sessionId: string): void
  /** Back to "shell", e.g. when the tile respawns. Also forgets its last result. */
  clearStatus(tileId: string): void
  /** A tile's agent finished with `text`; every link out of it gets a pending handoff. */
  setResult(tileId: string, text: string): void
  /** Any change clears the loop-paused note; turning auto on also resets the loop guard. */
  setLinkMode(linkId: string, mode: Link['mode']): void
  /** The pending handoff on `linkId` was delivered. `autoAt` records an auto send for the loop guard. */
  handoffSent(linkId: string, autoAt?: number): void
  /** Loop guard tripped: switch these links to manual and mark them paused. */
  pauseLoop(linkIds: string[]): void
  /** The user typed into a terminal: the loop guard starts over. */
  userTyped(): void
  /** Only fire when the source's result contains `text`; blank clears it. Clears `otherwise` (KAO-52). */
  setLinkWhen(linkId: string, text: string): void
  /** Fire only when no sibling condition matched. Clears `when`. */
  setLinkOtherwise(linkId: string, on: boolean): void
  /** Split the result's task list into parallel workers. */
  setLinkSplit(linkId: string, on: boolean): void
  /** Turn a tile's join (wait for all inputs) or router flag on or off. */
  setTileFlag(tileId: string, flag: 'join' | 'router', on: boolean): void
  /**
   * `n` tiles to run a split on: the template first, then its workers, reusing existing ones
   * and cloning the rest (below it, same command and folder, its outgoing links copied).
   * New workers are marked starting at `at`, waiting for a status if the template reports one.
   * Returns their ids in order.
   */
  spawnWorkers(templateId: string, n: number, at: number): string[]
  /** Deliver `text` to the tile once it's ready (see startHandoffs). */
  queueInput(tileId: string, text: string, enter: boolean): void
  inputDelivered(tileId: string): void
  /** Hold input for freshly spawned tiles until they're up (see `starting`). */
  markStarting(tileIds: string[], at: number, waitStatus: boolean): void
  /** The tile's PTY is running: a starting tile that doesn't wait for a status is ready PTY_SETTLE_MS after `at`. */
  ptyStarted(tileId: string, at: number): void
}

export const MIN_TILE = { w: 320, h: 200 }
export const ZOOM = { min: 0.2, max: 1.5 }
export const NEW_TILE = { w: 600, h: 420 }
/** Space kept between tiles when placing a new one. */
export const TILE_GAP = 96
/** Longest a freshly spawned tile is held back from input when it never reports a status. */
export const STARTUP_MS = 15_000
/**
 * How long after its PTY starts a tile without hooks is still held back: its login shell's
 * startup can read stdin (terminal queries in a profile) and would eat a paste sent sooner.
 */
export const PTY_SETTLE_MS = 1500

export function screenToCanvas(v: Viewport, p: Point): Point {
  return { x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom }
}

/**
 * Next zoom level, clamped. Terminals are only live at exactly 1, so zoom snaps to 1
 * when it lands near it or crosses it, and leaves 1 only on a later step.
 */
export function nextZoom(zoom: number, factor: number): number {
  const z = Math.min(ZOOM.max, Math.max(ZOOM.min, zoom * factor))
  if ((zoom < 1 && z > 1) || (zoom > 1 && z < 1) || (zoom !== 1 && Math.abs(z - 1) < 0.03)) return 1
  return z
}

/** Where a dragged point ends up: start + screen delta converted through zoom. */
export function dragTo(start: Point, from: Point, to: Point, zoom: number): Point {
  return { x: start.x + (to.x - from.x) / zoom, y: start.y + (to.y - from.y) / zoom }
}

/** A link leaves the middle of a tile's right edge and enters the middle of its left edge. */
export const outPort = (t: Tile): Point => ({ x: t.x + t.w, y: t.y + t.h / 2 })
export const inPort = (t: Tile): Point => ({ x: t.x, y: t.y + t.h / 2 })

/**
 * Horizontal-tangent cubic bézier from `a` to `b` as an SVG path, plus its midpoint (t = 0.5).
 * Control points reach out at least 60px so a link to a tile behind its source still loops.
 */
export function linkCurve(a: Point, b: Point): { d: string; mid: Point } {
  const dx = Math.max(60, Math.abs(b.x - a.x) / 2)
  const c1 = { x: a.x + dx, y: a.y }
  const c2 = { x: b.x - dx, y: b.y }
  return {
    d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,
    mid: { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 }
  }
}

/**
 * Where a new tile goes: the first one is centered in the view; later ones go right of the
 * anchor (the focused tile), else below it, else further right, never overlapping a tile.
 */
export function placeNewTile(
  v: Viewport,
  surface: { w: number; h: number },
  tiles: Tile[],
  anchorId: string | null = null,
  size = NEW_TILE
): Point {
  const anchor = tiles.find((t) => t.id === anchorId) ?? tiles.at(-1)
  if (!anchor) {
    const c = screenToCanvas(v, { x: surface.w / 2, y: surface.h / 2 })
    return { x: Math.round(c.x - size.w / 2), y: Math.round(c.y - size.h / 2) }
  }
  // Keep a gap around every tile, so no port or edge ends up under the new tile.
  const free = (p: Point) =>
    !tiles.some(
      (t) =>
        p.x < t.x + t.w + TILE_GAP &&
        p.x + size.w + TILE_GAP > t.x &&
        p.y < t.y + t.h + TILE_GAP &&
        p.y + size.h + TILE_GAP > t.y
    )
  const right = { x: anchor.x + anchor.w + TILE_GAP, y: anchor.y }
  const below = { x: anchor.x, y: anchor.y + anchor.h + TILE_GAP }
  if (free(right)) return right
  if (free(below)) return below
  // ponytail: linear scan to the right; a real packing search if people run dozens of tiles.
  for (let p = right; ; p = { x: p.x + size.w + TILE_GAP, y: p.y }) if (free(p)) return p
}

/** Pan (zoom unchanged) just enough that `t` is fully inside a surface of `surface` px, with a margin. */
export function revealViewport(v: Viewport, t: Tile, surface: { w: number; h: number }, margin = 24): Viewport {
  const axis = (pos: number, start: number, len: number, view: number) => {
    const a = pos + start * v.zoom
    const b = a + len * v.zoom
    if (b - a > view - 2 * margin || a < margin) return pos + margin - a // too big or off the start: align the start
    if (b > view - margin) return pos - (b - (view - margin))
    return pos
  }
  return { x: axis(v.x, t.x, t.w, surface.w), y: axis(v.y, t.y, t.h, surface.h), zoom: v.zoom }
}

/**
 * The viewport that shows every tile, centered, never above 100%. Exactly 1 when everything
 * fits at 100%, so terminals stay live.
 */
export function fitViewport(tiles: Tile[], surface: { w: number; h: number }, margin = 48): Viewport | null {
  if (!tiles.length) return null
  const x0 = Math.min(...tiles.map((t) => t.x))
  const y0 = Math.min(...tiles.map((t) => t.y))
  const x1 = Math.max(...tiles.map((t) => t.x + t.w))
  const y1 = Math.max(...tiles.map((t) => t.y + t.h))
  const fit = Math.min((surface.w - 2 * margin) / (x1 - x0), (surface.h - 2 * margin) / (y1 - y0))
  const zoom = Math.max(ZOOM.min, Math.min(1, fit))
  return {
    x: Math.round(surface.w / 2 - ((x0 + x1) / 2) * zoom),
    y: Math.round(surface.h / 2 - ((y0 + y1) / 2) * zoom),
    zoom
  }
}

/** `base`, or `base 2`, `base 3`… so tiles (and the "Handoff from" line) can be told apart. */
export function uniqueTitle(base: string, tiles: Tile[]): string {
  const taken = new Set(tiles.map((t) => t.title))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

/** Links whose both ends are in `tiles`. */
const linksBetween = (links: Link[], tiles: Tile[]) => {
  const ids = new Set(tiles.map((t) => t.id))
  return links.filter((l) => ids.has(l.fromTileId) && ids.has(l.toTileId))
}

function withoutKey<T>(r: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _, ...rest } = r
  return rest
}

function updateTile(tiles: Tile[], id: string, f: (t: Tile) => Tile): Tile[] {
  return tiles.map((t) => (t.id === id ? f(t) : t))
}

export function createCanvasStore(initial: Partial<Pick<CanvasState, 'viewport' | 'tiles'>> = {}) {
  const tiles = initial.tiles ?? []
  return createStore<CanvasState>()((set) => ({
    viewport: initial.viewport ?? { x: 0, y: 0, zoom: 1 },
    tiles,
    order: tiles.map((t) => t.id),
    focusedTileId: null,
    links: [],
    selectedLinkId: null,
    linkDraft: null,
    status: {},
    lastResult: {},
    handoffPending: {},
    loopPaused: {},
    autoSends: [],
    queued: {},
    starting: {},
    waitStatus: {},
    resultDue: {},

    panBy: (dx, dy) => set((s) => ({ viewport: { ...s.viewport, x: s.viewport.x + dx, y: s.viewport.y + dy } })),

    zoomAt: (factor, at) =>
      set((s) => {
        const zoom = nextZoom(s.viewport.zoom, factor)
        if (zoom === s.viewport.zoom) return s
        const c = screenToCanvas(s.viewport, at)
        return { viewport: { x: at.x - c.x * zoom, y: at.y - c.y * zoom, zoom } }
      }),

    zoomToTile: (id, surface) =>
      set((s) => {
        const t = s.tiles.find((t) => t.id === id)
        if (!t) return s
        return {
          viewport: {
            x: Math.round(surface.w / 2 - (t.x + t.w / 2)),
            y: Math.round(surface.h / 2 - (t.y + t.h / 2)),
            zoom: 1
          },
          focusedTileId: id,
          order: [...s.order.filter((o) => o !== id), id]
        }
      }),

    zoomToFit: (surface) =>
      set((s) => {
        const viewport = fitViewport(s.tiles, surface)
        return viewport ? { viewport } : s
      }),

    revealTile: (id, surface) =>
      set((s) => {
        const t = s.tiles.find((t) => t.id === id)
        if (!t) return s
        const viewport = revealViewport(s.viewport, t, surface)
        return viewport.x === s.viewport.x && viewport.y === s.viewport.y ? s : { viewport }
      }),

    addTile: (tile) =>
      set((s) => ({ tiles: [...s.tiles, tile], order: [...s.order, tile.id], focusedTileId: tile.id })),

    removeTile: (id) =>
      set((s) => {
        const order = s.order.filter((o) => o !== id)
        const links = s.links.filter((l) => l.fromTileId !== id && l.toTileId !== id)
        return {
          tiles: s.tiles.filter((t) => t.id !== id),
          order,
          links,
          status: withoutKey(s.status, id),
          queued: withoutKey(s.queued, id),
          starting: withoutKey(s.starting, id),
          waitStatus: withoutKey(s.waitStatus, id),
          resultDue: withoutKey(s.resultDue, id),
          selectedLinkId: links.some((l) => l.id === s.selectedLinkId) ? s.selectedLinkId : null,
          focusedTileId: s.focusedTileId === id ? (order.at(-1) ?? null) : s.focusedTileId
        }
      }),

    // Whole pixels so terminal text never lands on a half pixel.
    moveTile: (id, x, y) =>
      set((s) => ({ tiles: updateTile(s.tiles, id, (t) => ({ ...t, x: Math.round(x), y: Math.round(y) })) })),

    resizeTile: (id, w, h) =>
      set((s) => ({
        tiles: updateTile(s.tiles, id, (t) => ({
          ...t,
          w: Math.max(MIN_TILE.w, Math.round(w)),
          h: Math.max(MIN_TILE.h, Math.round(h))
        }))
      })),

    focusTile: (id) =>
      set((s) => {
        if (id === null) return s.focusedTileId === null ? s : { focusedTileId: null }
        if (!s.order.includes(id)) return s
        if (s.focusedTileId === id && s.order.at(-1) === id && !s.selectedLinkId) return s // no-op keeps subscribers quiet
        return { focusedTileId: id, order: [...s.order.filter((o) => o !== id), id], selectedLinkId: null }
      }),

    setLayout: (tiles, viewport, links = []) =>
      set({
        tiles,
        viewport,
        order: tiles.map((t) => t.id),
        focusedTileId: null,
        links: linksBetween(links, tiles),
        selectedLinkId: null,
        linkDraft: null
      }),

    addLink: (from, to) =>
      set((s) => {
        if (from === to || !s.tiles.some((t) => t.id === from) || !s.tiles.some((t) => t.id === to)) return s
        if (s.links.some((l) => l.fromTileId === from && l.toTileId === to)) return s
        return { links: [...s.links, { id: crypto.randomUUID(), fromTileId: from, toTileId: to, mode: 'manual' }] }
      }),

    removeLink: (id) =>
      set((s) => ({
        links: s.links.filter((l) => l.id !== id),
        selectedLinkId: s.selectedLinkId === id ? null : s.selectedLinkId
      })),

    setLinkInstruction: (id, instruction) =>
      set((s) => ({
        links: s.links.map((l) => {
          if (l.id !== id) return l
          const { instruction: _, ...rest } = l
          return instruction.trim() ? { ...rest, instruction: instruction.trim() } : rest
        })
      })),

    addWorkflow: (tiles, links) =>
      set((s) => {
        const all = [...s.tiles, ...tiles]
        return {
          tiles: all,
          order: [...s.order, ...tiles.map((t) => t.id)],
          links: [...s.links, ...linksBetween(links, all)],
          focusedTileId: tiles[0]?.id ?? s.focusedTileId
        }
      }),

    selectLink: (id) => set((s) => (s.selectedLinkId === id ? s : { selectedLinkId: id })),

    setLinkDraft: (linkDraft) => set({ linkDraft }),

    setStatus: (tileId, state) =>
      set((s) => {
        if (s.status[tileId] === state && !(tileId in s.starting)) return s
        const resultDue =
          state === 'working'
            ? { ...s.resultDue, [tileId]: true as const }
            : state === 'exited'
              ? withoutKey(s.resultDue, tileId)
              : s.resultDue
        return {
          status: { ...s.status, [tileId]: state },
          starting: withoutKey(s.starting, tileId),
          waitStatus: withoutKey(s.waitStatus, tileId),
          resultDue
        }
      }),

    setSession: (tileId, sessionId) =>
      set((s) =>
        s.tiles.some((t) => t.id === tileId && t.sessionId !== sessionId)
          ? { tiles: s.tiles.map((t) => (t.id === tileId ? { ...t, sessionId } : t)) }
          : s
      ),

    clearStatus: (tileId) =>
      set((s) =>
        tileId in s.status || tileId in s.lastResult || tileId in s.resultDue
          ? {
              status: withoutKey(s.status, tileId),
              lastResult: withoutKey(s.lastResult, tileId),
              resultDue: withoutKey(s.resultDue, tileId)
            }
          : s
      ),

    setResult: (tileId, text) =>
      set((s) => {
        const pending = { ...s.handoffPending }
        for (const l of firingLinks(s.tiles, s.links, tileId, text)) pending[l.id] = true
        return {
          lastResult: { ...s.lastResult, [tileId]: text },
          handoffPending: pending,
          resultDue: withoutKey(s.resultDue, tileId)
        }
      }),

    setLinkMode: (linkId, mode) =>
      set((s) => ({
        links: s.links.map((l) => (l.id === linkId ? { ...l, mode } : l)),
        loopPaused: withoutKey(s.loopPaused, linkId),
        autoSends: mode === 'auto' ? [] : s.autoSends
      })),

    handoffSent: (linkId, autoAt) =>
      set((s) => ({
        handoffPending: withoutKey(s.handoffPending, linkId),
        autoSends: autoAt === undefined ? s.autoSends : [...s.autoSends, { linkId, at: autoAt }]
      })),

    pauseLoop: (linkIds) =>
      set((s) => ({
        links: s.links.map((l) => (linkIds.includes(l.id) ? { ...l, mode: 'manual' } : l)),
        loopPaused: { ...s.loopPaused, ...Object.fromEntries(linkIds.map((id) => [id, true as const])) },
        autoSends: []
      })),

    userTyped: () => set((s) => (s.autoSends.length ? { autoSends: [] } : s)),

    setLinkWhen: (linkId, text) =>
      set((s) => ({
        links: s.links.map((l) => {
          if (l.id !== linkId) return l
          const { when: _, otherwise: __, ...rest } = l
          return text.trim() ? { ...rest, when: text.trim() } : rest
        })
      })),

    setLinkOtherwise: (linkId, on) =>
      set((s) => ({
        links: s.links.map((l) => {
          if (l.id !== linkId) return l
          const { when: _, otherwise: __, ...rest } = l
          return on ? { ...rest, otherwise: true as const } : rest
        })
      })),

    setLinkSplit: (linkId, on) =>
      set((s) => ({
        links: s.links.map((l) => {
          if (l.id !== linkId) return l
          const { split: _, ...rest } = l
          return on ? { ...rest, split: true as const } : rest
        })
      })),

    setTileFlag: (tileId, flag, on) =>
      set((s) => ({
        tiles: updateTile(s.tiles, tileId, (t) => {
          const { [flag]: _, ...rest } = t
          return on ? { ...rest, [flag]: true as const } : rest
        })
      })),

    spawnWorkers: (templateId, n, at) => {
      let ids: string[] = []
      set((s) => {
        const t = s.tiles.find((x) => x.id === templateId)
        if (!t || n < 1) return s
        const existing = s.tiles.filter((x) => x.workerOf === templateId)
        const tiles = [...s.tiles]
        const links = [...s.links]
        const fresh: string[] = []
        for (let i = existing.length; i < n - 1; i++) {
          // ponytail: workers stack straight down from the template; use placeNewTile if they start landing on other tiles.
          const { id: _, sessionId: __, branch: ___, join: ____, router: _____, ...copy } = t
          const w: Tile = {
            ...copy,
            id: crypto.randomUUID(),
            title: uniqueTitle(t.title, tiles),
            x: t.x,
            y: t.y + (t.h + TILE_GAP) * (i + 1),
            workerOf: templateId
          }
          tiles.push(w)
          fresh.push(w.id)
          for (const l of s.links.filter((l) => l.fromTileId === templateId))
            links.push({ ...l, id: crypto.randomUUID(), fromTileId: w.id })
        }
        ids = [templateId, ...[...existing.map((x) => x.id), ...fresh].slice(0, n - 1)]
        if (!fresh.length) return s
        return {
          tiles,
          links,
          order: [...s.order, ...fresh],
          starting: { ...s.starting, ...Object.fromEntries(fresh.map((id) => [id, at])) },
          // Workers of an agent that reports a status (Claude Code) wait for it, not just for the PTY.
          waitStatus:
            templateId in s.status
              ? { ...s.waitStatus, ...Object.fromEntries(fresh.map((id) => [id, true as const])) }
              : s.waitStatus
        }
      })
      return ids
    },

    queueInput: (tileId, text, enter) => set((s) => ({ queued: { ...s.queued, [tileId]: { text, enter } } })),

    inputDelivered: (tileId) => set((s) => (tileId in s.queued ? { queued: withoutKey(s.queued, tileId) } : s)),

    markStarting: (tileIds, at, waitStatus) =>
      set((s) => ({
        starting: { ...s.starting, ...Object.fromEntries(tileIds.map((id) => [id, at])) },
        waitStatus: waitStatus
          ? { ...s.waitStatus, ...Object.fromEntries(tileIds.map((id) => [id, true as const])) }
          : s.waitStatus
      })),

    // ponytail: a fixed settle delay; shell integration (an OSC "prompt ready" mark) would be exact.
    ptyStarted: (tileId, at) =>
      set((s) =>
        tileId in s.starting && !(tileId in s.waitStatus)
          ? { starting: { ...s.starting, [tileId]: Math.min(s.starting[tileId], at - STARTUP_MS + PTY_SETTLE_MS) } }
          : s
      )
  }))
}

export type CanvasStore = ReturnType<typeof createCanvasStore>

/** The app's single canvas store. Components read slices with `useCanvas(selector)`. */
export const canvasStore = createCanvasStore()

export function useCanvas<T>(selector: (s: CanvasState) => T): T {
  return useStore(canvasStore, selector)
}
