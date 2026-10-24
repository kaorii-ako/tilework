import { open, realpath } from 'node:fs/promises'
import { sep } from 'node:path'

/** Handoffs carry at most this many characters of a result, keeping the end (the conclusion). */
export const RESULT_MAX = 4000
/** Only the end of a transcript is read; the last assistant message lives there. */
const TAIL_BYTES = 2 * 1024 * 1024

export const capEnd = (s: string, max = RESULT_MAX): string => (s.length > max ? '…' + s.slice(-(max - 1)) : s)

/**
 * The text of the last assistant message in a Claude Code transcript (JSONL). Claude Code writes
 * one line per content block, so text blocks sharing the last message id are joined. Malformed
 * lines (including a partial first line from reading only the tail) and sidechains are skipped.
 */
export function lastAssistantText(jsonl: string): string | undefined {
  let id: unknown
  let parts: string[] = []
  for (const line of jsonl.split('\n')) {
    let e: any
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    if (e?.type !== 'assistant' || e.isSidechain || !e.message) continue
    const c = e.message.content
    const text = (
      typeof c === 'string' ? [c] : Array.isArray(c) ? c.filter((b) => b?.type === 'text').map((b) => b.text) : []
    )
      .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      .join('\n\n')
    if (!text) continue
    if (id === undefined || e.message.id !== id) parts = []
    id = e.message.id ?? null
    parts.push(text)
  }
  return parts.length ? parts.join('\n\n').trim() : undefined
}

/**
 * The real path of `path` if it is a .jsonl file under `claudeDir` after resolving symlinks
 * and `..`; otherwise undefined. The renderer never supplies this path, only our own hook does.
 */
export async function safeTranscriptPath(path: string, claudeDir: string): Promise<string | undefined> {
  if (!path.startsWith('/') || !path.endsWith('.jsonl')) return undefined
  try {
    const [real, root] = await Promise.all([realpath(path), realpath(claudeDir)])
    return real.startsWith(root + sep) && real.endsWith('.jsonl') ? real : undefined
  } catch {
    return undefined
  }
}

/** Read the last assistant message from a transcript under `claudeDir`, capped. */
export async function readResult(path: string, claudeDir: string): Promise<string | undefined> {
  const real = await safeTranscriptPath(path, claudeDir)
  if (!real) return undefined
  const fh = await open(real, 'r')
  try {
    const st = await fh.stat()
    if (!st.isFile()) return undefined
    const size = st.size
    const len = Math.min(size, TAIL_BYTES)
    const buf = Buffer.alloc(len)
    await fh.read(buf, 0, len, size - len)
    const text = lastAssistantText(buf.toString('utf8'))
    return text ? capEnd(text) : undefined
  } finally {
    await fh.close()
  }
}
