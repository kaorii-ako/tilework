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
})
