import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildLaunch, commandExists, hasTranscript, loginShellLaunch, validateSpawn, withResume } from './launch'

describe('loginShellLaunch', () => {
  it('runs the command via the login shell and quotes arguments', () => {
    expect(loginShellLaunch('/bin/bash', 'claude', ['--model', "it's"])).toEqual({
      file: '/bin/bash',
      args: ['-l', '-c', `exec 'claude' '--model' 'it'\\''s'`]
    })
  })
})

describe('commandExists', () => {
  it('asks the login shell and reports its answer', async () => {
    const exec = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await commandExists('/bin/zsh', 'claude', exec)).toBe(true)
    expect(await commandExists('/bin/zsh', 'nope', exec)).toBe(false)
    expect(exec).toHaveBeenCalledWith('/bin/zsh', ['-l', '-c', "command -v 'nope' >/dev/null"])
  })
  it('detects a missing command with a real shell', async () => {
    expect(await commandExists('/bin/bash', 'definitely-not-installed-xyz')).toBe(false)
    expect(await commandExists('/bin/bash', 'ls')).toBe(true)
  })
})

describe('validateSpawn', () => {
  const ok = { tileId: 't', cols: 80, rows: 24 }
  it('accepts good requests', () =>
    expect(validateSpawn({ ...ok, command: 'claude', args: ['-x'], cwd: '/tmp' })).toBeNull())
  it('rejects bad shapes', () => {
    expect(validateSpawn({ ...ok, command: 5 as never })).toBe('bad command')
    expect(validateSpawn({ ...ok, command: '  ' })).toBe('bad command')
    expect(validateSpawn({ ...ok, args: [1] as never })).toBe('bad args')
    expect(validateSpawn({ ...ok, cwd: {} as never })).toBe('bad cwd')
    expect(validateSpawn({ ...ok, cols: 0 })).toBe('bad size')
    expect(validateSpawn({ ...ok, shell: 'yes' as never })).toBe('bad shell')
  })
})

describe('buildLaunch', () => {
  it('returns null for no command (plain login shell)', () => {
    expect(buildLaunch('/bin/zsh', {})).toBeNull()
  })
  it('preset commands exec directly with quoted args and probe the command', () => {
    expect(buildLaunch('/bin/zsh', { command: 'claude', args: ['-r'] })).toEqual({
      file: '/bin/zsh',
      args: ['-l', '-c', `exec 'claude' '-r'`],
      probe: 'claude'
    })
  })
  it('custom shell strings pass through unsplit and probe the first word', () => {
    expect(buildLaunch('/bin/bash', { command: `grep "a b" f | wc -l`, shell: true })).toEqual({
      file: '/bin/bash',
      args: ['-lc', `grep "a b" f | wc -l`],
      probe: 'grep'
    })
  })
  it('does not probe shell strings that do not start with a plain command name', () => {
    for (const command of ['FOO=1 npm test', '"my cmd" x', '(cd /tmp && ls)', '$EDITOR', 'll']) {
      const probe = buildLaunch('/bin/bash', { command, shell: true })?.probe
      // `ll` is a plain word so it is probed; the rest are not.
      expect(probe).toBe(command === 'll' ? 'll' : null)
    }
  })
})

describe('withResume', () => {
  const base = { tileId: 't', cols: 80, rows: 24 }
  const yes = () => true
  it('adds --resume to claude tiles, plain or as a shell string', () => {
    expect(withResume({ ...base, command: 'claude', args: ['--model', 'opus'], resume: 'ab-1' }, yes)).toEqual({
      ...base,
      command: 'claude',
      args: ['--model', 'opus', '--resume', 'ab-1']
    })
    expect(withResume({ ...base, command: '/usr/bin/claude', resume: 'ab-1' }, yes).args).toEqual(['--resume', 'ab-1'])
    expect(withResume({ ...base, command: 'claude --model haiku', shell: true, resume: 'ab-1' }, yes).command).toBe(
      'claude --model haiku --resume ab-1'
    )
  })
  it('starts fresh when the transcript is gone, the id is bad, or the tile is not claude', () => {
    expect(withResume({ ...base, command: 'claude', resume: 'ab-1' }, () => false)).toEqual({
      ...base,
      command: 'claude'
    })
    expect(withResume({ ...base, command: 'claude', resume: 'a b' }, yes)).toEqual({ ...base, command: 'claude' })
    expect(withResume({ ...base, command: 'codex', resume: 'ab-1' }, yes)).toEqual({ ...base, command: 'codex' })
    expect(withResume({ ...base, resume: 'ab-1' }, yes)).toEqual(base)
  })
  it('rejects a bad resume id at the IPC boundary', () => {
    expect(validateSpawn({ ...base, resume: '$(rm -rf ~)' })).toBe('bad resume')
    expect(validateSpawn({ ...base, resume: 'ok-1' })).toBeNull()
  })
})

describe('hasTranscript', () => {
  it('finds a session in any project folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'projects-'))
    mkdirSync(join(root, '-home-u-repo'))
    writeFileSync(join(root, '-home-u-repo', 'ab-1.jsonl'), '')
    expect(hasTranscript(root, 'ab-1')).toBe(true)
    expect(hasTranscript(root, 'zz-9')).toBe(false)
    expect(hasTranscript(join(root, 'missing'), 'ab-1')).toBe(false)
  })
})
