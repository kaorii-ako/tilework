import type { AgentState } from './status'
import type { Workspace } from './types'

/** Every IPC channel and its payload, defined once. Main, preload and renderer import from here. */
import type { Preset } from './types'
import type { Workflow } from './workflows'

export const IPC = {
  spawn: 'pty:spawn',
  input: 'pty:input',
  resize: 'pty:resize',
  kill: 'pty:kill',
  data: 'pty:data',
  exit: 'pty:exit',
  status: 'agent:status',
  result: 'agent:result',
  focusTile: 'agent:focus-tile',
  presets: 'launcher:presets',
  pickFolder: 'launcher:pick-folder',
  workspaceLoad: 'workspace:load',
  workspaceSave: 'workspace:save',
  hookStatus: 'hook:status',
  hookInstall: 'hook:install',
  workflowsLoad: 'workflows:load',
  workflowsSave: 'workflows:save',
  menuSaveWorkflow: 'menu:save-workflow'
} as const

// renderer -> main
export interface SpawnRequest {
  tileId: string
  /** Claude Code session to resume (KAO-48). Main only uses it for claude tiles whose transcript exists. */
  resume?: string
  command?: string
  args?: string[]
  /** Run `command` as a shell string via the login shell (quotes, pipes, aliases). */
  shell?: boolean
  cwd?: string
  cols: number
  rows: number
}
export interface InputRequest {
  tileId: string
  data: string
}
export interface ResizeRequest {
  tileId: string
  cols: number
  rows: number
}
export interface KillRequest {
  tileId: string
}

// main -> renderer
export interface DataEvent {
  tileId: string
  data: string
}
export interface ExitEvent {
  tileId: string
  code: number
}
export interface StatusEvent {
  tileId: string
  state: AgentState
  session?: string
}
/** The last assistant message of a Claude Code tile, read from its transcript on Stop (KAO-33). */
export interface ResultEvent {
  tileId: string
  text: string
}

/** Bring a tile into view at 100% (requested from outside, e.g. Nublet). */
export interface FocusTileEvent {
  tileId: string
}

/** Result of installing the Claude Code hook into ~/.claude/settings.json. */
export type HookInstallResult = { ok: true } | { ok: false; error: string }

/** Shape of window.canvasApi exposed by the preload. */
export interface CanvasApi {
  spawn(req: SpawnRequest): Promise<void>
  input(req: InputRequest): void
  resize(req: ResizeRequest): void
  kill(req: KillRequest): void
  /** Each returns an unsubscribe function. */
  onData(cb: (e: DataEvent) => void): () => void
  /** Presets from ~/.config/agent-canvas/presets.json (created with defaults on first run). */
  presets(): Promise<Preset[]>
  /** Native folder picker; null if cancelled. */
  pickFolder(): Promise<string | null>
  /** Saved layout, or null when none/corrupt (a corrupt file is backed up to workspace.json.bak). */
  loadWorkspace(): Promise<Workspace | null>
  /** Call on every layout change; main debounces the disk write. */
  saveWorkspace(ws: Workspace): void
  /** Whether ~/.claude/settings.json runs the Tilework hook for every event it needs. */
  hookInstalled(): Promise<boolean>
  /** Merge the hook into ~/.claude/settings.json (backup in settings.json.bak first). */
  installHook(): Promise<HookInstallResult>
  /** Custom workflows from ~/.config/agent-canvas/workflows.json (built-ins live in shared/workflows.ts). */
  loadWorkflows(): Promise<Workflow[]>
  /** Replace the custom workflows; returns what main kept after validation. */
  saveWorkflows(list: Workflow[]): Promise<Workflow[]>
  /** File → "Save canvas as workflow…" was chosen. */
  onMenuSaveWorkflow(cb: () => void): () => void
  onExit(cb: (e: ExitEvent) => void): () => void
  onStatus(cb: (e: StatusEvent) => void): () => void
  onResult(cb: (e: ResultEvent) => void): () => void
  onFocusTile(cb: (e: FocusTileEvent) => void): () => void
}
