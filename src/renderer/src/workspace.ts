import { NEW_TILE, type CanvasStore } from './canvas/store'
import type { Tile, Viewport, Workspace } from '../../shared/types'

/**
 * What the canvas (KAO-22) must implement so layout can be saved and restored.
 * Restoring means rendering each tile; each TerminalTile re-spawns its own
 * command in its cwd on mount.
 */
export interface CanvasState {
  getTiles(): Tile[]
  getViewport(): Viewport
  setLayout(tiles: Tile[], viewport: Viewport): void
}

/** Load the saved layout into the canvas. Returns false if there was nothing to restore. */
export async function restoreWorkspace(canvas: CanvasState): Promise<boolean> {
  const ws = await window.canvasApi.loadWorkspace()
  if (!ws) return false
  canvas.setLayout(ws.tiles, ws.viewport)
  return true
}

/** Call whenever tiles or viewport change; main debounces the disk write. */
export function saveWorkspace(canvas: CanvasState): void {
  const ws: Workspace = { version: 1, viewport: canvas.getViewport(), tiles: canvas.getTiles() }
  window.canvasApi.saveWorkspace(ws)
}

/**
 * Restore the saved layout (or add the starting shell tile if none), then save on every
 * tile/viewport change, debounced because panning changes the viewport every frame.
 * Saving starts only after the restore, or the starting tile would overwrite the saved layout.
 */
export async function startWorkspace(store: CanvasStore, delayMs = 300): Promise<void> {
  const s = () => store.getState()
  const canvas: CanvasState = {
    getTiles: () => s().tiles,
    getViewport: () => s().viewport,
    setLayout: (tiles, viewport) => s().setLayout(tiles, viewport)
  }
  if (!(await restoreWorkspace(canvas))) {
    s().addTile({ id: crypto.randomUUID(), title: 'shell', x: 40, y: 40, ...NEW_TILE })
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const save = () => saveWorkspace(canvas)
  store.subscribe((next, prev) => {
    if (next.tiles === prev.tiles && next.viewport === prev.viewport) return
    clearTimeout(timer)
    timer = setTimeout(save, delayMs)
  })
  // Don't lose the last debounce window on quit; main flushes its own write on before-quit.
  window.addEventListener('beforeunload', () => {
    if (timer === undefined) return
    clearTimeout(timer)
    save()
  })
  save() // persist the starting tile (it was added before we subscribed)
}
