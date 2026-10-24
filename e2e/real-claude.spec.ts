import { expect, test, type Page } from '@playwright/test'
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
