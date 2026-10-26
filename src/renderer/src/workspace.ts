import type { CanvasStore } from './canvas/store'
import type { Link, Tile, Viewport, Workspace } from '../../shared/types'

/**
 * What the canvas (KAO-22) must implement so layout can be saved and restored.
 * Restoring means rendering each tile; each TerminalTile re-spawns its own
 * command in its cwd on mount.
 */
export interface CanvasState {
  getTiles(): Tile[]
  getViewport(): Viewport
  getLinks(): Link[]
  /** Must drop links whose tiles no longer exist. */
  setLayout(tiles: Tile[], viewport: Viewport, links: Link[]): void
}

/** Load the saved layout into the canvas. Returns false if there was nothing to restore. */
export async function restoreWorkspace(canvas: CanvasState): Promise<boolean> {
  const ws = await window.canvasApi.loadWorkspace()
  if (!ws) return false
  canvas.setLayout(ws.tiles, ws.viewport, ws.links)
  return true
}

/** Call whenever tiles, links or viewport change; main debounces the disk write. */
export function saveWorkspace(canvas: CanvasState): void {
  // A teammate's tiles (KAO-54) live on their machine; never write them into mine.
  const tiles = canvas.getTiles().filter((t) => !t.ownerId)
  const mine = new Set(tiles.map((t) => t.id))
  const ws: Workspace = {
    version: 1,
    viewport: canvas.getViewport(),
    tiles,
    links: canvas.getLinks().filter((l) => mine.has(l.fromTileId) && mine.has(l.toTileId))
  }
  window.canvasApi.saveWorkspace(ws)
}

/**
 * Restore the saved layout, then save on every tile/viewport change, debounced because
 * panning changes the viewport every frame. Saving starts only after the restore, so the
 * empty canvas never overwrites a saved layout. No layout: the canvas starts empty.
 */
export async function startWorkspace(store: CanvasStore, delayMs = 300): Promise<void> {
  const s = () => store.getState()
  const canvas: CanvasState = {
    getTiles: () => s().tiles,
    getViewport: () => s().viewport,
    getLinks: () => s().links,
    setLayout: (tiles, viewport, links) => s().setLayout(tiles, viewport, links)
  }
  await restoreWorkspace(canvas)
  let timer: ReturnType<typeof setTimeout> | undefined
  const save = () => saveWorkspace(canvas)
  store.subscribe((next, prev) => {
    if (next.tiles === prev.tiles && next.viewport === prev.viewport && next.links === prev.links) return
    clearTimeout(timer)
    timer = setTimeout(save, delayMs)
  })
  // Don't lose the last debounce window on quit; main flushes its own write on before-quit.
  window.addEventListener('beforeunload', () => {
    if (timer === undefined) return
    clearTimeout(timer)
    save()
  })
}
