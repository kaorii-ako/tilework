import { describe, expect, it } from 'vitest'
import { parseStatusLine, stateForEvent } from './status'

describe('stateForEvent', () => {
  it.each([
    ['SessionStart', 'idle'],
    ['UserPromptSubmit', 'working'],
    ['PreToolUse', 'working'],
    ['Notification', 'needs-input'],
    ['Stop', 'idle'],
    ['SessionEnd', 'exited']
  ])('%s -> %s', (event, state) => expect(stateForEvent(event)).toBe(state))

  it('ignores unknown events, including prototype keys', () => {
    expect(stateForEvent('PostToolUse')).toBeUndefined()
    expect(stateForEvent('constructor')).toBeUndefined()
  })
})

describe('parseStatusLine', () => {
  it('parses a hook line', () => {
    expect(parseStatusLine('{"tile":"tile-1","event":"Stop","ts":1}')).toEqual({ tileId: 'tile-1', state: 'idle' })
  })
  it('rejects garbage', () => {
    expect(parseStatusLine('nope')).toBeUndefined()
    expect(parseStatusLine('{"tile":"a","event":"Nope"}')).toBeUndefined()
    expect(parseStatusLine('{"event":"Stop"}')).toBeUndefined()
  })
})
