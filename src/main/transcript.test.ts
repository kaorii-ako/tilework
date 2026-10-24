import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RESULT_MAX, capEnd, lastAssistantText, readResult, safeTranscriptPath } from './transcript'

const line = (o: object) => JSON.stringify(o)
const assistant = (id: string, content: unknown, extra = {}) =>
  line({ type: 'assistant', message: { id, role: 'assistant', content }, ...extra })

describe('lastAssistantText', () => {
  it('takes the last assistant message, skipping a malformed line', () => {
    const jsonl = [
      line({ type: 'user', message: { role: 'user', content: 'hi' } }),
      assistant('m1', [{ type: 'text', text: 'first answer' }]),
      '{"type":"assistant", this is not json',
      line({ type: 'user', message: { role: 'user', content: 'again' } }),
      assistant('m2', [{ type: 'thinking', thinking: 'hmm' }]),
      assistant('m2', [{ type: 'text', text: 'second answer' }]),
      ''
    ].join('\n')
    expect(lastAssistantText(jsonl)).toBe('second answer')
  })

  it('joins text blocks of the same message and ignores tool calls and sidechains', () => {
    const jsonl = [
      assistant('m1', [{ type: 'text', text: 'part one' }]),
      assistant('m1', [{ type: 'tool_use', id: 't', name: 'Bash', input: {} }]),
      assistant('m1', [{ type: 'text', text: 'part two' }]),
      assistant('s1', [{ type: 'text', text: 'subagent' }], { isSidechain: true })
    ].join('\n')
    expect(lastAssistantText(jsonl)).toBe('part one\n\npart two')
  })

  it('returns undefined when there is no assistant text', () => {
    expect(lastAssistantText('')).toBeUndefined()
    expect(lastAssistantText('garbage\n{}\n' + assistant('m', []))).toBeUndefined()
  })
})

describe('capEnd', () => {
  it('keeps the end of a long result', () => {
    const s = 'a'.repeat(5000) + 'END'
    const c = capEnd(s)
    expect(c.length).toBe(RESULT_MAX)
    expect(c.endsWith('END')).toBe(true)
    expect(c.startsWith('…')).toBe(true)
    expect(capEnd('short')).toBe('short')
  })
})

describe('transcript paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'ac-transcript-'))
  const claude = join(root, '.claude')
  mkdirSync(join(claude, 'projects'), { recursive: true })
  const inside = join(claude, 'projects', 't.jsonl')
  writeFileSync(inside, assistant('m', [{ type: 'text', text: 'done' }]) + '\n')
  const outside = join(root, 'secret.jsonl')
  writeFileSync(outside, assistant('m', [{ type: 'text', text: 'secret' }]))
  symlinkSync(outside, join(claude, 'link.jsonl'))

  it('reads a transcript under the claude dir', async () => {
    expect(await readResult(inside, claude)).toBe('done')
  })

  it('refuses paths outside it, via .. or symlink, and non-jsonl files', async () => {
    expect(await safeTranscriptPath(outside, claude)).toBeUndefined()
    expect(await safeTranscriptPath(join(claude, '..', 'secret.jsonl'), claude)).toBeUndefined()
    expect(await safeTranscriptPath(join(claude, 'link.jsonl'), claude)).toBeUndefined()
    expect(await safeTranscriptPath('relative.jsonl', claude)).toBeUndefined()
    expect(await safeTranscriptPath(join(claude, 'missing.jsonl'), claude)).toBeUndefined()
    expect(await readResult(join(claude, 'link.jsonl'), claude)).toBeUndefined()
  })
})
