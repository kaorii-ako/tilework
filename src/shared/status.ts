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
export function parseStatusLine(line: string): { tileId: string; state: AgentState } | undefined {
  try {
    const { tile, event } = JSON.parse(line)
    const state = typeof event === 'string' ? stateForEvent(event) : undefined
    return typeof tile === 'string' && tile && state ? { tileId: tile, state } : undefined
  } catch {
    return undefined
  }
}
