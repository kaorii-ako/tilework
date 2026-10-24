import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** The Claude Code events the status hook listens to (docs/STATUS-HOOKS.md). */
export const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'Notification', 'Stop', 'SessionEnd']
const MARK = 'agent-canvas-hook.sh'

type Settings = Record<string, unknown> & { hooks?: Record<string, unknown> }
interface Group {
  matcher?: string
  hooks?: { type?: string; command?: string }[]
}

const groups = (settings: Settings, event: string): Group[] => {
  const g = settings.hooks?.[event]
  return Array.isArray(g) ? g : []
}
const hasOurs = (settings: Settings, event: string) =>
  groups(settings, event).some((g) => g?.hooks?.some((h) => typeof h?.command === 'string' && h.command.includes(MARK)))

/** True when every event already runs our hook (any path to it counts). */
export const isHookInstalled = (settings: Settings): boolean => HOOK_EVENTS.every((e) => hasOurs(settings, e))

const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`

/**
 * `settings` with our hook added to each event that doesn't run it yet. Appends one matcher group
 * per event and leaves every other key, event and hook exactly as it was.
 */
export function mergeHook(settings: Settings, scriptPath: string): Settings {
  const hooks: Record<string, unknown> = { ...settings.hooks }
  for (const event of HOOK_EVENTS) {
    if (hasOurs(settings, event)) continue
    hooks[event] = [
      ...groups(settings, event),
      { hooks: [{ type: 'command', command: `${quote(scriptPath)} ${event}` }] }
    ]
  }
  return { ...settings, hooks }
}

/** Parsed settings.json; {} if it doesn't exist. Throws if it exists but isn't a JSON object. */
export function readSettings(path: string): Settings {
  if (!existsSync(path)) return {}
  const v = JSON.parse(readFileSync(path, 'utf8'))
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${path} is not a JSON object`)
  return v
}

/**
 * Copy the hook script to `scriptDest` (a stable place outside the app, so it survives moving or
 * updating the app), back up settings.json to settings.json.bak, then write the merged settings
 * atomically. A settings.json that isn't valid JSON is left alone and the error is thrown.
 */
export function installHook(settingsPath: string, scriptSrc: string, scriptDest: string): void {
  const settings = readSettings(settingsPath)
  copyScript(scriptSrc, scriptDest)
  if (isHookInstalled(settings)) return
  mkdirSync(dirname(settingsPath), { recursive: true })
  if (existsSync(settingsPath)) copyFileSync(settingsPath, settingsPath + '.bak')
  const tmp = settingsPath + '.agent-canvas.tmp'
  writeFileSync(tmp, JSON.stringify(mergeHook(settings, scriptDest), null, 2) + '\n')
  renameSync(tmp, settingsPath)
}

/** Install or refresh the hook script, executable. Called on every launch so it follows app updates. */
export function copyScript(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
  chmodSync(dest, 0o755)
}
