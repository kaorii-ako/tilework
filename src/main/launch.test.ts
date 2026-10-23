import { describe, expect, it, vi } from 'vitest'
import { buildLaunch, commandExists, loginShellLaunch, validateSpawn } from './launch'

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
