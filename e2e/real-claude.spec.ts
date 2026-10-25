import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, seedWorkspace, tempHome, tile } from './app'

// Opt-in, costs a few cheap model calls: REAL_CLAUDE=1 npm run e2e -- real-claude
// Needs claude logged in and the Agent Canvas hook installed in ~/.claude/settings.json.
test.skip(!process.env.REAL_CLAUDE, 'set REAL_CLAUDE=1 to run against real Claude Code')
test.setTimeout(240_000)

const dot = (page: Page, title: string) => tile(page, title).locator('.dot')

/** Record every state a tile's dot takes; short ones (a fast "working") are easy to miss by polling. */
async function watchDot(page: Page, title: string): Promise<() => Promise<string[]>> {
  const handle = await tile(page, title)
    .locator('.dot')
    .evaluateHandle((el) => {
      const seen: string[] = []
      new MutationObserver(() => seen.push(el.getAttribute('data-state')!)).observe(el, { attributes: true })
      return seen
    })
  return () => handle.jsonValue()
}

/** B's visible text, read from its zoomed-out snapshot. */
async function screenText(page: Page, title: string): Promise<string> {
  await page.mouse.move(700, 120)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, 120)
  await page.keyboard.up('Control')
  const text = await tile(page, title).locator('.tile-snapshot').innerText()
  await page.getByRole('button', { name: 'Zoom to fit' }).click()
  return text
}

async function ask(page: Page, title: string, prompt: string): Promise<void> {
  await tile(page, title).locator('.tile-body').click()
  await page.keyboard.type(prompt)
  await page.keyboard.press('Enter')
}

test('two real Claude Code tiles: status dots, Send →, and Auto-send', async () => {
  const home = tempHome()
  // One-line answers and no tools, so Auto-send's "Continue from this." can't send B off into the repo.
  const rule = 'Answer in one short line. Never use tools.'
  const claude = { command: 'claude', args: ['--model', 'haiku', '--append-system-prompt', rule], cwd: process.cwd() }
  seedWorkspace(home, {
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    tiles: [
      { id: 'a', title: 'A', ...claude, x: 40, y: 80, w: 600, h: 420 },
      { id: 'b', title: 'B', ...claude, x: 736, y: 80, w: 600, h: 420 }
    ],
    links: [{ id: 'ab', fromTileId: 'a', toTileId: 'b', mode: 'manual' }]
  })
  const { app, page } = await launch(home, { realClaude: true })
  await expect(dot(page, 'A')).toHaveAttribute('data-state', 'idle', { timeout: 60_000 }) // SessionStart
  await expect(dot(page, 'B')).toHaveAttribute('data-state', 'idle', { timeout: 60_000 })

  // Manual: A answers, Send → appears, clicking it pastes into B (no Enter).
  const aStates = await watchDot(page, 'A')
  await ask(page, 'A', 'Reply with exactly this and nothing else: KIWI-314')
  const send = page.getByRole('button', { name: 'Send handoff' })
  await expect(send).toBeVisible({ timeout: 90_000 })
  await expect(dot(page, 'A')).toHaveAttribute('data-state', 'idle')
  expect(await aStates()).toContain('working')
  await page.screenshot({ path: 'test-results/real-02-send-ready.png' })
  await send.click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/real-03-pasted.png' })
  await expect(dot(page, 'B')).toHaveAttribute('data-state', 'idle') // pasted, not submitted
  expect(await screenText(page, 'B')).toMatch(/Pasted text|KIWI-314/)

  // Clear B's prompt, switch the link to Auto-send, and B starts on A's next answer by itself.
  await tile(page, 'B').locator('.tile-body').click()
  await page.keyboard.press('Control+C')
  await page.locator('.link-hit').click({ button: 'right', force: true })
  await page.getByRole('menuitemcheckbox', { name: /Auto-send/ }).click()
  await expect(page.locator('.link-chip')).toHaveText(/Auto-send/)
  const bStates = await watchDot(page, 'B')
  await ask(page, 'A', 'Reply with exactly this and nothing else: LIME-271')
  await expect.poll(bStates, { timeout: 120_000 }).toContain('working') // B started by itself
  await expect(dot(page, 'B')).toHaveAttribute('data-state', 'idle', { timeout: 120_000 })
  expect(await screenText(page, 'B')).toContain('LIME-271')
  await page.screenshot({ path: 'test-results/real-05-b-answered.png' })
  await app.close()
})

/** Zoom to a tile (click its snapshot), run `f` with its terminal live, then zoom back out to fit. */
async function inTile(page: Page, title: string, f: () => Promise<void>) {
  await tile(page, title).locator('.tile-snapshot').click()
  await expect(tile(page, title).locator('.tile-snapshot')).toHaveCount(0)
  await f()
  await page.getByRole('button', { name: 'Zoom to fit' }).click()
}

test('Plan → Build → Review on a tiny task, handing off with Send → at each step', async () => {
  test.setTimeout(15 * 60_000)
  const repo = mkdtempSync(join(tmpdir(), 'agent-canvas-real-'))
  writeFileSync(
    join(repo, 'package.json'),
    JSON.stringify({ name: 'tiny', type: 'module', scripts: { test: 'node --test' } })
  )
  execFileSync('git', ['init', '-q'], { cwd: repo })
  const { app, page } = await launch(tempHome(), { realClaude: true })
  await page
    .getByRole('button', { name: 'Not now' })
    .click({ timeout: 3000 })
    .catch(() => {})
  await page.evaluate((r) => localStorage.setItem('agent-canvas.recent-folders', JSON.stringify([r])), repo)
  await page.getByRole('button', { name: 'Start a workflow' }).click()
  const picker = page.getByRole('dialog', { name: 'Start a workflow' })
  await expect(picker.locator('.folder-line')).toContainText(repo.split('/').pop()!)
  await picker.getByRole('radio', { name: 'Plan → Build → Review' }).click()
  await picker.getByRole('button', { name: 'Start', exact: true }).click()

  // A new folder: each claude asks whether to trust it first ("Yes, I trust this folder" is second).
  for (const t of ['Planner', 'Builder', 'Reviewer']) {
    await expect(tile(page, t).locator('.tile-snapshot')).toContainText(/trust|❯/i, { timeout: 60_000 })
    if (/trust/i.test(await tile(page, t).locator('.tile-snapshot').innerText()))
      await inTile(page, t, async () => {
        await page.keyboard.press('ArrowDown') // the default is "No, exit"
        await page.keyboard.press('Enter')
      })
  }
  for (const t of ['Planner', 'Builder', 'Reviewer'])
    await expect(dot(page, t)).toHaveAttribute('data-state', 'idle', { timeout: 60_000 })
  await page.screenshot({ path: 'test-results/pbr-1-started.png' })

  const send = page.locator('.link-chip.send')
  await inTile(page, 'Planner', () =>
    ask(
      page,
      'Planner',
      'Plan this, short and concrete, and do not write any code yourself: add a function that reverses a string, ' +
        'in reverse.js (ES module, named export reverse), with a test in reverse.test.js using node:test. `npm test` must pass.'
    )
  )
  await expect(send).toHaveCount(1, { timeout: 5 * 60_000 }) // Planner finished: Send → on Planner → Builder
  await page.screenshot({ path: 'test-results/pbr-2-plan-ready.png' })
  await send.click()
  await inTile(page, 'Builder', () => page.keyboard.press('Enter')) // the paste waits for Enter
  await expect(send).toHaveCount(1, { timeout: 8 * 60_000 }) // Builder finished: Send → on Builder → Reviewer
  await page.screenshot({ path: 'test-results/pbr-3-built.png' })
  expect(readFileSync(join(repo, 'reverse.js'), 'utf8')).toMatch(/export/)
  expect(existsSync(join(repo, 'reverse.test.js'))).toBe(true)
  execFileSync('npm', ['test'], { cwd: repo, stdio: 'pipe' }) // throws if the tests fail

  const reviewer = await watchDot(page, 'Reviewer')
  await send.click()
  await inTile(page, 'Reviewer', () => page.keyboard.press('Enter'))
  await expect.poll(reviewer, { timeout: 60_000 }).toContain('working')
  await expect(dot(page, 'Reviewer')).toHaveAttribute('data-state', 'idle', { timeout: 8 * 60_000 })
  await page.screenshot({ path: 'test-results/pbr-4-reviewed.png' })
  await inTile(page, 'Reviewer', async () => {
    await page.screenshot({ path: 'test-results/pbr-5-review.png' })
  })
  await app.close()
})
