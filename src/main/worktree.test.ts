import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createWorktree } from './worktree'

const sh = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-C', cwd, ...args])
    .toString()
    .trim()

describe('createWorktree', () => {
  it('adds ../<repo>-<id> on a new tilework/<id> branch', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'wt-')))
    const repo = join(root, 'app')
    execFileSync('git', ['init', '-q', repo])
    writeFileSync(join(repo, 'a.txt'), 'a')
    sh(repo, 'add', '.')
    sh(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init')
    const r = await createWorktree(repo, 'x1')
    expect(r).toEqual({ ok: true, path: join(root, 'app-x1'), branch: 'tilework/x1' })
    expect(existsSync(join(root, 'app-x1', 'a.txt'))).toBe(true)
    expect(sh(join(root, 'app-x1'), 'branch', '--show-current')).toBe('tilework/x1')
  })
  it('says so when the folder is not a repo, missing, or not a string', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'plain-'))
    expect(await createWorktree(plain)).toEqual({ ok: false, error: 'That folder isn’t in a git repo.' })
    expect(await createWorktree(join(plain, 'nope'))).toEqual({ ok: false, error: 'Pick a folder first.' })
    expect(await createWorktree('relative/path')).toEqual({ ok: false, error: 'Pick a folder first.' })
    expect(await createWorktree(42)).toEqual({ ok: false, error: 'Pick a folder first.' })
  })
})
