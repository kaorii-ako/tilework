import { describe, expect, it } from 'vitest'
import type { Tile } from '../../../shared/types'
import {
  MIN_TILE,
  ZOOM,
  createCanvasStore,
  dragTo,
  inPort,
  linkCurve,
  nextZoom,
  outPort,
  TILE_GAP,
  fitViewport,
  placeNewTile,
  revealViewport,
  uniqueTitle,
  screenToCanvas
} from './store'

const tile = (id: string, x = 0, y = 0): Tile => ({ id, title: id, x, y, w: 400, h: 300 })

describe('viewport math', () => {
  it('panBy shifts the viewport by the screen delta', () => {
    const s = createCanvasStore()
    s.getState().panBy(30, -10)
    s.getState().panBy(5, 5)
    expect(s.getState().viewport).toEqual({ x: 35, y: -5, zoom: 1 })
  })

  it('screenToCanvas inverts pan and zoom', () => {
    expect(screenToCanvas({ x: 100, y: 50, zoom: 2 }, { x: 300, y: 250 })).toEqual({ x: 100, y: 100 })
  })

  it('places a new tile centered in the visible area, after panning', () => {
    const p = placeNewTile({ x: -1000, y: -500, zoom: 1 }, { w: 1200, h: 800 }, [], null, { w: 400, h: 200 })
    expect(p).toEqual({ x: 1000 + 600 - 200, y: 500 + 400 - 100 })
  })

  it('places later tiles right of the anchor, then below, never overlapping', () => {
    const v = { x: 0, y: 0, zoom: 1 }
    const size = { w: 400, h: 300 }
    const a = tile('a', 0, 0)
    expect(placeNewTile(v, { w: 800, h: 600 }, [a], 'a', size)).toEqual({ x: 400 + TILE_GAP, y: 0 })
    const b = tile('b', 400 + TILE_GAP, 0)
    // right of a is taken by b: go below a
    expect(placeNewTile(v, { w: 800, h: 600 }, [a, b], 'a', size)).toEqual({ x: 0, y: 300 + TILE_GAP })
    const c = tile('c', 0, 300 + TILE_GAP)
    const p = placeNewTile(v, { w: 800, h: 600 }, [a, b, c], 'a', size)
    for (const t of [a, b, c]) {
      const overlaps = p.x < t.x + t.w && p.x + size.w > t.x && p.y < t.y + t.h && p.y + size.h > t.y
      expect(overlaps).toBe(false)
    }
  })

  it('defaults the anchor to the last tile', () => {
    const p = placeNewTile({ x: 0, y: 0, zoom: 1 }, { w: 800, h: 600 }, [tile('a'), tile('b', 0, 1000)], null, {
      w: 400,
      h: 300
    })
    expect(p).toEqual({ x: 400 + TILE_GAP, y: 1000 })
  })

  it('revealViewport pans just enough to show the tile, and leaves a visible one alone', () => {
    const v = { x: 0, y: 0, zoom: 1 }
    expect(revealViewport(v, tile('a', 100, 100), { w: 1000, h: 800 })).toEqual(v)
    // right edge at 1400 must come to 1000 - 24
    expect(revealViewport(v, tile('a', 1000, 100), { w: 1000, h: 800 })).toEqual({ x: -424, y: 0, zoom: 1 })
    expect(revealViewport(v, tile('a', -50, 100), { w: 1000, h: 800 })).toEqual({ x: 74, y: 0, zoom: 1 })
  })

  it('fitViewport shows every tile, centered, never above 100%', () => {
    expect(fitViewport([], { w: 1000, h: 800 })).toBeNull()
    expect(fitViewport([tile('a', 0, 0)], { w: 1000, h: 800 })).toEqual({ x: 300, y: 250, zoom: 1 })
    const wide = fitViewport([tile('a', 0, 0), tile('b', 1600, 0)], { w: 1096, h: 800 })!
    expect(wide.zoom).toBeCloseTo(0.5) // 2000px of tiles into 1000px
    expect(wide.x).toBe(48)
  })

  it('uniqueTitle numbers repeated names', () => {
    expect(uniqueTitle('Shell', [])).toBe('Shell')
    expect(uniqueTitle('Shell', [tile('Shell'), tile('Shell 2')])).toBe('Shell 3')
  })

  it('dragTo converts the screen delta through zoom', () => {
    expect(dragTo({ x: 10, y: 10 }, { x: 100, y: 100 }, { x: 150, y: 80 }, 2)).toEqual({ x: 35, y: 0 })
  })

  it('moveTile rounds to whole pixels', () => {
    const s = createCanvasStore({ tiles: [tile('a')] })
    s.getState().moveTile('a', 10.4, 20.6)
    expect(s.getState().tiles[0]).toMatchObject({ x: 10, y: 21 })
  })

  it('clamps resize to the minimum tile size', () => {
    const s = createCanvasStore({ tiles: [tile('a')] })
    s.getState().resizeTile('a', 10, 10)
    expect(s.getState().tiles[0]).toMatchObject({ w: MIN_TILE.w, h: MIN_TILE.h })
  })
})

describe('zoom', () => {
  it('keeps the canvas point under the cursor still', () => {
    const s = createCanvasStore({ viewport: { x: 100, y: 40, zoom: 1 } })
    const at = { x: 500, y: 300 }
    const before = screenToCanvas(s.getState().viewport, at)
    s.getState().zoomAt(0.5, at)
    expect(s.getState().viewport.zoom).toBe(0.5)
    expect(screenToCanvas(s.getState().viewport, at)).toEqual(before)
  })

  it('clamps to the zoom range', () => {
    expect(nextZoom(0.3, 0.01)).toBe(ZOOM.min)
    expect(nextZoom(1.2, 100)).toBe(ZOOM.max)
  })

  it('snaps to exactly 1 when crossing or landing near it, and can leave it again', () => {
    expect(nextZoom(0.9, 1.2)).toBe(1) // crossed from below
    expect(nextZoom(1.1, 0.8)).toBe(1) // crossed from above
    expect(nextZoom(0.95, 1.04)).toBe(1) // landed near
    expect(nextZoom(1, 0.9)).toBeCloseTo(0.9)
  })

  it('zoomToFit and revealTile update the viewport', () => {
    const s = createCanvasStore({ tiles: [tile('a', 0, 0), tile('b', 3000, 0)] })
    s.getState().zoomToFit({ w: 1000, h: 800 })
    expect(s.getState().viewport.zoom).toBeLessThan(1)
    s.getState().zoomToTile('a', { w: 1000, h: 800 })
    s.getState().revealTile('b', { w: 1000, h: 800 })
    expect(s.getState().viewport.x).toBe(1000 - 24 - 3400)
  })

  it('zoomToTile centers the tile at 100% and focuses it', () => {
    const s = createCanvasStore({ tiles: [tile('a', 1000, 500), tile('b')], viewport: { x: 0, y: 0, zoom: 0.4 } })
    s.getState().zoomToTile('a', { w: 1200, h: 800 })
    // tile center (1200, 650) lands on surface center (600, 400)
    expect(s.getState().viewport).toEqual({ x: -600, y: -250, zoom: 1 })
    expect(s.getState().focusedTileId).toBe('a')
    expect(s.getState().order.at(-1)).toBe('a')
  })
})

describe('focus and z-order', () => {
  it('focusing brings a tile to the front', () => {
    const s = createCanvasStore({ tiles: [tile('a'), tile('b'), tile('c')] })
    s.getState().focusTile('a')
    expect(s.getState().focusedTileId).toBe('a')
    expect(s.getState().order).toEqual(['b', 'c', 'a'])
  })

  it('refocusing the front tile does not change state', () => {
    const s = createCanvasStore({ tiles: [tile('a'), tile('b')] })
    s.getState().focusTile('b')
    const before = s.getState()
    s.getState().focusTile('b')
    expect(s.getState()).toBe(before)
  })

  it('ignores unknown ids and clears focus with null', () => {
    const s = createCanvasStore({ tiles: [tile('a')] })
    s.getState().focusTile('a')
    s.getState().focusTile('nope')
    expect(s.getState().focusedTileId).toBe('a')
    s.getState().focusTile(null)
    expect(s.getState().focusedTileId).toBeNull()
  })

  it('a new tile goes on top and takes focus', () => {
    const s = createCanvasStore({ tiles: [tile('a')] })
    s.getState().addTile(tile('b'))
    expect(s.getState().order).toEqual(['a', 'b'])
    expect(s.getState().focusedTileId).toBe('b')
  })

  it('removing the focused tile hands focus to the next one on top', () => {
    const s = createCanvasStore({ tiles: [tile('a'), tile('b'), tile('c')] })
    s.getState().focusTile('b')
    s.getState().removeTile('b')
    expect(s.getState().order).toEqual(['a', 'c'])
    expect(s.getState().focusedTileId).toBe('c')
  })

  it('panning does not touch tiles (no terminal re-render)', () => {
    const s = createCanvasStore({ tiles: [tile('a')] })
    const tiles = s.getState().tiles
    s.getState().panBy(10, 10)
    expect(s.getState().tiles).toBe(tiles)
  })

  it('setLayout replaces tiles and viewport, stacking in array order', () => {
    const s = createCanvasStore({ tiles: [tile('old')] })
    s.getState().focusTile('old')
    s.getState().setLayout([tile('a'), tile('b')], { x: 5, y: 6, zoom: 1 })
    expect(s.getState()).toMatchObject({ order: ['a', 'b'], focusedTileId: null, viewport: { x: 5, y: 6, zoom: 1 } })
  })
})

describe('workflows and instructions', () => {
  it('addWorkflow adds tiles and links together and focuses the first tile', () => {
    const s = createCanvasStore({ tiles: [tile('x')] })
    s.getState().addWorkflow(
      [tile('p'), tile('b')],
      [
        { id: 'pb', fromTileId: 'p', toTileId: 'b', mode: 'manual', instruction: 'Build it' },
        { id: 'bad', fromTileId: 'p', toTileId: 'gone', mode: 'manual' }
      ]
    )
    expect(s.getState().tiles.map((t) => t.id)).toEqual(['x', 'p', 'b'])
    expect(s.getState().links.map((l) => l.id)).toEqual(['pb'])
    expect(s.getState().focusedTileId).toBe('p')
  })

  it('setLinkInstruction trims, and blank clears it', () => {
    const s = createCanvasStore({ tiles: [tile('a'), tile('b')] })
    s.getState().addLink('a', 'b')
    const id = s.getState().links[0].id
    s.getState().setLinkInstruction(id, '  Review this  ')
    expect(s.getState().links[0].instruction).toBe('Review this')
    s.getState().setLinkInstruction(id, ' ')
    expect('instruction' in s.getState().links[0]).toBe(false)
  })
})

describe('links', () => {
  const three = () => createCanvasStore({ tiles: [tile('a'), tile('b'), tile('c')] })
  const pairs = (s: ReturnType<typeof three>) => s.getState().links.map((l) => `${l.fromTileId}>${l.toTileId}`)

  it('adds manual links, several per tile', () => {
    const s = three()
    s.getState().addLink('a', 'b')
    s.getState().addLink('b', 'c')
    s.getState().addLink('a', 'c')
    expect(pairs(s)).toEqual(['a>b', 'b>c', 'a>c'])
    expect(s.getState().links.every((l) => l.mode === 'manual' && l.id)).toBe(true)
  })

  it('ignores self-links, duplicates and unknown tiles, but allows the reverse direction', () => {
    const s = three()
    s.getState().addLink('a', 'b')
    const before = s.getState().links
    s.getState().addLink('a', 'b')
    s.getState().addLink('a', 'a')
    s.getState().addLink('a', 'nope')
    expect(s.getState().links).toBe(before)
    s.getState().addLink('b', 'a')
    expect(pairs(s)).toEqual(['a>b', 'b>a'])
  })

  it('removes a link and clears its selection', () => {
    const s = three()
    s.getState().addLink('a', 'b')
    s.getState().addLink('b', 'c')
    const id = s.getState().links[0].id
    s.getState().selectLink(id)
    s.getState().removeLink(id)
    expect(pairs(s)).toEqual(['b>c'])
    expect(s.getState().selectedLinkId).toBeNull()
  })

  it('closing a tile removes every link in or out of it', () => {
    const s = three()
    s.getState().addLink('a', 'b')
    s.getState().addLink('b', 'c')
    s.getState().addLink('a', 'c')
    s.getState().selectLink(s.getState().links[1].id)
    s.getState().removeTile('b')
    expect(pairs(s)).toEqual(['a>c'])
    expect(s.getState().selectedLinkId).toBeNull()
  })

  it('focusing a tile deselects the link', () => {
    const s = three()
    s.getState().addLink('a', 'b')
    s.getState().selectLink(s.getState().links[0].id)
    s.getState().focusTile('a')
    expect(s.getState().selectedLinkId).toBeNull()
  })

  it('setLayout drops links whose tiles are gone', () => {
    const s = createCanvasStore()
    const l = (id: string, fromTileId: string, toTileId: string) => ({
      id,
      fromTileId,
      toTileId,
      mode: 'manual' as const
    })
    s.getState().setLayout([tile('a'), tile('b')], { x: 0, y: 0, zoom: 1 }, [l('1', 'a', 'b'), l('2', 'b', 'x')])
    expect(s.getState().links.map((x) => x.id)).toEqual(['1'])
  })

  it('linkCurve runs between the ports with horizontal tangents and a true midpoint', () => {
    const a = outPort({ ...tile('a'), x: 0, y: 0 }) // (400, 150)
    const b = inPort({ ...tile('b'), x: 800, y: 300 }) // (800, 450)
    expect([a, b]).toEqual([
      { x: 400, y: 150 },
      { x: 800, y: 450 }
    ])
    const { d, mid } = linkCurve(a, b)
    expect(d).toBe('M 400 150 C 600 150, 600 450, 800 450')
    expect(mid).toEqual({ x: 600, y: 300 })
  })

  it('linkCurve keeps a minimum reach when the target is behind the source', () => {
    expect(linkCurve({ x: 100, y: 0 }, { x: 100, y: 0 }).d).toBe('M 100 0 C 160 0, 40 0, 100 0')
  })
})

describe('setSession', () => {
  it('stores the session on its tile, and repeats are a no-op', () => {
    const s = createCanvasStore({ tiles: [tile('a'), tile('b')] })
    s.getState().setSession('a', 's-1')
    const tiles = s.getState().tiles
    expect(tiles.find((t) => t.id === 'a')?.sessionId).toBe('s-1')
    s.getState().setSession('a', 's-1')
    s.getState().setSession('missing', 's-2')
    expect(s.getState().tiles).toBe(tiles)
  })
})

describe('agent status', () => {
  it('sets and clears per-tile status, and closing a tile drops it', () => {
    const s = createCanvasStore({ tiles: [tile('a'), tile('b')] })
    s.getState().setStatus('a', 'working')
    s.getState().setStatus('b', 'idle')
    s.getState().setStatus('a', 'needs-input')
    s.getState().clearStatus('missing')
    expect(s.getState().status).toEqual({ a: 'needs-input', b: 'idle' })
    s.getState().clearStatus('a')
    s.getState().removeTile('b')
    expect(s.getState().status).toEqual({})
  })
})
