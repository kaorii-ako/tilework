import type { Link, Tile } from '../../../shared/types'

/** Most parallel workers one split link may run; extra tasks go to the last worker (KAO-52). */
export const MAX_WORKERS = 8

/** `ROUTE: Fixer` or `ROUTE: Fixer, Writer` lines, lower-cased and trimmed. */
export function parseRoutes(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/^[\s>*_`]*ROUTE:\s*(.+?)[\s*_`]*$/gim))
    for (const name of m[1].split(',')) if (name.trim()) out.push(name.trim().toLowerCase())
  return out
}

/**
 * Which of `fromId`'s outgoing links fire for `text` (KAO-52).
 * - A router fires the links to the tiles it names with ROUTE:, else its `otherwise` links.
 * - Otherwise, plain links always fire, `when` links fire if the text contains their condition,
 *   and `otherwise` links fire only if no `when` link matched.
 */
export function firingLinks(tiles: Tile[], links: Link[], fromId: string, text: string): Link[] {
  const out = links.filter((l) => l.fromTileId === fromId)
  const title = (id: string) =>
    tiles
      .find((t) => t.id === id)
      ?.title.trim()
      .toLowerCase()
  if (tiles.find((t) => t.id === fromId)?.router) {
    const picked = new Set(parseRoutes(text))
    const chosen = out.filter((l) => picked.has(title(l.toTileId) ?? ''))
    return chosen.length ? chosen : out.filter((l) => l.otherwise)
  }
  const lower = text.toLowerCase()
  const matched = out.filter((l) => l.when && lower.includes(l.when.toLowerCase()))
  const plain = out.filter((l) => !l.when && !l.otherwise)
  return [...plain, ...matched, ...(matched.length ? [] : out.filter((l) => l.otherwise))]
}

/** What a router is told about its choices, appended to every handoff it receives. */
export function routerAsk(choices: string[]): string {
  return `When you're done, end your reply with one line naming who should go next: ROUTE: <${choices.join(' | ')}>`
}

const ITEM = /^(?:[-*+]|\d+[.)])\s+(.*)$/

/**
 * The tasks in a result, for a split link: the lines of a ```tasks fenced block if there is one,
 * else every top-level list item (indented lines below an item belong to it). At most `max`:
 * extra tasks are folded into the last one.
 */
export function parseTasks(text: string, max = MAX_WORKERS): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let tasks: string[] = []
  const fence = text.match(/```tasks[^\n]*\n([\s\S]*?)```/i)
  if (fence) {
    tasks = fence[1]
      .split('\n')
      .map((l) => (l.trim().match(ITEM)?.[1] ?? l).trim())
      .filter(Boolean)
  } else {
    let cur: string | null = null
    const flush = () => cur !== null && cur.trim() && tasks.push(cur.trim())
    for (const line of lines) {
      const item = line.match(ITEM)
      if (item) {
        flush()
        cur = item[1]
      } else if (cur !== null && /^\s+\S/.test(line)) cur += '\n' + line.trim()
      else {
        flush()
        cur = null
      }
    }
    flush()
  }
  if (tasks.length > max) tasks = [...tasks.slice(0, max - 1), tasks.slice(max - 1).join('\n')]
  return tasks
}

/** The task text a worker gets: its own task first, the full result after it for context. */
export function workerTask(task: string, i: number, n: number, full: string): string {
  return `Your task (${i + 1} of ${n}, others run in parallel):\n${task}\n\nFull plan for context:\n${full}`
}
