import { describe, expect, it } from 'vitest'
import type { Tile } from '../../../shared/types'
import { MIN_TILE, ZOOM, createCanvasStore, dragTo, nextZoom, placeNewTile, screenToCanvas } from './store'

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
    const p = placeNewTile({ x: -1000, y: -500, zoom: 1 }, { w: 1200, h: 800 }, [], { w: 400, h: 200 })
    expect(p).toEqual({ x: 1000 + 600 - 200, y: 500 + 400 - 100 })
  })

  it('nudges a new tile off one that sits exactly in the same spot', () => {
    const v = { x: 0, y: 0, zoom: 1 }
    const first = placeNewTile(v, { w: 800, h: 600 }, [], { w: 400, h: 200 })
    const second = placeNewTile(v, { w: 800, h: 600 }, [tile('a', first.x, first.y)], { w: 400, h: 200 })
    expect(second).not.toEqual(first)
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
