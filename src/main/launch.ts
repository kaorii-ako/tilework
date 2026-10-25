import { execFile } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { SpawnRequest } from '../shared/ipc'
import { SESSION_ID } from '../shared/status'

/** POSIX single-quote; also valid in fish. */
const q = (s: string) => `'${s.replaceAll("'", "'\\''")}'`

/**
 * Run command through the login shell so PATH additions from .profile/.zprofile apply
 * (Electron started from a desktop entry often lacks ~/.local/bin, nvm, brew...).
 */
export function loginShellLaunch(
  shell: string,
  command: string,
  args: string[] = []
): { file: string; args: string[] } {
  return { file: shell, args: ['-l', '-c', `exec ${[command, ...args].map(q).join(' ')}`] }
}

/**
 * How to spawn a request. null means "no command": PtyManager starts the login shell.
 * `probe` is the executable to check for before spawning (null: nothing sensible to check).
 * Shell strings run unsplit via `$SHELL -lc`; their first word is probed.
 */
export function buildLaunch(
  shell: string,
  req: Pick<SpawnRequest, 'command' | 'args' | 'shell'>
): { file: string; args: string[]; probe: string | null } | null {
  const { command } = req
  if (!command) return null
  if (req.shell) {
    // Skip the probe for things like `FOO=1 cmd`, `"quoted" x`, `(subshell)`, `$VAR`: not a plain command name.
    const first = command.trim().split(/\s+/)[0]
    return {
      file: shell,
      args: ['-lc', command],
      probe: /^[\w./+@-]+$/.test(first) && !first.includes('=') ? first : null
    }
  }
  return { ...loginShellLaunch(shell, command, req.args), probe: command }
}

/** True if some project under ~/.claude/projects has this session's transcript. */
export function hasTranscript(projectsDir: string, sessionId: string): boolean {
  try {
    return readdirSync(projectsDir).some((d) => existsSync(join(projectsDir, d, `${sessionId}.jsonl`)))
  } catch {
    return false
  }
}

/**
 * Add `--resume <id>` to a Claude Code tile when its session can still be resumed (KAO-48).
 * Anything else, or a session whose transcript is gone, starts as usual. `resume` never reaches the PTY.
 */
export function withResume(req: SpawnRequest, exists: (id: string) => boolean): SpawnRequest {
  const { resume, ...rest } = req
  if (!resume || !SESSION_ID.test(resume) || !rest.command) return rest
  if (rest.shell) {
    const first = rest.command.trim().split(/\s+/)[0]
    return basename(first) === 'claude' && exists(resume)
      ? { ...rest, command: `${rest.command} --resume ${resume}` }
      : rest
  }
  return basename(rest.command) === 'claude' && exists(resume)
    ? { ...rest, args: [...(rest.args ?? []), '--resume', resume] }
    : rest
}

type Run = (file: string, args: string[]) => Promise<boolean>

const run: Run = (file, args) =>
  new Promise((resolve) => execFile(file, args, { timeout: 5000 }, (err) => resolve(!err)))

/** True if the login shell can resolve `command`. */
export function commandExists(shell: string, command: string, exec: Run = run): Promise<boolean> {
  return exec(shell, ['-l', '-c', `command -v ${q(command)} >/dev/null`])
}

export const missingCommandMessage = (command: string) =>
  `\x1b[31mCommand not found: ${command}\x1b[0m\r\nInstall it, or fix its path in ~/.config/agent-canvas/presets.json.\r\n`

export const badCwdMessage = (cwd: string) => `\x1b[31mFolder not found: ${cwd}\x1b[0m\r\n`

/** Renderer is untrusted: check shapes before anything reaches a PTY. Returns an error string or null. */
export function validateSpawn(req: SpawnRequest): string | null {
  if (
    req.command !== undefined &&
    (typeof req.command !== 'string' || !req.command.trim() || req.command.length > 1000)
  )
    return 'bad command'
  if (req.shell !== undefined && typeof req.shell !== 'boolean') return 'bad shell'
  if (req.resume !== undefined && (typeof req.resume !== 'string' || !SESSION_ID.test(req.resume))) return 'bad resume'
  if (
    req.args !== undefined &&
    (!Array.isArray(req.args) ||
      req.args.length > 100 ||
      req.args.some((a) => typeof a !== 'string' || a.length > 1000))
  )
    return 'bad args'
  if (req.cwd !== undefined && (typeof req.cwd !== 'string' || req.cwd.length > 4096)) return 'bad cwd'
  if (!Number.isInteger(req.cols) || !Number.isInteger(req.rows) || req.cols < 1 || req.rows < 1) return 'bad size'
  return null
}

export const isDirectory = (p: string): boolean => {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}
