import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { spawn } from 'node-pty'
import { IPC, type InputRequest, type KillRequest, type ResizeRequest, type SpawnRequest } from '../shared/ipc'
import { PtyManager } from './pty-manager'

let win: BrowserWindow | null = null

const ptys = new PtyManager(
  spawn,
  (e) => win?.webContents.send(IPC.data, e),
  (e) => win?.webContents.send(IPC.exit, e)
)

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 200

ipcMain.handle(IPC.spawn, (_e, req: SpawnRequest) => {
  if (!isId(req?.tileId)) throw new Error('bad tileId')
  ptys.spawn(req)
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

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => ptys.killAll())
