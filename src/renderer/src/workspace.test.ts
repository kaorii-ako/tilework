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

  it('starts empty when nothing is saved, without writing over the file', async () => {
    const store = createCanvasStore()
    await startWorkspace(store)
    expect(store.getState().tiles).toEqual([])
    vi.advanceTimersByTime(1000)
    expect(save).not.toHaveBeenCalled()
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

describe('saveWorkspace (KAO-54)', () => {
  it('leaves teammates’ tiles and their links out of the saved file', async () => {
    const { saveWorkspace } = await import('./workspace')
    const save = vi.fn()
    vi.stubGlobal('window', { canvasApi: { saveWorkspace: save } })
    const t = (id: string, ownerId?: string) => ({ id, title: id, x: 0, y: 0, w: 1, h: 1, ...(ownerId && { ownerId }) })
    saveWorkspace({
      getTiles: () => [t('a'), t('b'), t('r', 'bob')],
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      getLinks: () => [
        { id: 'ab', fromTileId: 'a', toTileId: 'b', mode: 'manual' },
        { id: 'ar', fromTileId: 'a', toTileId: 'r', mode: 'manual' }
      ],
      setLayout: () => {}
    })
    expect(save.mock.calls[0][0].tiles.map((x: { id: string }) => x.id)).toEqual(['a', 'b'])
    expect(save.mock.calls[0][0].links.map((x: { id: string }) => x.id)).toEqual(['ab'])
    vi.unstubAllGlobals()
  })
})
