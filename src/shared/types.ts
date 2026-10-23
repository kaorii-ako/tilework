/** One terminal tile on the canvas. Shared by canvas, launcher and persistence. */
export interface Tile {
  id: string
  title: string
  /** Executable to run; undefined means the user's login shell. */
  command?: string
  cwd?: string
  /** Canvas-space position and size in px. */
  x: number
  y: number
  w: number
  h: number
}
