import { describe, expect, it, vi } from 'vitest'
import { createSpaceGesture } from './spaceGesture'

describe('space gesture', () => {
  it('a tap types one space on release', () => {
    const flush = vi.fn()
    const g = createSpaceGesture(flush)
    expect(g.keyDown(true)).toBe(true)
    expect(flush).not.toHaveBeenCalled()
    g.keyUp(true)
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('space then drag is a pan and types nothing', () => {
    const flush = vi.fn()
    const g = createSpaceGesture(flush)
    g.keyDown(true)
    expect(g.pointerDown()).toBe(true)
    expect(g.keyDown(true)).toBe(true) // auto-repeat during the pan is swallowed
    g.keyUp(true)
    expect(flush).not.toHaveBeenCalled()
  })

  it('fast typing keeps order: the held space is sent before the next key', () => {
    const order: string[] = []
    const g = createSpaceGesture(() => order.push(' '))
    g.keyDown(true)
    if (!g.keyDown(false)) order.push('b')
    g.keyUp(true)
    expect(order).toEqual([' ', 'b'])
  })

  it('holding space without dragging lets repeats through after the first', () => {
    const flush = vi.fn()
    const g = createSpaceGesture(flush)
    g.keyDown(true)
    expect(g.keyDown(true)).toBe(false)
    expect(g.keyDown(true)).toBe(false)
    g.keyUp(true)
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('pointerDown without space does nothing', () => {
    expect(createSpaceGesture(vi.fn()).pointerDown()).toBe(false)
  })
})
