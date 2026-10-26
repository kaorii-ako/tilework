import { expect, test, type Page } from '@playwright/test'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { launch, seedWorkspace, tempHome, tile, tiles } from './app'

/** Just enough of ntfy for signaling: POST /<topic> publishes, GET /<topic>/json streams. */
function fakeNtfy(): Promise<{ url: string; server: Server; posts: () => number }> {
  const subs = new Map<string, Set<ServerResponse>>()
  let posts = 0
  const server = createServer((req, res) => {
    const m = req.url?.match(/^\/([\w-]+)(\/json)?/)
    if (!m) return void res.writeHead(404).end()
    const topic = m[1]
    if (req.method === 'POST') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        posts++
        for (const r of subs.get(topic) ?? []) r.write(JSON.stringify({ event: 'message', message: body }) + '\n')
        res.writeHead(200).end('{}')
      })
      return
    }
    res.writeHead(200, { 'content-type': 'application/x-ndjson' })
    res.write(JSON.stringify({ event: 'open' }) + '\n')
    const set = subs.get(topic) ?? new Set()
    set.add(res)
    subs.set(topic, set)
    req.on('close', () => set.delete(res))
  })
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () =>
      ok({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server, posts: () => posts })
    )
  )
}

/** Each person starts with one shell tile of their own, zoomed out so its snapshot text is readable. */
function home(id: string, title: string) {
  const h = tempHome()
  seedWorkspace(h, {
    version: 1,
    viewport: { x: 0, y: 0, zoom: 0.5 },
    tiles: [{ id, title, x: 40, y: 40, w: 600, h: 400 }],
    links: []
  })
  return h
}

const snapshotOf = (page: Page, title: string) => tile(page, title).locator('.tile-snapshot')

async function openPanel(page: Page) {
  const button = page.locator('.team-bar > button')
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
  return page.getByRole('dialog', { name: 'Team' })
}

test('two people share a canvas: each sees the other’s tile live, read-only, until the host stops', async () => {
  const ntfy = await fakeNtfy()
  // REAL_NTFY=1 signals through the public ntfy.sh instead, to check it end to end.
  const env: Record<string, string> = process.env.REAL_NTFY ? {} : { TILEWORK_SIGNAL_URL: ntfy.url }
  const host = await launch(home('ann-1', 'Ann shell'), { env })
  const guest = await launch(home('bob-1', 'Bob shell'), { env })
  try {
    await expect(tiles(host.page)).toHaveCount(1)
    await expect(tiles(guest.page)).toHaveCount(1)

    // Ann shares.
    let panel = await openPanel(host.page)
    await panel.getByLabel('Your name').fill('Ann')
    await panel.getByRole('button', { name: 'Share this canvas' }).click()
    const code = await panel.getByLabel('Invite code').inputValue()
    expect(code).toMatch(/^tw1\./)

    // Bob joins with the code, and Ann lets him in.
    panel = await openPanel(guest.page)
    await panel.getByLabel('Your name').fill('Bob')
    await panel.getByLabel('Invite code').fill(code)
    await panel.getByRole('button', { name: 'Join' }).click()
    const ask = host.page.getByRole('alertdialog', { name: 'Bob wants to join' })
    await expect(ask).toBeVisible({ timeout: 15_000 })
    await ask.getByRole('button', { name: 'Allow' }).click()

    // Each sees both tiles; the other's is marked with its owner and can't be closed or resized.
    await expect(tiles(guest.page)).toHaveCount(2, { timeout: 20_000 })
    await expect(tiles(host.page)).toHaveCount(2, { timeout: 10_000 })
    await expect(tile(guest.page, 'Ann shell').locator('.tile-owner')).toHaveText('Ann')
    await expect(tile(host.page, 'Bob shell').locator('.tile-owner')).toHaveText('Bob')
    await expect(tile(guest.page, 'Ann shell').locator('.tile-close')).toHaveCount(0)
    await expect(tile(guest.page, 'Ann shell').locator('.tile-resize')).toHaveCount(0)
    await expect(guest.page.locator('.team-people .avatar')).toHaveCount(2)

    // What Ann's agent prints shows up in Bob's view of her tile, live.
    await host.page.evaluate(() => window.canvasApi.input({ tileId: 'ann-1', data: 'echo LIVE-$((6*7))\r' }))
    await expect(snapshotOf(guest.page, 'Ann shell')).toContainText('LIVE-42', { timeout: 10_000 })
    // And the other way round.
    await guest.page.evaluate(() => window.canvasApi.input({ tileId: 'bob-1', data: 'echo BOB-$((5*5))\r' }))
    await expect(snapshotOf(host.page, 'Bob shell')).toContainText('BOB-25', { timeout: 10_000 })

    // Ann stops sharing: Bob is told, and her tile leaves his canvas. His own stays.
    panel = await openPanel(host.page)
    await panel.getByRole('button', { name: 'Stop sharing' }).click()
    await expect(tiles(guest.page)).toHaveCount(1, { timeout: 10_000 })
    await expect(tile(guest.page, 'Bob shell')).toBeVisible()
    await expect(tiles(host.page)).toHaveCount(1)
    if (!process.env.REAL_NTFY) expect(ntfy.posts()).toBeGreaterThan(0)
  } finally {
    await host.app.close()
    await guest.app.close()
    ntfy.server.close()
  }
})

test('a denied guest is told so, and nothing is shared', async () => {
  const ntfy = await fakeNtfy()
  const env = { TILEWORK_SIGNAL_URL: ntfy.url }
  const host = await launch(home('ann-1', 'Ann shell'), { env })
  const guest = await launch(home('eve-1', 'Eve shell'), { env })
  try {
    let panel = await openPanel(host.page)
    await panel.getByLabel('Your name').fill('Ann')
    await panel.getByRole('button', { name: 'Share this canvas' }).click()
    const code = await panel.getByLabel('Invite code').inputValue()
    panel = await openPanel(guest.page)
    await panel.getByLabel('Your name').fill('Eve')
    await panel.getByLabel('Invite code').fill(code)
    await panel.getByRole('button', { name: 'Join' }).click()
    const ask = host.page.getByRole('alertdialog', { name: 'Eve wants to join' })
    await expect(ask).toBeVisible({ timeout: 15_000 })
    await ask.getByRole('button', { name: 'Deny' }).click()
    await expect(guest.page.getByRole('alert')).toContainText('said no', { timeout: 10_000 })
    await expect(tiles(guest.page)).toHaveCount(1)
    await expect(tiles(host.page)).toHaveCount(1)
  } finally {
    await host.app.close()
    await guest.app.close()
    ntfy.server.close()
  }
})
