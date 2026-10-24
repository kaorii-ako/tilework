/** One terminal tile on the canvas. Shared by canvas, launcher and persistence. */
export interface Tile {
  id: string
  title: string
  /** Executable to run; undefined means the user's login shell. */
  command?: string
  args?: string[]
  /** Run `command` as a shell string via the login shell (quotes, pipes, aliases). */
  shell?: boolean
  /** Preset this tile was launched from, if any. */
  presetId?: string
  cwd?: string
  /** Canvas-space position and size in px. */
  x: number
  y: number
  w: number
  h: number
}

/** A launcher entry. No command means the user's login shell. Stored in ~/.config/agent-canvas/presets.json. */
export interface Preset {
  id: string
  name: string
  command?: string
  args?: string[]
  /** Run `command` as a shell string via the login shell (quotes, pipes, aliases). */
  shell?: boolean
}
/** Canvas pan (px) and zoom factor. */
export interface Viewport {
  x: number
  y: number
  zoom: number
}

/** What is persisted to workspace.json. Tiles are the same `Tile` the canvas uses. */
export interface Workspace {
  version: 1
  viewport: Viewport
  tiles: Tile[]
}
