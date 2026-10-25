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
  it('keeps the transcript path on Stop only', () => {
    expect(parseStatusLine('{"tile":"t","event":"Stop","transcript":"/p.jsonl"}')).toEqual({
      tileId: 't',
      state: 'idle',
      transcript: '/p.jsonl'
    })
    expect(parseStatusLine('{"tile":"t","event":"PreToolUse","transcript":"/p.jsonl"}')).toEqual({
      tileId: 't',
      state: 'working'
    })
  })
  it('keeps a valid session id on SessionStart only', () => {
    expect(parseStatusLine('{"tile":"t","event":"SessionStart","session":"ab-12"}')).toEqual({
      tileId: 't',
      state: 'idle',
      session: 'ab-12'
    })
    expect(parseStatusLine('{"tile":"t","event":"SessionStart","session":"../x"}')).toEqual({
      tileId: 't',
      state: 'idle'
    })
    expect(parseStatusLine('{"tile":"t","event":"Stop","session":"ab"}')).toEqual({ tileId: 't', state: 'idle' })
  })
  it('parses a focus request', () => {
    expect(parseStatusLine('{"tile":"t","event":"Focus"}')).toEqual({ tileId: 't', focus: true })
    expect(parseStatusLine('{"tile":"","event":"Focus"}')).toBeUndefined()
  })
  it('rejects garbage', () => {
    expect(parseStatusLine('nope')).toBeUndefined()
    expect(parseStatusLine('{"tile":"a","event":"Nope"}')).toBeUndefined()
    expect(parseStatusLine('{"event":"Stop"}')).toBeUndefined()
  })
})
