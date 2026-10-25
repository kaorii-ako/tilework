import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseWorkflows, type Workflow } from '../shared/workflows'

/** Custom workflows from workflows.json; [] if missing or unreadable (broken entries are dropped). */
export function loadWorkflows(path: string): Workflow[] {
  try {
    return parseWorkflows(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return []
  }
}

/** Replace the custom workflows (validated; built-ins never go in the file). Atomic write. Returns what was saved. */
export function saveWorkflows(path: string, raw: unknown): Workflow[] {
  const list = parseWorkflows(raw)
  mkdirSync(dirname(path), { recursive: true })
  const tmp = path + '.tmp'
  writeFileSync(tmp, JSON.stringify(list, null, 2) + '\n')
  renameSync(tmp, path)
  return list
}
