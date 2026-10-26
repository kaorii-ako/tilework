import { describe, expect, it } from 'vitest'
import type { Link, Tile } from '../../../shared/types'
import { firingLinks, parseRoutes, parseTasks, workerTask } from './flow'

const tile = (id: string, extra: Partial<Tile> = {}): Tile => ({ id, title: id, x: 0, y: 0, w: 400, h: 300, ...extra })
const link = (id: string, to: string, extra: Partial<Link> = {}): Link => ({
  id,
  fromTileId: 'src',
  toTileId: to,
  mode: 'manual',
  ...extra
})

describe('firingLinks', () => {
  const tiles = [tile('src'), tile('Builder'), tile('Done'), tile('Log')]

  it('fires plain links always, when links on a match, otherwise links only without one', () => {
    const links = [
      link('fix', 'Builder', { when: 'changes requested' }),
      link('ship', 'Done', { otherwise: true }),
      link('log', 'Log')
    ]
    const ids = (text: string) => firingLinks(tiles, links, 'src', text).map((l) => l.id)
    expect(ids('Verdict: CHANGES REQUESTED, see below')).toEqual(['log', 'fix'])
    expect(ids('APPROVED')).toEqual(['log', 'ship'])
  })

  it('ignores links out of other tiles', () => {
    expect(firingLinks(tiles, [{ ...link('x', 'Done'), fromTileId: 'Log' }], 'src', 'hi')).toEqual([])
  })

  it('a router fires only the tiles it names, else its otherwise links', () => {
    const router = [tile('src', { router: true }), tile('Fixer'), tile('Writer'), tile('Inbox')]
    const links = [link('f', 'Fixer'), link('w', 'Writer'), link('i', 'Inbox', { otherwise: true })]
    const ids = (text: string) => firingLinks(router, links, 'src', text).map((l) => l.id)
    expect(ids('It is a crash.\nROUTE: fixer')).toEqual(['f'])
    expect(ids('**ROUTE: Fixer, Writer**')).toEqual(['f', 'w'])
    expect(ids('no idea')).toEqual(['i'])
  })
})

describe('parseRoutes', () => {
  it('reads every ROUTE line, case-insensitive', () => {
    expect(parseRoutes('route: A\nblah\n> ROUTE:  B , C ')).toEqual(['a', 'b', 'c'])
  })
})

describe('parseTasks', () => {
  it('takes top-level list items, with indented lines attached', () => {
    const plan = 'Plan:\n\n1. Add the API\n   with tests\n2. Build the UI\n- Write docs\n\nThat is all.'
    expect(parseTasks(plan)).toEqual(['Add the API\nwith tests', 'Build the UI', 'Write docs'])
  })

  it('prefers a ```tasks block over loose lists', () => {
    expect(parseTasks('- not this\n```tasks\n- one\ntwo\n\n```\n- nor this')).toEqual(['one', 'two'])
  })

  it('folds tasks past the cap into the last worker', () => {
    expect(parseTasks('- a\n- b\n- c\n- d', 3)).toEqual(['a', 'b', 'c\nd'])
  })

  it('returns nothing for prose', () => {
    expect(parseTasks('Just do it.')).toEqual([])
  })
})

describe('workerTask', () => {
  it('puts the worker’s own task first and the full plan after it', () => {
    expect(workerTask('B', 1, 3, 'A B C')).toBe(
      'Your task (2 of 3, others run in parallel):\nB\n\nFull plan for context:\nA B C'
    )
  })
})
