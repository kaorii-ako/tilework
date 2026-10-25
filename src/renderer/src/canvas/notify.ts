import type { AgentState } from '../../../shared/status'

const KEY = 'agent-canvas.notify'

/** What to tell the user when a tile's state changes, or null for nothing (KAO-49). */
export function notifyText(prev: AgentState | undefined, next: AgentState, title: string): string | null {
  // Only changes out of "working" count: Claude's idle reminder also fires Notification a minute after Stop.
  if (prev !== 'working') return null
  if (next === 'needs-input') return `${title} needs you`
  if (next === 'idle') return `${title} is done`
  return null
}

export function notifyEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

export function setNotifyEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* stays on */
  }
}
