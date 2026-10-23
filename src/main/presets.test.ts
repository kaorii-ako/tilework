import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PRESETS, loadPresets, parsePresets } from './presets'

const tmp = () => join(mkdtempSync(join(tmpdir(), 'presets-')), 'sub', 'presets.json')

describe('loadPresets', () => {
  it('creates the file with defaults on first run', () => {
    const p = tmp()
    expect(loadPresets(p)).toEqual(DEFAULT_PRESETS)
    expect(JSON.parse(readFileSync(p, 'utf8'))).toEqual(DEFAULT_PRESETS)
  })
  it('reads user presets', () => {
    const p = tmp()
    loadPresets(p)
    writeFileSync(p, JSON.stringify([{ id: 'aider', name: 'Aider', command: 'aider', args: ['--watch'] }]))
    expect(loadPresets(p)).toEqual([{ id: 'aider', name: 'Aider', command: 'aider', args: ['--watch'] }])
  })
  it('falls back to defaults on broken JSON without overwriting the file', () => {
    const p = tmp()
    loadPresets(p)
    writeFileSync(p, '{nope')
    expect(loadPresets(p)).toEqual(DEFAULT_PRESETS)
    expect(readFileSync(p, 'utf8')).toBe('{nope')
  })
})

describe('parsePresets', () => {
  it('drops invalid and duplicate entries', () => {
    const out = parsePresets([
      { id: 'a', name: 'A', command: 'a' },
      { id: 'a', name: 'dup', command: 'x' },
      { id: 'b', name: 'B', command: 42 },
      { id: 'c', name: 'C', args: 'no' },
      { id: 'd' },
      null,
      { id: 'sh', name: 'Shell' }
    ])
    expect(out).toEqual([
      { id: 'a', name: 'A', command: 'a' },
      { id: 'sh', name: 'Shell' }
    ])
  })
  it('rejects non-arrays', () => {
    expect(parsePresets({})).toBeNull()
  })
})
