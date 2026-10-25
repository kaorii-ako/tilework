import { _electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Workspace } from '../src/shared/types'

/** A throwaway home folder, so tests never touch the real ~/.config, ~/.claude or status file. */
export function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'agent-canvas-e2e-'))
}

/**
 * Launch the built app with `home` as its home. With `realClaude`, the real home stays (for
 * claude's login and ~/.claude/settings.json) and only the app's config and status file go to
 * `home`, and the parent's environment is passed through untouched, Claude Code variables included.
 */
export async function launch(
  home: string,
  { realClaude = false } = {}
): Promise<{ app: ElectronApplication; page: Page }> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined && (realClaude || !k.startsWith('CLAUDE'))) env[k] = v
  Object.assign(env, { XDG_CONFIG_HOME: join(home, '.config'), XDG_RUNTIME_DIR: home, AGENT_CANVAS_E2E: '1' })
  if (!realClaude) Object.assign(env, { HOME: home, SHELL: '/bin/sh' })
  // X11 (XWayland), so the window can be put on another workspace, and keep rendering there.
  const app = await _electron.launch({
    args: ['.', '--ozone-platform=x11', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
    env
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  showOnSpareWorkspace(app)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive())
  return { app, page }
}

/**
 * The app starts hidden under e2e. Before it is mapped, ask the window manager to put it on
 * workspace E2E_WORKSPACE (0-based, default 1 = "Workspace 2"), so runs never cover your work.
 * Needs xdotool and xprop; without them the window just shows on the current workspace.
 */
function showOnSpareWorkspace(app: ElectronApplication): void {
  const desktop = process.env.E2E_WORKSPACE ?? '1'
  try {
    const ids = execFileSync('xdotool', ['search', '--all', '--pid', String(app.process().pid), '--name', 'Tilework'])
      .toString()
      .split('\n')
      .filter(Boolean)
    for (const id of ids)
      execFileSync('xprop', ['-id', id, '-f', '_NET_WM_DESKTOP', '32c', '-set', '_NET_WM_DESKTOP', desktop])
  } catch {
    /* no X tools: shows on the current workspace */
  }
}

export function seedWorkspace(home: string, ws: Workspace): void {
  const dir = join(home, '.config', 'agent-canvas')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'workspace.json'), JSON.stringify(ws))
}

export const tiles = (page: Page) => page.locator('[data-tile-id]')
export const tile = (page: Page, title: string) =>
  page.locator('.tile', { has: page.locator('.tile-title', { hasText: new RegExp(`^${title}$`) }) })

/** The world transform's scale, i.e. the zoom level. */
export const zoomOf = (page: Page) =>
  page.evaluate(() =>
    Number(/scale\(([\d.]+)\)/.exec(document.querySelector<HTMLElement>('.world')!.style.transform)?.[1])
  )

export async function newShell(page: Page): Promise<void> {
  const before = await tiles(page).count()
  if (before === 0) await page.getByRole('button', { name: 'Shell', exact: true }).click()
  else {
    await page.getByRole('button', { name: '+ New tile' }).click()
    await page.getByRole('dialog', { name: 'New tile' }).getByRole('button', { name: 'Shell', exact: true }).click()
  }
  await expect(tiles(page)).toHaveCount(before + 1)
}

/** Press on `from`'s right edge and release over `to`. */
export async function dragLink(page: Page, from: string, to: string): Promise<void> {
  const edge = (await tile(page, from).locator('.link-edge').boundingBox())!
  const target = (await tile(page, to).boundingBox())!
  await tile(page, from).hover()
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 })
  await page.mouse.up()
}
