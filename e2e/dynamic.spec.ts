import { expect, test, type Page } from '@playwright/test'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, seedWorkspace, tempHome, tile, tiles } from './app'

/** What Claude Code's Stop hook would report for tile `id`, with `text` as its last reply. */
function finish(home: string, id: string, text: string, n: number): void {
  mkdirSync(join(home, '.claude'), { recursive: true })
  const transcript = join(home, '.claude', `${id}-${n}.jsonl`)
  const message = { type: 'assistant', message: { id: `m${n}`, content: [{ type: 'text', text }] } }
  writeFileSync(transcript, JSON.stringify(message) + '\n')
  appendFileSync(
    join(home, 'agent-canvas-status.jsonl'),
    JSON.stringify({ tile: id, event: 'Stop', transcript }) + '\n'
  )
}

const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : '')
/** A shell tile that saves whatever is pasted into it to ~/got-<tile id>.txt. */
const sink = (id: string, title: string, x: number, y = 40) => ({
  id,
  title,
  command: 'cat > "$HOME/got-$AGENT_CANVAS_TILE_ID.txt"',
  shell: true as const,
  x,
  y,
  w: 420,
  h: 300
})

async function linkMenu(page: Page, linkId: string, item: string | RegExp): Promise<void> {
  await page.locator(`.links.chips [data-link-id="${linkId}"] .link-chip`).first().click({ button: 'right' })
  await page
    .locator('.link-menu')
    .getByRole(/Otherwise|Auto-send/.test(String(item)) ? 'menuitemcheckbox' : 'menuitem', { name: item })
    .click()
}

test('a split link turns a task list into parallel worker tiles, one task each', async () => {
  const home = tempHome()
  seedWorkspace(home, {
    version: 1,
    viewport: { x: 0, y: 0, zoom: 0.5 },
    tiles: [
      { id: 'p', title: 'Planner', command: 'sleep', args: ['600'], x: 40, y: 40, w: 420, h: 300 },
      sink('b', 'Builder', 560)
    ],
    links: [{ id: 'pb', fromTileId: 'p', toTileId: 'b', mode: 'auto', split: true, instruction: 'Do your task.' }]
  })
  const { app, page } = await launch(home)
  await expect(tiles(page)).toHaveCount(2)
  await expect(page.locator('.link-chip .link-label')).toHaveText(/^split · Auto-send · Do your task\./)
  await page.waitForTimeout(500) // the tiles' PTYs must be up before main accepts their events

  finish(home, 'p', 'Plan:\n1. Alpha task\n2. Beta task\n3. Gamma task', 1)
  await expect(tiles(page)).toHaveCount(4, { timeout: 10_000 })
  await expect(page.locator('.tile-tag', { hasText: 'worker' })).toHaveCount(2)
  await expect(tile(page, 'Builder 3')).toBeVisible()
  const ids = await tiles(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.tileId!))
  const got = () => ids.slice(1).map((id) => read(join(home, `got-${id}.txt`)))
  await expect
    .poll(() => got().map((t) => t.slice(0, 80)), { timeout: 10_000 })
    .toEqual([
      expect.stringContaining('Your task'),
      expect.stringContaining('Your task'),
      expect.stringContaining('Your task')
    ])
  const [b, w2, w3] = got()
  expect(b).toContain('Your task (1 of 3, others run in parallel):\nAlpha task')
  expect(w2).toContain('Beta task')
  expect(w3).toContain('Gamma task')
  expect(w3).toContain('Do your task.')
  await app.close()
})

test('conditions set from the link menu route a result to one tile or the other', async () => {
  const home = tempHome()
  seedWorkspace(home, {
    version: 1,
    viewport: { x: 0, y: 0, zoom: 0.6 },
    tiles: [
      { id: 'r', title: 'Reviewer', command: 'sleep', args: ['600'], x: 40, y: 200, w: 420, h: 300 },
      sink('fix', 'Fixer', 700, 0),
      sink('ship', 'Shipper', 700, 420)
    ],
    links: [
      { id: 'rf', fromTileId: 'r', toTileId: 'fix', mode: 'manual', instruction: 'Fix it.' },
      { id: 'rs', fromTileId: 'r', toTileId: 'ship', mode: 'manual', instruction: 'Ship it.' }
    ]
  })
  const { app, page } = await launch(home)
  await expect(tiles(page)).toHaveCount(3)

  await linkMenu(page, 'rf', 'Only when result contains…')
  const ask = page.getByRole('dialog', { name: /Only hand off to Fixer when Reviewer/ })
  await ask.getByRole('textbox').fill('CHANGES REQUESTED')
  await ask.getByRole('button', { name: 'Save' }).click()
  await linkMenu(page, 'rf', /Auto-send/)
  await linkMenu(page, 'rs', /Otherwise/)
  await linkMenu(page, 'rs', /Auto-send/)
  const label = (id: string) => page.locator(`.links.chips [data-link-id="${id}"] .link-label`).first()
  await expect(label('rf')).toHaveText('if “CHANGES REQUE…” · Auto-send · Fix it.')
  await expect(label('rs')).toHaveText('otherwise · Auto-send · Ship it.')
  await page.waitForTimeout(500)

  finish(home, 'r', 'Missing tests.\nCHANGES REQUESTED', 1)
  await expect.poll(() => read(join(home, 'got-fix.txt')), { timeout: 10_000 }).toContain('Missing tests.')
  expect(read(join(home, 'got-ship.txt'))).toBe('')

  finish(home, 'r', 'All good. APPROVED', 2)
  await expect.poll(() => read(join(home, 'got-ship.txt')), { timeout: 10_000 }).toContain('All good. APPROVED')
  expect(read(join(home, 'got-fix.txt'))).not.toContain('All good')
  await app.close()
})
