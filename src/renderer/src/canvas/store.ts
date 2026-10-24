import { createStore, useStore } from 'zustand'
import type { AgentState } from '../../../shared/status'
import type { Link, Tile, Viewport } from '../../../shared/types'

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

  panBy(dx: number, dy: number): void
  /** Multiply zoom by `factor`, keeping the canvas point under `at` (screen px) still. */
  zoomAt(factor: number, at: Point): void
  /** Zoom to 100% with the tile centered in a surface of `surface` px, and focus it. */
  zoomToTile(id: string, surface: { w: number; h: number }): void
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
  selectLink(id: string | null): void
  setLinkDraft(draft: CanvasState['linkDraft']): void
  setStatus(tileId: string, state: AgentState): void
  /** Back to "shell", e.g. when the tile respawns. */
  clearStatus(tileId: string): void
}

export const MIN_TILE = { w: 320, h: 200 }
export const ZOOM = { min: 0.2, max: 1.5 }
export const NEW_TILE = { w: 720, h: 440 }

export function screenToCanvas(v: Viewport, p: Point): Point {
  return { x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom }
}

/**
 * Where a new tile of the given size should go so it is centered in a surface of
 * `surface` px. Nudged down-right while it would land exactly on an existing tile.
 */
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

export function placeNewTile(v: Viewport, surface: { w: number; h: number }, tiles: Tile[], size = NEW_TILE): Point {
  const c = screenToCanvas(v, { x: surface.w / 2, y: surface.h / 2 })
  let x = Math.round(c.x - size.w / 2)
  let y = Math.round(c.y - size.h / 2)
  while (tiles.some((t) => t.x === x && t.y === y)) {
    x += 28
    y += 28
  }
  return { x, y }
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

    selectLink: (id) => set((s) => (s.selectedLinkId === id ? s : { selectedLinkId: id })),

    setLinkDraft: (linkDraft) => set({ linkDraft }),

    setStatus: (tileId, state) =>
      set((s) => (s.status[tileId] === state ? s : { status: { ...s.status, [tileId]: state } })),

    clearStatus: (tileId) => set((s) => (tileId in s.status ? { status: withoutKey(s.status, tileId) } : s))
  }))
}

export type CanvasStore = ReturnType<typeof createCanvasStore>

/** The app's single canvas store. Components read slices with `useCanvas(selector)`. */
export const canvasStore = createCanvasStore()

export function useCanvas<T>(selector: (s: CanvasState) => T): T {
  return useStore(canvasStore, selector)
}
