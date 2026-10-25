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
  /** Last Claude Code session in this tile; resumed on the next launch if its transcript still exists (KAO-48). */
  sessionId?: string
  /** Canvas-space position and size in px. */
  x: number
  y: number
  w: number
  h: number
}

/** A line from one tile's output to another tile's input. `auto` hands off on its own (KAO-33). */
export interface Link {
  id: string
  fromTileId: string
  toTileId: string
  mode: 'manual' | 'auto'
  /** What the target should do with the handoff, e.g. "Review this for bugs" (KAO-35). */
  instruction?: string
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
  /** Missing in files saved before KAO-32; loads as []. */
  links: Link[]
}
