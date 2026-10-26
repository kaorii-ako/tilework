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
    { id: 'a', title: 'claude', command: 'claude', cwd: '/tmp', sessionId: 'f3a1-77', x: 0, y: 0, w: 600, h: 400 },
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
  ],
  links: [
    { id: 'l1', fromTileId: 'a', toTileId: 'b', mode: 'manual' },
    { id: 'l2', fromTileId: 'b', toTileId: 'c', mode: 'auto' }
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

  it('loads a file saved before links existed as links: []', () => {
    const { links: _, ...old } = ws
    expect(parseWorkspace(old)).toEqual({ ...ws, links: [] })
  })

  it('drops links to missing tiles, self-links, duplicates and malformed links', () => {
    const l = (id: string, fromTileId: string, toTileId: string, mode: unknown = 'manual') => ({
      id,
      fromTileId,
      toTileId,
      mode
    })
    const parsed = parseWorkspace({
      ...ws,
      links: [
        l('ok', 'a', 'b'),
        l('gone', 'a', 'zzz'),
        l('self', 'a', 'a'),
        l('dup', 'a', 'b'),
        l('mode', 'b', 'a', 'sometimes'),
        { fromTileId: 'b', toTileId: 'c', mode: 'manual' },
        null
      ]
    })
    expect(parsed?.links.map((x) => x.id)).toEqual(['ok'])
    expect(parsed?.tiles).toEqual(ws.tiles)
  })

  it('keeps link instructions, and drops blank or oversized ones', () => {
    const l = (id: string, from: string, to: string, instruction: unknown) => ({
      id,
      fromTileId: from,
      toTileId: to,
      mode: 'manual',
      instruction
    })
    const parsed = parseWorkspace({
      ...ws,
      links: [l('k', 'a', 'b', 'Review this'), l('blank', 'a', 'c', '  '), l('big', 'b', 'c', 'x'.repeat(5000))]
    })
    expect(parsed?.links).toEqual([
      { id: 'k', fromTileId: 'a', toTileId: 'b', mode: 'manual', instruction: 'Review this' },
      { id: 'blank', fromTileId: 'a', toTileId: 'c', mode: 'manual' },
      { id: 'big', fromTileId: 'b', toTileId: 'c', mode: 'manual' }
    ])
  })
})

describe('sessionId', () => {
  it('drops a malformed session id but keeps the tile', () => {
    const parsed = parseWorkspace({ ...ws, tiles: [{ ...ws.tiles[0], sessionId: '../../etc' }] })
    expect(parsed?.tiles[0].sessionId).toBeUndefined()
    expect(parsed?.tiles[0].id).toBe('a')
  })
})

describe('dynamic workflow fields (KAO-52)', () => {
  it('keeps join, router, workerOf, when, otherwise and split', () => {
    const flow: Workspace = {
      ...ws,
      tiles: [
        { ...ws.tiles[0], router: true },
        { ...ws.tiles[1], join: true },
        { ...ws.tiles[2], workerOf: 'c' }
      ],
      links: [
        { id: 'l1', fromTileId: 'a', toTileId: 'b', mode: 'manual', when: 'APPROVED', split: true },
        { id: 'l2', fromTileId: 'a', toTileId: 'c', mode: 'auto', otherwise: true }
      ]
    }
    expect(parseWorkspace(JSON.parse(JSON.stringify(flow)))).toEqual(flow)
  })

  it('drops bad flag values instead of the tile or link', () => {
    const parsed = parseWorkspace({
      ...ws,
      tiles: [{ ...ws.tiles[0], join: 'yes', router: 1, workerOf: 5 }, ws.tiles[1], ws.tiles[2]],
      links: [{ id: 'l1', fromTileId: 'a', toTileId: 'b', mode: 'manual', when: '   ', otherwise: 'x', split: 1 }]
    })
    expect(parsed?.tiles[0]).toEqual(ws.tiles[0])
    expect(parsed?.links).toEqual([{ id: 'l1', fromTileId: 'a', toTileId: 'b', mode: 'manual' }])
  })
})
