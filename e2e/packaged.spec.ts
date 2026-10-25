import { _electron, expect, test, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tempHome } from './app'

// Opt-in: `npm run dist` first, then `PACKAGED=1 npx playwright test packaged`.
const exe = join(process.cwd(), 'dist', 'linux-unpacked', 'tilework')
test.skip(!process.env.PACKAGED || !existsSync(exe), 'needs PACKAGED=1 and a dist build')

/** Zoom out so the tile shows its text snapshot (live xterm draws to WebGL). */
async function zoomOut(page: Page): Promise<void> {
  await page.mouse.move(400, 100)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, 120)
  await page.keyboard.up('Control')
}

test('the packaged app starts a real shell tile', async () => {
  const home = tempHome()
  const app = await _electron.launch({
    executablePath: exe,
    args: ['--ozone-platform=x11'],
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), XDG_RUNTIME_DIR: home, SHELL: '/bin/sh' }
  })
  const page = await app.firstWindow()
  await page.getByRole('button', { name: /Shell/ }).click()
  await zoomOut(page)
  const snapshot = page.locator('.tile-snapshot')
  await expect(snapshot).toContainText('$', { timeout: 10_000 }) // the shell is up
  await snapshot.click() // back to 100% on the tile
  await page.keyboard.type('echo pty-$((6*7))\n')
  await zoomOut(page)
  await expect(snapshot).toContainText('pty-42', { timeout: 10_000 })
  await app.close()
})
