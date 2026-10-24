import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceStore, parseWorkspace } from './workspace-store'
import type { Workspace } from '../shared/types'

const ws: Workspace = {
  version: 1,
  viewport: { x: -40, y: 12.5, zoom: 0.75 },
  tiles: [
    { id: 'a', title: 'claude', command: 'claude', cwd: '/tmp', x: 0, y: 0, w: 600, h: 400 },
    {
      id: 'c',
      title: 'codex',
      command: 'codex --fast "x y"',
      args: ['--a', 'b c'],
      shell: true,
      presetId: 'codex',
      cwd: '/home',
      x: 5,
      y: 6,
      w: 400,
      h: 300
    },
    { id: 'b', title: 'shell', x: 620, y: 10, w: 500, h: 300 }
  ]
}

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ws-test-'))
  file = join(dir, 'sub', 'workspace.json')
})
afterEach(() => {
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

describe('WorkspaceStore', () => {
  it('round-trips through save and load', () => {
    const s = new WorkspaceStore(file)
    s.schedule(ws)
    s.flush()
    expect(new WorkspaceStore(file).load()).toEqual(ws)
  })

  it('returns null when no file exists', () => {
    expect(new WorkspaceStore(file).load()).toBeNull()
  })

  it.each([
    ['invalid JSON', '{nope'],
    ['wrong shape', JSON.stringify({ version: 1, viewport: { x: 0, y: 0, zoom: 1 }, tiles: [{ id: 'x' }] })]
  ])('backs up a corrupt file (%s) and starts empty', (_n, content) => {
    const s = new WorkspaceStore(file)
    s.schedule(ws)
    s.flush() // creates the directory
    writeFileSync(file, content)
    expect(s.load()).toBeNull()
    expect(existsSync(file)).toBe(false)
    expect(readFileSync(file + '.bak', 'utf8')).toBe(content)
  })

  it('debounces writes and flush writes immediately', () => {
    vi.useFakeTimers()
    const s = new WorkspaceStore(file, 500)
    s.schedule({ ...ws, tiles: [] })
    vi.advanceTimersByTime(400)
    s.schedule(ws)
    vi.advanceTimersByTime(400)
    expect(existsSync(file)).toBe(false)
    vi.advanceTimersByTime(100)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(ws)
    s.schedule({ ...ws, tiles: [] })
    s.flush()
    expect(JSON.parse(readFileSync(file, 'utf8')).tiles).toEqual([])
  })

  it.each([
    ['args not an array', { args: 'x' }],
    ['args with a non-string', { args: ['a', 1] }],
    ['shell not boolean', { shell: 'yes' }],
    ['presetId not a string', { presetId: 3 }]
  ])('rejects a tile with %s', (_n, extra) => {
    const bad = { ...ws, tiles: [{ ...ws.tiles[0], ...extra }] }
    expect(parseWorkspace(bad)).toBeNull()
  })
})
