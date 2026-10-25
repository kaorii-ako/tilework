export type AgentState = 'working' | 'idle' | 'needs-input' | 'exited'

const EVENT_TO_STATE: Record<string, AgentState> = {
  SessionStart: 'idle',
  UserPromptSubmit: 'working',
  PreToolUse: 'working',
  Notification: 'needs-input',
  Stop: 'idle',
  SessionEnd: 'exited'
}

export const stateForEvent = (event: string): AgentState | undefined =>
  Object.hasOwn(EVENT_TO_STATE, event) ? EVENT_TO_STATE[event] : undefined

/** Parse one line written by hooks/agent-canvas-hook.sh. Returns undefined for anything malformed or unknown. */
export interface HookEvent {
  tileId: string
  state: AgentState
  transcript?: string
}

/** Someone outside the app (Nublet's top-bar pill) asks to bring a tile into view. */
export interface FocusRequest {
  tileId: string
  focus: true
}

export function parseStatusLine(line: string): HookEvent | FocusRequest | undefined {
  try {
    const { tile, event, transcript } = JSON.parse(line)
    if (event === 'Focus') return typeof tile === 'string' && tile ? { tileId: tile, focus: true } : undefined
    const state = typeof event === 'string' ? stateForEvent(event) : undefined
    if (typeof tile !== 'string' || !tile || !state) return undefined
    // Stop also carries Claude Code's transcript_path, so main can read the result (KAO-33).
    return event === 'Stop' && typeof transcript === 'string'
      ? { tileId: tile, state, transcript }
      : { tileId: tile, state }
  } catch {
    return undefined
  }
}
