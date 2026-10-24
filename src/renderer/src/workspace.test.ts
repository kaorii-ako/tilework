import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCanvasStore } from './canvas/store'
import { startWorkspace } from './workspace'

describe('startWorkspace', () => {
  const save = vi.fn()
  let unload: () => void = () => {}

  beforeEach(() => {
    vi.useFakeTimers()
    save.mockClear()
    vi.stubGlobal('crypto', { randomUUID: () => 'id-1' })
    vi.stubGlobal('window', {
      canvasApi: { loadWorkspace: async () => null, saveWorkspace: save },
      addEventListener: (_: string, fn: () => void) => (unload = fn)
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('flushes a pending debounced save on unload', async () => {
    const store = createCanvasStore()
    await startWorkspace(store)
    save.mockClear()
    store.getState().panBy(5, 5)
    expect(save).not.toHaveBeenCalled()
    unload()
    expect(save).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('restores links, drops ones to missing tiles, and saves when links change', async () => {
    const tile = (id: string) => ({ id, title: id, x: 0, y: 0, w: 400, h: 300 })
    const link = (id: string, fromTileId: string, toTileId: string) => ({
      id,
      fromTileId,
      toTileId,
      mode: 'manual' as const
    })
    window.canvasApi.loadWorkspace = async () => ({
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      tiles: [tile('a'), tile('b')],
      links: [link('ab', 'a', 'b'), link('ax', 'a', 'x')]
    })
    const store = createCanvasStore()
    await startWorkspace(store)
    expect(store.getState().links.map((l) => l.id)).toEqual(['ab'])
    save.mockClear()
    store.getState().removeLink('ab')
    vi.advanceTimersByTime(1000)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].links).toEqual([])
  })
})
