// Opens the zoom spike in Electron (same Chromium as the app). `--report [dir]` runs every
// approach/renderer/zoom combo, prints JSON and saves screenshots to dir, then quits.
import { app, BrowserWindow } from 'electron'
import { createServer } from 'vite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const i = process.argv.indexOf('--report')
const reportDir = i < 0 ? null : (process.argv[i + 1] ?? 'spike-report')

// No top-level await on whenReady: in an ESM main it deadlocks (ready waits for the module).
app.whenReady().then(async () => {
  const server = await createServer({ root: import.meta.dirname, configFile: false, logLevel: 'warn' })
  await server.listen()
  app.on('window-all-closed', async () => {
    await server.close()
    app.quit()
  })
  const win = new BrowserWindow({
    width: 1800,
    height: 1000,
    backgroundColor: '#0f1115',
    webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false }
  })
  await win.loadURL(server.resolvedUrls.local[0])
  if (reportDir) await report(win, reportDir)
})

async function report(win, dir) {
  mkdirSync(dir, { recursive: true })
  const js = (code) => win.webContents.executeJavaScript(code)
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const out = { dpr: await js('devicePixelRatio'), hit: [], perf: [] }
  for (const r of ['webgl', 'dom']) {
    for (const a of ['transform', 'font', 'hybrid']) {
      console.error(new Date().toISOString(), r, a)
      await js(`spike.setStreaming(true); spike.set('${a}', '${r}', 1)`)
      await wait(500)
      out.perf.push(await js('spike.perfSweep()'))
      await js('spike.setStreaming(false)')
      for (const z of [0.5, 0.75, 1, 1.5]) {
        await js(`spike.set('${a}', '${r}', ${z})`)
        await wait(400)
        out.hit.push(await js('spike.hitTest()'))
        const png = await win.webContents.capturePage({ x: 0, y: 44, width: 700, height: 420 })
        writeFileSync(join(dir, `${r}-${a}-${z}.png`), png.toPNG())
      }
    }
  }
  writeFileSync(join(dir, 'report.json'), JSON.stringify(out, null, 1))
  console.log(JSON.stringify(out))
  win.close()
}
