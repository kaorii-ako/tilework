import type { Link, Tile } from './types'

/** Longest link instruction kept; a sentence or two, not a document. */
export const MAX_INSTRUCTION = 2000
/** Longest link condition kept: a word or short phrase to look for in the result (KAO-52). */
export const MAX_WHEN = 200

/** One tile of a workflow. Position and size are relative to the workflow's top-left. */
export interface WorkflowTile {
  key: string
  title: string
  command?: string
  args?: string[]
  shell?: boolean
  /** Shorthand for claude: appends `--model <model>` to args. */
  model?: string
  /** Start this tile in its own git worktree (KAO-50), so parallel builders don't share a checkout. */
  worktree?: boolean
  /** See Tile.join and Tile.router (KAO-52). */
  join?: true
  router?: true
  x: number
  y: number
  w: number
  h: number
}

export interface WorkflowLink {
  from: string
  to: string
  instruction: string
  mode: Link['mode']
  /** See Link.when, Link.otherwise and Link.split (KAO-52). */
  when?: string
  otherwise?: true
  split?: true
}

/** A preset set of tiles and links (KAO-35). Built-ins ship with the app; custom ones live in workflows.json. */
export interface Workflow {
  id: string
  name: string
  description: string
  tiles: WorkflowTile[]
  links: WorkflowLink[]
  /** Sent with the goal to the first tile, e.g. "answer with a numbered task list" (KAO-52). */
  brief?: string
  builtIn?: true
}

const W = 600
const H = 420
const GAP = 320 // room for the line and its instruction chip, even zoomed to fit three tiles
/** The i-th tile of a left-to-right row running `claude --model <model>`. */
const claude = (key: string, title: string, model: string, i: number): WorkflowTile => ({
  key,
  title,
  command: 'claude',
  model,
  x: i * (W + GAP),
  y: 0,
  w: W,
  h: H
})
/** The i-th of `n` tiles stacked in a column at `col`, centred on a row tile's height. */
const stacked = (t: WorkflowTile, col: number, i: number, n: number): WorkflowTile => ({
  ...t,
  x: col * (W + GAP),
  y: i * (H + GAP / 4) - ((n - 1) * (H + GAP / 4)) / 2
})
const manual = (from: string, to: string, instruction: string, extra: Partial<WorkflowLink> = {}): WorkflowLink => ({
  from,
  to,
  instruction,
  mode: 'manual',
  ...extra
})
/** Ends a review so the next link can route on it (KAO-52). */
const VERDICT = 'End your reply with one line: APPROVED or CHANGES REQUESTED.'

export const BUILTIN_WORKFLOWS: Workflow[] = [
  {
    id: 'plan-build-review',
    name: 'Plan → Build → Review',
    description: 'A planner writes the plan, a builder implements it, a reviewer checks the change.',
    builtIn: true,
    tiles: [
      claude('plan', 'Planner', 'opus', 0),
      claude('build', 'Builder', 'sonnet', 1),
      claude('review', 'Reviewer', 'opus', 2)
    ],
    links: [
      manual('plan', 'build', "Implement this plan. Ask if anything's unclear."),
      manual('build', 'review', "Review this change for bugs, missing tests and anything that doesn't match the plan.")
    ]
  },
  {
    id: 'plan-fan-out-review',
    name: 'Plan → 3 Builders → Review',
    description:
      'Ask the planner to split the work into 3 parts. Each builder takes one part on its own git branch, then one reviewer checks them all.',
    builtIn: true,
    tiles: [
      claude('plan', 'Planner', 'opus', 0),
      ...[1, 2, 3].map((n, i) =>
        stacked({ ...claude(`build${n}`, `Builder ${n}`, 'sonnet', 0), worktree: true }, 1, i, 3)
      ),
      claude('review', 'Reviewer', 'opus', 2)
    ],
    links: [
      ...[1, 2, 3].map((n) =>
        manual(
          'plan',
          `build${n}`,
          `Do only part ${n} of this plan, in this worktree, and commit it. Ask if anything's unclear.`
        )
      ),
      ...[1, 2, 3].map((n) =>
        manual(
          `build${n}`,
          'review',
          `Builder ${n} finished its part on its own branch (see git worktree list). Review that branch against the plan for bugs and missing tests.`
        )
      )
    ]
  },
  {
    id: 'build-review',
    name: 'Build ↔ Review',
    description:
      'Build, get a review, fix what it found, until the reviewer says APPROVED. Turn on Auto-send to let it loop by itself.',
    builtIn: true,
    tiles: [claude('build', 'Builder', 'sonnet', 0), claude('review', 'Reviewer', 'sonnet', 1)],
    links: [
      manual('build', 'review', `Review this for bugs. ${VERDICT}`),
      manual('review', 'build', 'Fix what this review found.', { when: 'CHANGES REQUESTED' })
    ]
  },
  {
    id: 'parallel-build',
    name: 'Plan → Parallel build → Review',
    description:
      'The planner splits the work into tasks, one builder per task works in parallel, and the reviewer checks them together until APPROVED.',
    builtIn: true,
    brief: 'Plan this as a numbered list of independent tasks that can be built in parallel, one task per item.',
    tiles: [
      claude('plan', 'Planner', 'opus', 0),
      claude('build', 'Builder', 'sonnet', 1),
      { ...claude('review', 'Reviewer', 'opus', 2), join: true }
    ],
    links: [
      manual('plan', 'build', "Do your task. Ask if anything's unclear.", { split: true }),
      manual('build', 'review', `Review these changes together for bugs and gaps. ${VERDICT}`),
      manual('review', 'build', 'Fix what this review found.', { when: 'CHANGES REQUESTED' })
    ]
  },
  {
    id: 'triage',
    name: 'Triage → Fix / Research / Write',
    description: 'A triager reads the request and routes it to the right specialist, so the path changes each time.',
    builtIn: true,
    tiles: [
      { ...claude('triage', 'Triager', 'sonnet', 0), router: true, y: H + GAP / 2 }, // level with the middle choice
      claude('fix', 'Fixer', 'sonnet', 1),
      { ...claude('research', 'Researcher', 'sonnet', 1), y: H + GAP / 2 },
      { ...claude('write', 'Writer', 'sonnet', 1), y: 2 * (H + GAP / 2) }
    ],
    links: [
      manual('triage', 'fix', 'Fix this bug and run the tests.'),
      manual('triage', 'research', 'Research this and report what you find.'),
      manual('triage', 'write', 'Write this up clearly and briefly.')
    ]
  },
  {
    id: 'research-write',
    name: 'Research → Write',
    description: 'A researcher digs in, a writer turns the findings into a short write-up.',
    builtIn: true,
    tiles: [claude('research', 'Researcher', 'sonnet', 0), claude('write', 'Writer', 'sonnet', 1)],
    links: [manual('research', 'write', 'Turn these findings into a clear, short write-up.')]
  },
  {
    id: 'quick-fix',
    name: 'Quick fix',
    description: 'A fixer makes the change, a cheap checker runs the tests and lint.',
    builtIn: true,
    tiles: [claude('fix', 'Fixer', 'sonnet', 0), claude('check', 'Checker', 'haiku', 1)],
    links: [manual('fix', 'check', 'Run the tests and lint, and report anything that fails.')]
  }
]

const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function parseTile(t: any): WorkflowTile | null {
  if (!t || !str(t.key, 100) || !t.key || !str(t.title, 200) || !t.title) return null
  if (![t.x, t.y, t.w, t.h].every(num) || t.w <= 0 || t.h <= 0) return null
  if (t.command !== undefined && !(str(t.command, 1000) && t.command.trim())) return null
  if (
    t.args !== undefined &&
    !(Array.isArray(t.args) && t.args.length <= 100 && t.args.every((a: unknown) => str(a, 1000)))
  )
    return null
  if (t.shell !== undefined && typeof t.shell !== 'boolean') return null
  if (t.model !== undefined && !(str(t.model, 100) && /^[\w.:-]+$/.test(t.model))) return null
  if (t.worktree !== undefined && typeof t.worktree !== 'boolean') return null
  if ((t.join !== undefined && t.join !== true) || (t.router !== undefined && t.router !== true)) return null
  const tile: WorkflowTile = { key: t.key, title: t.title, x: t.x, y: t.y, w: t.w, h: t.h }
  for (const k of ['command', 'args', 'shell', 'model', 'worktree', 'join', 'router'] as const)
    if (t[k] !== undefined) (tile as any)[k] = t[k]
  return tile
}

/** One workflow from untrusted data (workflows.json, or the renderer), or null if malformed. */
export function parseWorkflow(w: any): Workflow | null {
  if (!w || !str(w.id, 100) || !w.id || !str(w.name, 200) || !w.name.trim() || !str(w.description, 500)) return null
  if (!Array.isArray(w.tiles) || !w.tiles.length || w.tiles.length > 50) return null
  const tiles: WorkflowTile[] = []
  for (const t of w.tiles) {
    const tile = parseTile(t)
    if (!tile || tiles.some((o) => o.key === tile.key)) return null
    tiles.push(tile)
  }
  if (!Array.isArray(w.links) || w.links.length > 200) return null
  const keys = new Set(tiles.map((t) => t.key))
  const links: WorkflowLink[] = []
  for (const l of w.links) {
    if (!l || !keys.has(l.from) || !keys.has(l.to) || l.from === l.to) return null
    if (!str(l.instruction, MAX_INSTRUCTION) || (l.mode !== 'manual' && l.mode !== 'auto')) return null
    if (links.some((o) => o.from === l.from && o.to === l.to)) return null
    if (l.when !== undefined && !(str(l.when, MAX_WHEN) && l.when.trim())) return null
    if ((l.otherwise !== undefined && l.otherwise !== true) || (l.split !== undefined && l.split !== true)) return null
    if (l.when && l.otherwise) return null
    const link: WorkflowLink = { from: l.from, to: l.to, instruction: l.instruction, mode: l.mode }
    for (const k of ['when', 'otherwise', 'split'] as const) if (l[k] !== undefined) (link as any)[k] = l[k]
    links.push(link)
  }
  if (w.brief !== undefined && !str(w.brief, MAX_INSTRUCTION)) return null
  const wf: Workflow = { id: w.id, name: w.name, description: w.description, tiles, links }
  if (w.brief?.trim()) wf.brief = w.brief.trim()
  return wf
}

/** Custom workflows: keeps the valid ones, drops the rest (and any that claim a built-in id). */
export function parseWorkflows(raw: unknown): Workflow[] {
  if (!Array.isArray(raw)) return []
  const out: Workflow[] = []
  for (const w of raw.slice(0, 200)) {
    const wf = parseWorkflow(w)
    if (wf && !BUILTIN_WORKFLOWS.some((b) => b.id === wf.id) && !out.some((o) => o.id === wf.id)) out.push(wf)
  }
  return out
}

/**
 * Real tiles and links for `wf`, with fresh ids, every tile in `cwd`, the top-left at `origin`.
 * Links copy their instruction and mode.
 */
export function instantiateWorkflow(
  wf: Workflow,
  cwd: string | undefined,
  origin: { x: number; y: number },
  newId: () => string = () => crypto.randomUUID()
): { tiles: Tile[]; links: Link[]; worktree: Set<string> } {
  const ids = new Map(wf.tiles.map((t) => [t.key, newId()]))
  const tiles = wf.tiles.map((t): Tile => {
    const args = t.model ? [...(t.args ?? []), '--model', t.model] : t.args
    const tile: Tile = { id: ids.get(t.key)!, title: t.title, x: origin.x + t.x, y: origin.y + t.y, w: t.w, h: t.h }
    if (t.command) tile.command = t.command
    if (args) tile.args = args
    if (t.shell) tile.shell = true
    if (t.join) tile.join = true
    if (t.router) tile.router = true
    if (cwd) tile.cwd = cwd
    return tile
  })
  const links = wf.links.map((l): Link => ({
    id: newId(),
    fromTileId: ids.get(l.from)!,
    toTileId: ids.get(l.to)!,
    mode: l.mode, // built-ins are all manual; a saved workflow keeps what was opted into
    ...(l.instruction.trim() && { instruction: l.instruction }),
    ...(l.when && { when: l.when }),
    ...(l.otherwise && { otherwise: true as const }),
    ...(l.split && { split: true as const })
  }))
  const worktree = new Set(wf.tiles.filter((t) => t.worktree).map((t) => ids.get(t.key)!))
  return { tiles, links, worktree }
}

/** The current canvas as a custom workflow: tiles keep their commands and relative layout, links their instructions. */
export function workflowFromCanvas(name: string, allTiles: Tile[], links: Link[], id: string): Workflow {
  // Split workers are made at run time; a saved workflow re-creates them when it runs.
  const tiles = allTiles.filter((t) => !t.workerOf)
  const x0 = Math.min(...tiles.map((t) => t.x))
  const y0 = Math.min(...tiles.map((t) => t.y))
  const keys = new Map(tiles.map((t, i) => [t.id, `t${i + 1}`]))
  return {
    id,
    name,
    description: tiles.map((t) => t.title).join(' → '),
    tiles: tiles.map((t) => {
      const wt: WorkflowTile = { key: keys.get(t.id)!, title: t.title, x: t.x - x0, y: t.y - y0, w: t.w, h: t.h }
      if (t.command) wt.command = t.command
      if (t.args) wt.args = t.args
      if (t.shell) wt.shell = true
      if (t.branch) wt.worktree = true
      if (t.join) wt.join = true
      if (t.router) wt.router = true
      return wt
    }),
    links: links
      .filter((l) => keys.has(l.fromTileId) && keys.has(l.toTileId))
      .map((l) => ({
        from: keys.get(l.fromTileId)!,
        to: keys.get(l.toTileId)!,
        instruction: l.instruction ?? '',
        mode: l.mode,
        ...(l.when && { when: l.when }),
        ...(l.otherwise && { otherwise: true as const }),
        ...(l.split && { split: true as const })
      }))
  }
}
