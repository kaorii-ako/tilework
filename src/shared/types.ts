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
  /** Branch of the tile's own git worktree, when it was started with one (KAO-50). */
  branch?: string
  /** Wait for every incoming link, then take one combined handoff (KAO-52). */
  join?: true
  /** Ends its reply with `ROUTE: <tile title>` to pick which outgoing link fires (KAO-52). */
  router?: true
  /** A parallel worker cloned from this tile by a split link; reused on the next split (KAO-52). */
  workerOf?: string
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
  /** Fire only when the source's result contains this text, case-insensitive (KAO-52). */
  when?: string
  /** Fire only when none of the source's `when` links matched (KAO-52). */
  otherwise?: true
  /** Split the result's task list into parallel workers, one copy of the target per task (KAO-52). */
  split?: true
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
