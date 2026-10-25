import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUILTIN_WORKFLOWS } from '../src/shared/workflows'
import { launch, newShell, dragLink, tempHome, tiles } from './app'

/** Link chips' full instructions, read from their accessible names. */
const instructions = (page: Page) =>
  page
    .locator('.link-chip:not(.send)')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.replace(/^Instruction: /, '')))

async function startWorkflow(page: Page, name: string) {
  await page.getByRole('button', { name: 'Start a workflow' }).click()
  const picker = page.getByRole('dialog', { name: 'Start a workflow' })
  await picker.getByRole('radio', { name }).click()
  await picker.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(picker).toHaveCount(0)
}

for (const wf of BUILTIN_WORKFLOWS) {
  test(`starting "${wf.name}" lays out its tiles, links and instructions`, async () => {
    const { app, page } = await launch(tempHome())
    await startWorkflow(page, wf.name)
    await expect(tiles(page)).toHaveCount(wf.tiles.length)
    expect(await page.locator('.tile-title').allInnerTexts()).toEqual(wf.tiles.map((t) => t.title))
    await expect(page.locator('.link')).toHaveCount(wf.links.length)
    expect(await instructions(page)).toEqual(wf.links.map((l) => l.instruction))
    await expect(page.locator('.link-chip', { hasText: 'Auto-send' })).toHaveCount(0) // all manual
    // Left to right, and zoomed so all of it is on screen.
    const boxes = await tiles(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
    const view = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    for (const [i, b] of boxes.entries()) {
      if (i) expect(b.x).toBeGreaterThan(boxes[i - 1].x + boxes[i - 1].width)
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width).toBeLessThanOrEqual(view.width)
    }
    await app.close()
  })
}

test('editing an instruction saves it with the workspace', async () => {
  const home = tempHome()
  let { app, page } = await launch(home)
  await newShell(page)
  await newShell(page)
  await dragLink(page, 'Shell', 'Shell 2')
  await expect(page.locator('.link-chip .link-label')).toHaveText('Add instruction')
  await page.locator('.link-chip').click()
  const dialog = page.getByRole('dialog', { name: /What should Shell 2 do/ })
  await dialog.getByRole('textbox').fill('Summarise this')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.link-chip .link-label')).toHaveText('Summarise this')
  await page.waitForTimeout(500)
  await app.close()
  const saved = JSON.parse(readFileSync(join(home, '.config', 'agent-canvas', 'workspace.json'), 'utf8'))
  expect(saved.links[0].instruction).toBe('Summarise this')
  ;({ app, page } = await launch(home))
  await expect(page.locator('.link-chip .link-label')).toHaveText('Summarise this')
  await app.close()
})

test('File → Save canvas as workflow adds a card that can be renamed and deleted', async () => {
  const home = tempHome()
  const { app, page } = await launch(home)
  await startWorkflow(page, 'Quick fix')
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()!
      .items.find((i) => i.label === 'File')!
      .submenu!.items.find((i) => i.label.startsWith('Save canvas as workflow'))!
      .click()
  )
  const ask = page.getByRole('dialog', { name: 'Save canvas as workflow' })
  await ask.getByRole('textbox').fill('My fix')
  await ask.getByRole('button', { name: 'Save' }).click()
  await expect(ask).toHaveCount(0)
  const file = join(home, '.config', 'agent-canvas', 'workflows.json')
  await expect.poll(() => JSON.parse(readFileSync(file, 'utf8'))[0]?.name).toBe('My fix')
  const saved = JSON.parse(readFileSync(file, 'utf8'))[0]
  expect(saved.tiles.map((t: { args: string[] }) => t.args)).toEqual([
    ['--model', 'sonnet'],
    ['--model', 'haiku']
  ])
  expect(saved.links[0].instruction).toBe('Run the tests and lint, and report anything that fails.')

  // It shows up in the picker (via + New tile → Workflow…); right-click renames, then deletes it.
  await page.getByRole('button', { name: '+ New tile' }).click()
  await page.getByRole('button', { name: 'Workflow…' }).click()
  const picker = page.getByRole('dialog', { name: 'Start a workflow' })
  await picker.getByRole('radio', { name: 'My fix' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename…' }).click()
  const rename = page.getByRole('dialog', { name: 'Rename workflow' })
  await rename.getByRole('textbox').fill('Fix + check')
  await rename.getByRole('button', { name: 'Rename' }).click()
  await expect(picker.getByRole('radio', { name: 'Fix + check' })).toBeVisible()
  await picker.getByRole('radio', { name: 'Plan → Build → Review' }).click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0) // built-ins can't be deleted
  await picker.getByRole('radio', { name: 'Fix + check' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(picker.getByRole('radio', { name: 'Fix + check' })).toHaveCount(0)
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([])

  // Starting it again puts a second copy to the right, with numbered names.
  await picker.getByRole('radio', { name: 'Quick fix' }).click()
  await picker.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(tiles(page)).toHaveCount(4)
  expect(await page.locator('.tile-title').allInnerTexts()).toEqual(['Fixer', 'Checker', 'Fixer 2', 'Checker 2'])
  await app.close()
})
