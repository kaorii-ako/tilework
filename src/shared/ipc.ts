/** Every IPC channel and its payload, defined once. Main, preload and renderer import from here. */
export const IPC = {
  spawn: 'pty:spawn',
  input: 'pty:input',
  resize: 'pty:resize',
  kill: 'pty:kill',
  data: 'pty:data',
  exit: 'pty:exit'
} as const

// renderer -> main
export interface SpawnRequest {
  tileId: string
  command?: string
  args?: string[]
  cwd?: string
  cols: number
  rows: number
}
export interface InputRequest { tileId: string; data: string }
export interface ResizeRequest { tileId: string; cols: number; rows: number }
export interface KillRequest { tileId: string }

// main -> renderer
export interface DataEvent { tileId: string; data: string }
export interface ExitEvent { tileId: string; code: number }

/** Shape of window.canvasApi exposed by the preload. */
export interface CanvasApi {
  spawn(req: SpawnRequest): Promise<void>
  input(req: InputRequest): void
  resize(req: ResizeRequest): void
  kill(req: KillRequest): void
  /** Each returns an unsubscribe function. */
  onData(cb: (e: DataEvent) => void): () => void
  onExit(cb: (e: ExitEvent) => void): () => void
}
