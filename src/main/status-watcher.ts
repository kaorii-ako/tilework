import { closeSync, openSync, readSync, statSync, unwatchFile, watchFile, writeFileSync } from 'node:fs'
import { parseStatusLine, type FocusRequest, type HookEvent } from '../shared/status'

export const defaultStatusFile = (): string => `${process.env.XDG_RUNTIME_DIR || '/tmp'}/agent-canvas-status.jsonl`

/** Tails the append-only file the hook writes to and reports each valid event. Truncates the file on start. */
export function watchStatusFile(path: string, onEvent: (e: HookEvent | FocusRequest) => void): () => void {
  writeFileSync(path, '')
  let offset = 0
  let partial = ''
  const read = (): void => {
    const size = statSync(path).size
    if (size < offset) offset = 0 // truncated by someone else
    if (size === offset) return
    const buf = Buffer.alloc(size - offset)
    const fd = openSync(path, 'r')
    try {
      readSync(fd, buf, 0, buf.length, offset)
    } finally {
      closeSync(fd)
    }
    offset = size
    const lines = (partial + buf.toString('utf8')).split('\n')
    partial = lines.pop() ?? ''
    for (const line of lines) {
      const e = parseStatusLine(line)
      if (e) onEvent(e)
    }
  }
  // ponytail: 250ms polling, swap for fs.watch if idle wakeups ever matter
  watchFile(path, { interval: 250 }, read)
  return () => unwatchFile(path, read)
}
