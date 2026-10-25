import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { BUILTIN_WORKFLOWS } from '../shared/workflows'
import { loadWorkflows, saveWorkflows } from './workflows-store'

const dir = () => mkdtempSync(join(tmpdir(), 'workflows-'))
const mine = { ...BUILTIN_WORKFLOWS[1], id: 'mine', name: 'Mine', builtIn: undefined }

it('round-trips custom workflows and never stores built-ins', () => {
  const path = join(dir(), 'agent-canvas', 'workflows.json')
  expect(loadWorkflows(path)).toEqual([])
  expect(saveWorkflows(path, [mine, BUILTIN_WORKFLOWS[0], { junk: true }]).map((w) => w.id)).toEqual(['mine'])
  expect(loadWorkflows(path).map((w) => w.name)).toEqual(['Mine'])
  expect(JSON.parse(readFileSync(path, 'utf8'))).toHaveLength(1)
})

it('loads a corrupt file as empty', () => {
  const path = join(dir(), 'workflows.json')
  writeFileSync(path, '{ nope')
  expect(loadWorkflows(path)).toEqual([])
})
