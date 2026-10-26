import { describe, expect, it } from 'vitest'
import type { Link, Tile } from './types'
import { BUILTIN_WORKFLOWS, instantiateWorkflow, parseWorkflow, parseWorkflows, workflowFromCanvas } from './workflows'

const ids = () => {
  let n = 0
  return () => `id${++n}`
}

describe('built-in workflows', () => {
  it('are all valid, manual, and laid out left to right', () => {
    expect(BUILTIN_WORKFLOWS.map((w) => w.name)).toEqual([
      'Plan → Build → Review',
      'Plan → 3 Builders → Review',
      'Build ↔ Review',
      'Research → Write',
      'Quick fix'
    ])
    for (const wf of BUILTIN_WORKFLOWS) {
      expect(parseWorkflow(wf)).toMatchObject({ id: wf.id, tiles: wf.tiles, links: wf.links })
      expect(wf.links.every((l) => l.mode === 'manual' && l.instruction)).toBe(true)
      const xs = wf.tiles.map((t) => t.x)
      expect(xs).toEqual([...xs].sort((a, b) => a - b))
    }
  })

  it('Plan → 3 Builders → Review fans out to three worktree builders that all feed one reviewer', () => {
    const wf = BUILTIN_WORKFLOWS.find((w) => w.id === 'plan-fan-out-review')!
    expect(wf.tiles.filter((t) => t.worktree).map((t) => t.title)).toEqual(['Builder 1', 'Builder 2', 'Builder 3'])
    expect(wf.links.filter((l) => l.from === 'plan').map((l) => l.to)).toEqual(['build1', 'build2', 'build3'])
    expect(wf.links.filter((l) => l.to === 'review').map((l) => l.from)).toEqual(['build1', 'build2', 'build3'])
    // No two tiles overlap.
    for (const a of wf.tiles)
      for (const b of wf.tiles)
        if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true)
    const { tiles, worktree } = instantiateWorkflow(wf, '/repo', { x: 0, y: 0 })
    expect(tiles.filter((t) => worktree.has(t.id)).map((t) => t.title)).toEqual(['Builder 1', 'Builder 2', 'Builder 3'])
  })

  it('keeps the worktree flag through parsing, and saving a canvas marks tiles that had a branch', () => {
    expect(
      parseWorkflow({ ...BUILTIN_WORKFLOWS[0], tiles: [{ ...BUILTIN_WORKFLOWS[0].tiles[0], worktree: 'yes' }] })
    ).toBeNull()
    const saved = workflowFromCanvas(
      'x',
      [{ id: 'a', title: 'A', branch: 'tilework/1', x: 0, y: 0, w: 1, h: 1 }],
      [],
      'w'
    )
    expect(saved.tiles[0].worktree).toBe(true)
  })

  it('Plan → Build → Review runs opus, sonnet, opus with the right instructions', () => {
    const wf = BUILTIN_WORKFLOWS[0]
    expect(wf.tiles.map((t) => [t.title, t.command, t.model])).toEqual([
      ['Planner', 'claude', 'opus'],
      ['Builder', 'claude', 'sonnet'],
      ['Reviewer', 'claude', 'opus']
    ])
    expect(wf.links.map((l) => l.instruction)).toEqual([
      "Implement this plan. Ask if anything's unclear.",
      "Review this change for bugs, missing tests and anything that doesn't match the plan."
    ])
  })
})

describe('parseWorkflows', () => {
  const custom = { ...BUILTIN_WORKFLOWS[3], id: 'mine', name: 'Mine', builtIn: undefined }

  it('keeps valid custom workflows and drops broken ones or ones posing as built-ins', () => {
    const broken = [
      { ...custom, id: 'no-tiles', tiles: [] },
      { ...custom, id: 'bad-link', links: [{ from: 'fix', to: 'nope', instruction: '', mode: 'manual' }] },
      { ...custom, id: 'self-link', links: [{ from: 'fix', to: 'fix', instruction: '', mode: 'manual' }] },
      { ...custom, id: 'bad-model', tiles: [{ ...custom.tiles[0], model: 'opus; rm -rf' }] },
      { ...custom, id: 'bad-mode', links: [{ ...custom.links[0], mode: 'loop' }] },
      { ...custom, id: 'plan-build-review' },
      null,
      'x'
    ]
    expect(parseWorkflows([custom, ...broken, custom]).map((w) => w.id)).toEqual(['mine'])
    expect(parseWorkflows({})).toEqual([])
  })
})

describe('instantiateWorkflow', () => {
  it('makes tiles in the folder at the origin, with claude --model and the links between them', () => {
    const { tiles, links } = instantiateWorkflow(BUILTIN_WORKFLOWS[0], '/repo', { x: 100, y: 50 }, ids())
    expect(tiles.map((t) => [t.id, t.title, t.command, t.args, t.cwd, t.x, t.y])).toEqual([
      ['id1', 'Planner', 'claude', ['--model', 'opus'], '/repo', 100, 50],
      ['id2', 'Builder', 'claude', ['--model', 'sonnet'], '/repo', 100 + 920, 50],
      ['id3', 'Reviewer', 'claude', ['--model', 'opus'], '/repo', 100 + 2 * 920, 50]
    ])
    expect(links).toEqual([
      {
        id: 'id4',
        fromTileId: 'id1',
        toTileId: 'id2',
        mode: 'manual',
        instruction: "Implement this plan. Ask if anything's unclear."
      },
      {
        id: 'id5',
        fromTileId: 'id2',
        toTileId: 'id3',
        mode: 'manual',
        instruction: "Review this change for bugs, missing tests and anything that doesn't match the plan."
      }
    ])
  })
})

describe('workflowFromCanvas', () => {
  it('saves tiles relative to the top-left, links with instructions, and round-trips', () => {
    const tiles: Tile[] = [
      { id: 'a', title: 'A', command: 'claude', args: ['--model', 'haiku'], cwd: '/x', x: 500, y: 300, w: 600, h: 400 },
      { id: 'b', title: 'B', x: 1300, y: 200, w: 600, h: 400 }
    ]
    const links: Link[] = [{ id: 'l', fromTileId: 'a', toTileId: 'b', mode: 'auto', instruction: 'Check it' }]
    const wf = workflowFromCanvas('Pair', tiles, links, 'w1')
    expect(wf).toEqual({
      id: 'w1',
      name: 'Pair',
      description: 'A → B',
      tiles: [
        { key: 't1', title: 'A', command: 'claude', args: ['--model', 'haiku'], x: 0, y: 100, w: 600, h: 400 },
        { key: 't2', title: 'B', x: 800, y: 0, w: 600, h: 400 }
      ],
      links: [{ from: 't1', to: 't2', instruction: 'Check it', mode: 'auto' }]
    })
    expect(parseWorkflows([wf])).toEqual([wf])
    const again = instantiateWorkflow(wf, '/y', { x: 0, y: 0 }, ids())
    expect(again.tiles[0]).toMatchObject({ command: 'claude', args: ['--model', 'haiku'], cwd: '/y', y: 100 })
    expect(again.links[0]).toMatchObject({ mode: 'auto', instruction: 'Check it' })
  })
})
