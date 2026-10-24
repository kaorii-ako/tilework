import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HOOK_EVENTS, installHook, isHookInstalled, mergeHook } from './hook-install'

// Shaped like a real settings.json with other tools' hooks in it.
const theirs = {
  model: 'opus',
  enabledPlugins: { 'x@y': true },
  hooks: {
    SessionStart: [
      { matcher: 'startup|resume', hooks: [{ type: 'command', command: '/bin/jcode setup-hotkey' }] },
      { hooks: [{ type: 'command', command: '/bin/mimori-hook --agent claude-code' }] }
    ],
    Stop: [{ hooks: [{ type: 'command', command: '/bin/mimori-hook --agent claude-code' }] }],
    PostToolUse: [{ hooks: [{ type: 'command', command: '/bin/mimori-hook --agent claude-code' }] }]
  }
}

describe('mergeHook', () => {
  it('adds our hook to every event and keeps everything else as it was', () => {
    const merged = mergeHook(theirs, '/home/u/.config/agent-canvas/hooks/agent-canvas-hook.sh')
    expect(isHookInstalled(theirs)).toBe(false)
    expect(isHookInstalled(merged)).toBe(true)
    expect(merged.model).toBe('opus')
    expect(merged.enabledPlugins).toEqual(theirs.enabledPlugins)
    const hooks = merged.hooks as Record<string, unknown[]>
    // Existing groups untouched and first; ours appended.
    expect(hooks.SessionStart.slice(0, 2)).toEqual(theirs.hooks.SessionStart)
    expect(hooks.SessionStart).toHaveLength(3)
    expect(hooks.PostToolUse).toEqual(theirs.hooks.PostToolUse)
    expect(hooks.Stop.at(-1)).toEqual({
      hooks: [{ type: 'command', command: "'/home/u/.config/agent-canvas/hooks/agent-canvas-hook.sh' Stop" }]
    })
    for (const e of HOOK_EVENTS) expect(hooks[e]).toBeDefined()
  })

  it('is idempotent and recognises an install from any path', () => {
    const once = mergeHook(theirs, '/a/agent-canvas-hook.sh')
    expect(mergeHook(once, '/b/agent-canvas-hook.sh')).toEqual(once)
  })

  it('works on an empty file', () => {
    expect(isHookInstalled(mergeHook({}, '/a/agent-canvas-hook.sh'))).toBe(true)
  })
})

describe('installHook', () => {
  const setup = (settings?: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'hook-install-'))
    const src = join(dir, 'src.sh')
    writeFileSync(src, '#!/bin/sh\n')
    const path = join(dir, '.claude', 'settings.json')
    if (settings !== undefined) {
      mkdirSync(join(dir, '.claude'))
      writeFileSync(path, settings)
    }
    return { dir, src, path, dest: join(dir, 'config', 'hooks', 'agent-canvas-hook.sh') }
  }

  it('backs up settings.json, merges, and copies an executable script', () => {
    const original = JSON.stringify(theirs, null, 4)
    const { src, path, dest } = setup(original)
    installHook(path, src, dest)
    expect(readFileSync(path + '.bak', 'utf8')).toBe(original)
    const after = JSON.parse(readFileSync(path, 'utf8'))
    expect(isHookInstalled(after)).toBe(true)
    expect(after.hooks.Stop[0]).toEqual(theirs.hooks.Stop[0])
    expect(statSync(dest).mode & 0o111).toBeTruthy()
  })

  it('creates settings.json when there is none', () => {
    const { src, path, dest } = setup()
    installHook(path, src, dest)
    expect(isHookInstalled(JSON.parse(readFileSync(path, 'utf8')))).toBe(true)
  })

  it('refuses to touch a settings.json that is not valid JSON', () => {
    const { src, path, dest } = setup('{ broken')
    expect(() => installHook(path, src, dest)).toThrow()
    expect(readFileSync(path, 'utf8')).toBe('{ broken')
  })
})
