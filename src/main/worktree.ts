import { execFile } from 'node:child_process'
import { basename, dirname, isAbsolute, join } from 'node:path'
import type { WorktreeResult } from '../shared/ipc'
import { isDirectory } from './launch'

const git = (cwd: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) =>
    execFile('git', ['-C', cwd, ...args], { timeout: 20_000 }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout.trim())
    )
  )

/**
 * Give a tile its own git worktree next to the repo (KAO-50): `../<repo>-<id>` on a new
 * branch `tilework/<id>`. `folder` comes from the untrusted renderer, so it is checked first,
 * and git runs without a shell.
 */
export async function createWorktree(folder: unknown, id = Date.now().toString(36)): Promise<WorktreeResult> {
  if (typeof folder !== 'string' || !isAbsolute(folder) || folder.length > 4096 || !isDirectory(folder))
    return { ok: false, error: 'Pick a folder first.' }
  try {
    const top = await git(folder, ['rev-parse', '--show-toplevel'])
    const path = join(dirname(top), `${basename(top)}-${id}`)
    const branch = `tilework/${id}`
    await git(top, ['worktree', 'add', '-b', branch, path])
    return { ok: true, path, branch }
  } catch (e) {
    const msg = (e as Error).message
    return {
      ok: false,
      error: /not a git repository/i.test(msg) ? 'That folder isn’t in a git repo.' : msg.split('\n').pop()!
    }
  }
}
