import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import os from 'node:os'
import type { Preset } from '../shared/types'

export const DEFAULT_PRESETS: Preset[] = [
  { id: 'claude', name: 'Claude Code', command: 'claude' },
  { id: 'codex', name: 'Codex', command: 'codex' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini' },
  { id: 'shell', name: 'Shell' }
]

/** A file in the app's config folder, $XDG_CONFIG_HOME/agent-canvas (default ~/.config). */
export const configPath = (name: string) =>
  join(process.env.XDG_CONFIG_HOME || join(os.homedir(), '.config'), 'agent-canvas', name)

export const presetsPath = () => configPath('presets.json')

/** Keep valid entries, drop the rest. Returns null if the file isn't an array at all. */
export function parsePresets(raw: unknown): Preset[] | null {
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  const out: Preset[] = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue
    const { id, name, command, args, shell } = p as Record<string, unknown>
    if (typeof id !== 'string' || !id || seen.has(id) || typeof name !== 'string' || !name) continue
    if (command !== undefined && (typeof command !== 'string' || !command.trim())) continue
    if (args !== undefined && (!Array.isArray(args) || args.some((a) => typeof a !== 'string'))) continue
    if (shell !== undefined && typeof shell !== 'boolean') continue
    seen.add(id)
    out.push({
      id,
      name,
      ...(command ? { command } : {}),
      ...(args ? { args: args as string[] } : {}),
      ...(shell ? { shell } : {})
    })
  }
  return out
}

/** Reads the presets file; creates it with defaults if missing; falls back to defaults if broken (file left untouched). */
export function loadPresets(path = presetsPath()): Preset[] {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    try {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify(DEFAULT_PRESETS, null, 2) + '\n', { flag: 'wx' })
    } catch {
      /* read-only config dir: defaults still work */
    }
    return DEFAULT_PRESETS
  }
  try {
    const list = parsePresets(JSON.parse(text))
    return list?.length ? list : DEFAULT_PRESETS
  } catch {
    return DEFAULT_PRESETS
  }
}
