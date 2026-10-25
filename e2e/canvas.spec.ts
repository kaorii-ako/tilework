import { expect, test } from '@playwright/test'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dragLink, launch, newShell, seedWorkspace, tempHome, tile, tiles, zoomOf } from './app'

test('the empty canvas starts a tile', async () => {
  const { app, page } = await launch(tempHome())
  await expect(page.getByRole('heading', { name: 'Start an agent' })).toBeVisible()
  await expect(page.getByRole('toolbar')).toHaveCount(0) // nothing but the two buttons
  await newShell(page)
  await expect(tile(page, 'Shell')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Start an agent' })).toHaveCount(0)
  await expect(page.getByRole('toolbar')).toBeVisible()
  await app.close()
})

test('dragging a tile moves it without rebuilding its terminal', async () => {
  const { app, page } = await launch(tempHome())
  await newShell(page)
  const t = tile(page, 'Shell')
  await t.locator('.xterm').evaluate((el) => ((el as HTMLElement & { marked?: boolean }).marked = true))
  const before = (await t.boundingBox())!
  const bar = (await t.locator('.tile-bar').boundingBox())!
  await page.mouse.move(bar.x + 60, bar.y + 12)
  await page.mouse.down()
  await page.mouse.move(bar.x + 210, bar.y + 92, { steps: 10 })
  await page.mouse.up()
  const after = (await t.boundingBox())!
  expect(after.x - before.x).toBeCloseTo(150, 0)
  expect(after.y - before.y).toBeCloseTo(80, 0)
  expect(await t.locator('.xterm').evaluate((el) => (el as HTMLElement & { marked?: boolean }).marked)).toBe(true)
  await app.close()
})

test('ctrl+scroll zooms out to snapshots, Zoom to fit comes back', async () => {
  const { app, page } = await launch(tempHome())
  await newShell(page)
  await page.mouse.move(200, 200)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, 300)
  await page.keyboard.up('Control')
  await expect.poll(() => zoomOf(page)).toBeLessThan(1)
  await expect(page.locator('.tile-snapshot')).toBeVisible()
  await page.getByRole('button', { name: 'Zoom to fit' }).click()
  await expect.poll(() => zoomOf(page)).toBe(1) // one tile fits at 100%
  await expect(page.locator('.tile-snapshot')).toHaveCount(0)
  await app.close()
})

test('dragging from an edge links two tiles, and the line stays on the ports', async () => {
  const { app, page } = await launch(tempHome())
  await newShell(page)
  await newShell(page)
  const hint = page.getByRole('status').filter({ hasText: 'right edge' }) // first-time hint
  await expect(hint).toBeVisible()
  await dragLink(page, 'Shell', 'Shell 2')
  await expect(page.locator('.link')).toHaveCount(1)
  await expect(hint).toHaveCount(0)

  // Move the target; the line's ends must still sit on A's right edge and B's left edge.
  const bar = (await tile(page, 'Shell 2').locator('.tile-bar').boundingBox())!
  await page.mouse.move(bar.x + 80, bar.y + 12)
  await page.mouse.down()
  await page.mouse.move(bar.x + 120, bar.y + 140, { steps: 6 })
  await page.mouse.up()
  const ends = await page.locator('.link-line').evaluate((p: SVGPathElement) => {
    const m = p.getScreenCTM()!
    const at = (q: DOMPoint) => ({ x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f })
    return [at(p.getPointAtLength(0)), at(p.getPointAtLength(p.getTotalLength()))]
  })
  const a = (await tile(page, 'Shell').boundingBox())!
  const b = (await tile(page, 'Shell 2').boundingBox())!
  expect(Math.abs(ends[0].x - (a.x + a.width))).toBeLessThan(2)
  expect(Math.abs(ends[0].y - (a.y + a.height / 2))).toBeLessThan(2)
  expect(Math.abs(ends[1].x - b.x)).toBeLessThan(2)
  expect(Math.abs(ends[1].y - (b.y + b.height / 2))).toBeLessThan(2)
  await app.close()
})

test('a finished result shows Send → on the line, and clicking it pastes into the next tile', async () => {
  const home = tempHome()
  const got = join(home, 'got.txt')
  seedWorkspace(home, {
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    tiles: [
      { id: 'a', title: 'A', command: 'sleep', args: ['600'], x: 40, y: 40, w: 500, h: 360 },
      { id: 'b', title: 'B', command: `cat > '${got}'`, shell: true, x: 640, y: 40, w: 500, h: 360 }
    ],
    links: [{ id: 'ab', fromTileId: 'a', toTileId: 'b', mode: 'manual' }]
  })
  const { app, page } = await launch(home)
  await expect(tiles(page)).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Send handoff' })).toHaveCount(0)

  // What the Claude Code Stop hook would do: point at a transcript under ~/.claude.
  mkdirSync(join(home, '.claude'), { recursive: true })
  const transcript = join(home, '.claude', 'session.jsonl')
  const message = { type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'PLAN-42 is ready' }] } }
  writeFileSync(transcript, JSON.stringify(message) + '\n')
  await page.waitForTimeout(500) // the tile's PTY must be up before main accepts its events
  appendFileSync(
    join(home, 'agent-canvas-status.jsonl'),
    JSON.stringify({ tile: 'a', event: 'Stop', transcript }) + '\n'
  )

  const send = page.getByRole('button', { name: 'Send handoff' })
  await expect(send).toBeVisible({ timeout: 10_000 })
  await send.click()
  // The link has no instruction yet, so the first Send asks for one and keeps it.
  const ask = page.getByRole('dialog', { name: 'What should B do with this?' })
  await ask.getByRole('textbox').fill('Review this for bugs')
  await ask.getByRole('button', { name: 'Send' }).click()
  await expect.poll(() => readFileSync(got, 'utf8'), { timeout: 5000 }).toContain('PLAN-42 is ready')
  expect(readFileSync(got, 'utf8')).toContain('Handoff from A:')
  await expect(page.locator('.link-chip .link-label').first()).toHaveText('Review this for bugs')
  await expect(send).toHaveCount(0)
  await app.close()
})

test('tiles and links come back after a restart', async () => {
  const home = tempHome()
  let { app, page } = await launch(home)
  await newShell(page)
  await newShell(page)
  await dragLink(page, 'Shell', 'Shell 2')
  await expect(page.locator('.link')).toHaveCount(1)
  const before = await tiles(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
  await page.waitForTimeout(500) // let the debounced save land
  await app.close()
  ;({ app, page } = await launch(home))
  await expect(tiles(page)).toHaveCount(2)
  await expect(tile(page, 'Shell')).toBeVisible()
  await expect(tile(page, 'Shell 2')).toBeVisible()
  await expect(page.locator('.link')).toHaveCount(1)
  const after = await tiles(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
  expect(after).toEqual(before)
  await app.close()
})

test('Install puts the hook in settings.json, keeps other hooks, and a hooked tile auto-sends', async () => {
  const home = tempHome()
  const settingsPath = join(home, '.claude', 'settings.json')
  const theirs = {
    model: 'opus',
    hooks: { Stop: [{ hooks: [{ type: 'command', command: '/opt/other-tool/hook --agent claude-code' }] }] }
  }
  mkdirSync(join(home, '.claude'), { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(theirs, null, 2))
  const got = join(home, 'got.txt')
  seedWorkspace(home, {
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    tiles: [
      {
        id: 'a',
        title: 'A',
        command: `sh '${join(import.meta.dirname, 'fake-claude.sh')}'`,
        shell: true,
        x: 40,
        y: 80,
        w: 500,
        h: 360
      },
      { id: 'b', title: 'B', command: `cat > '${got}'`, shell: true, x: 640, y: 80, w: 500, h: 360 }
    ],
    links: [{ id: 'ab', fromTileId: 'a', toTileId: 'b', mode: 'auto' }]
  })
  let { app, page } = await launch(home)
  const banner = page.getByRole('status').filter({ hasText: 'Claude Code hook' })
  await expect(banner).toBeVisible()
  await expect(page.locator('.link-chip .link-label')).toHaveText(/Auto-send/)
  await banner.getByRole('button', { name: 'Install' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Hook installed' })).toBeVisible()

  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
  expect(JSON.parse(readFileSync(settingsPath + '.bak', 'utf8'))).toEqual(theirs)
  expect(settings.model).toBe('opus')
  expect(settings.hooks.Stop[0]).toEqual(theirs.hooks.Stop[0])
  expect(settings.hooks.Stop[1].hooks[0].command).toContain(join(home, '.config', 'agent-canvas', 'hooks'))

  // The tile fires the installed hook: its dot changes and the result is sent on its own (auto).
  await expect(tile(page, 'A').locator('.dot')).toHaveAttribute('data-state', 'idle', { timeout: 15_000 })
  await expect
    .poll(() => (existsSync(got) ? readFileSync(got, 'utf8') : ''), { timeout: 10_000 })
    .toContain('REAL-HOOK-RESULT')
  expect(readFileSync(got, 'utf8')).toContain('Continue from this.') // Enter was pressed
  await app.close()

  ;({ app, page } = await launch(home))
  await expect(tiles(page)).toHaveCount(2)
  await expect(page.getByRole('status').filter({ hasText: 'Claude Code hook' })).toHaveCount(0)
  await app.close()
})

test('tiles that start zoomed out show a snapshot of their terminal', async () => {
  const home = tempHome()
  seedWorkspace(home, {
    version: 1,
    viewport: { x: 0, y: 0, zoom: 0.5 },
    tiles: [
      { id: 'a', title: 'A', command: 'echo HELLO-SNAPSHOT; exec sleep 600', shell: true, x: 40, y: 40, w: 600, h: 400 }
    ],
    links: []
  })
  const { app, page } = await launch(home)
  await expect(tile(page, 'A').locator('.tile-snapshot')).toContainText('HELLO-SNAPSHOT', { timeout: 10_000 })
  await app.close()
})
