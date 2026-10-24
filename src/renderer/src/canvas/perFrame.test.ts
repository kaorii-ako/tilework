import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { perFrame } from './perFrame'

let frames: (() => void)[] = []
beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => (frames[id - 1] = () => {}))
})
afterEach(() => vi.unstubAllGlobals())
const tick = () => frames.splice(0).forEach((f) => f())

it('runs once per frame with the latest value', () => {
  const fn = vi.fn()
  const f = perFrame(fn)
  f(1)
  f(2)
  f(3)
  expect(fn).not.toHaveBeenCalled()
  tick()
  expect(fn.mock.calls).toEqual([[3]])
  f(4)
  tick()
  expect(fn.mock.calls).toEqual([[3], [4]])
})

it('flush runs the pending call now; cancel drops it', () => {
  const fn = vi.fn()
  const f = perFrame(fn)
  f(1)
  f.flush()
  expect(fn.mock.calls).toEqual([[1]])
  tick()
  expect(fn).toHaveBeenCalledTimes(1)
  f(2)
  f.cancel()
  tick()
  expect(fn).toHaveBeenCalledTimes(1)
})
