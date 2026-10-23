import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { spawn } from 'node-pty'
import { IPC, type InputRequest, type KillRequest, type ResizeRequest, type SpawnRequest } from '../shared/ipc'
import { PtyManager } from './pty-manager'
import { defaultStatusFile, watchStatusFile } from './status-watcher'
import { badCwdMessage, buildLaunch, commandExists, isDirectory, missingCommandMessage, validateSpawn } from './launch'
import { loadPresets } from './presets'

let win: BrowserWindow | null = null

const ptys = new PtyManager(
  spawn,
  (e) => win?.webContents.send(IPC.data, e),
  (e) => win?.webContents.send(IPC.exit, e),
  (e) => win?.webContents.send(IPC.status, e)
)

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 200

ipcMain.handle(IPC.spawn, async (_e, req: SpawnRequest) => {
  if (!isId(req?.tileId)) throw new Error('bad tileId')
  const bad = validateSpawn(req)
  if (bad) throw new Error(bad)
  const shell = process.env.SHELL || '/bin/bash'
  // Tell the tile why nothing is running, instead of leaving a dead terminal.
  const fail = (msg: string) => {
    win?.webContents.send(IPC.data, { tileId: req.tileId, data: msg })
    win?.webContents.send(IPC.exit, { tileId: req.tileId, code: 127 })
  }
  if (req.cwd && !isDirectory(req.cwd)) return fail(badCwdMessage(req.cwd))
  const launch = buildLaunch(shell, req)
  if (!launch) return ptys.spawn(req)
  if (launch.probe && !(await commandExists(shell, launch.probe))) return fail(missingCommandMessage(launch.probe))
  ptys.spawn({ ...req, command: launch.file, args: launch.args })
})
ipcMain.handle(IPC.presets, () => loadPresets())
ipcMain.handle(IPC.pickFolder, async () => {
  const r = win ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] }) : null
  return r && !r.canceled ? r.filePaths[0] : null
})
ipcMain.on(IPC.input, (_e, { tileId, data }: InputRequest) => {
  if (isId(tileId) && typeof data === 'string') ptys.input(tileId, data)
})
ipcMain.on(IPC.resize, (_e, { tileId, cols, rows }: ResizeRequest) => {
  if (isId(tileId) && Number.isInteger(cols) && Number.isInteger(rows)) ptys.resize(tileId, cols, rows)
})
ipcMain.on(IPC.kill, (_e, { tileId }: KillRequest) => {
  if (isId(tileId)) ptys.kill(tileId)
})

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0f1115',
    title: 'Agent Canvas',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.on('closed', () => (win = null))

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  // PTYs inherit this env var, so the hook writes to the file we tail.
  process.env.AGENT_CANVAS_STATUS_FILE = defaultStatusFile()
  watchStatusFile(process.env.AGENT_CANVAS_STATUS_FILE, (e) => {
    if (ptys.has(e.tileId)) win?.webContents.send(IPC.status, e)
  })
  createWindow()
})
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => ptys.killAll())
