import { describe, expect, it } from 'vitest'
import { notifyText } from './notify'

describe('notifyText', () => {
  it('speaks up when a working agent finishes or needs you', () => {
    expect(notifyText('working', 'idle', 'Builder')).toBe('Builder is done')
    expect(notifyText('working', 'needs-input', 'Builder')).toBe('Builder needs you')
  })
  it('stays quiet for the idle reminder, startups and repeats', () => {
    expect(notifyText('idle', 'needs-input', 'B')).toBeNull()
    expect(notifyText(undefined, 'idle', 'B')).toBeNull()
    expect(notifyText('working', 'working', 'B')).toBeNull()
    expect(notifyText('working', 'exited', 'B')).toBeNull()
  })
})
