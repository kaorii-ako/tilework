import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Link, Tile, Workspace } from '../shared/types'

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max

function parseTile(t: any): Tile | null {
  if (!t || !str(t.id, 199) || !t.id || !str(t.title, 500)) return null
  if (![t.x, t.y, t.w, t.h].every(num) || t.w <= 0 || t.h <= 0) return null
  if (t.command !== undefined && !str(t.command, 4096)) return null
  if (t.cwd !== undefined && !str(t.cwd, 4096)) return null
  if (t.presetId !== undefined && !str(t.presetId, 200)) return null
  if (t.shell !== undefined && typeof t.shell !== 'boolean') return null
  if (
    t.args !== undefined &&
    !(Array.isArray(t.args) && t.args.length <= 256 && t.args.every((a: unknown) => str(a, 4096)))
  )
    return null
  const tile: Tile = { id: t.id, title: t.title, x: t.x, y: t.y, w: t.w, h: t.h }
  if (t.command !== undefined) tile.command = t.command
  if (t.cwd !== undefined) tile.cwd = t.cwd
  if (t.args !== undefined) tile.args = t.args
  if (t.shell !== undefined) tile.shell = t.shell
  if (t.presetId !== undefined) tile.presetId = t.presetId
  return tile
}

/**
 * Keep only well-formed links between tiles that exist, without self-links or duplicate
 * A→B pairs. A bad link is dropped, not fatal: losing a line beats losing the layout.
 */
export function parseLinks(raw: unknown, tiles: Tile[]): Link[] {
  if (!Array.isArray(raw)) return []
  const ids = new Set(tiles.map((t) => t.id))
  const seen = new Set<string>()
  const links: Link[] = []
  for (const l of raw.slice(0, 2000) as any[]) {
    if (!l || !str(l.id, 199) || !l.id || (l.mode !== 'manual' && l.mode !== 'auto')) continue
    const { fromTileId: from, toTileId: to } = l
    if (!ids.has(from) || !ids.has(to) || from === to) continue
    const key = JSON.stringify([from, to])
    if (seen.has(key)) continue
    seen.add(key)
    links.push({ id: l.id, fromTileId: from, toTileId: to, mode: l.mode })
  }
  return links
}

/** Validate untrusted data (file or renderer). Returns null if the shape is wrong. */
export function parseWorkspace(raw: any): Workspace | null {
  const v = raw?.viewport
  if (raw?.version !== 1 || !v || ![v.x, v.y, v.zoom].every(num) || v.zoom <= 0) return null
  if (!Array.isArray(raw.tiles) || raw.tiles.length > 500) return null
  const tiles: Tile[] = []
  for (const t of raw.tiles) {
    const tile = parseTile(t)
    if (!tile) return null
    tiles.push(tile)
  }
  return { version: 1, viewport: { x: v.x, y: v.y, zoom: v.zoom }, tiles, links: parseLinks(raw.links, tiles) }
}

export class WorkspaceStore {
  private pending: Workspace | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private path: string,
    private delayMs = 500
  ) {}

  /** Saved workspace, or null if missing/corrupt. A corrupt file is moved to <path>.bak. */
  load(): Workspace | null {
    let text: string
    try {
      text = readFileSync(this.path, 'utf8')
    } catch {
      return null // missing (first run)
    }
    try {
      const ws = parseWorkspace(JSON.parse(text))
      if (ws) return ws
    } catch {
      /* fall through to backup */
    }
    try {
      renameSync(this.path, this.path + '.bak')
    } catch {
      /* nothing more we can do; start empty */
    }
    return null
  }

  /** Debounced save: writes delayMs after the last call. */
  schedule(ws: Workspace): void {
    this.pending = ws
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), this.delayMs)
  }

  /** Write any pending workspace now (used on quit). Atomic via temp file + rename. */
  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.pending) return
    const ws = this.pending
    this.pending = null
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      writeFileSync(this.path + '.tmp', JSON.stringify(ws, null, 2))
      renameSync(this.path + '.tmp', this.path)
    } catch (err) {
      console.error('workspace save failed', err)
    }
  }
}
