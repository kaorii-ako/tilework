import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { SignalHub, validMessage, validTopic } from './signal'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { spawn } from 'node-pty'
import { IPC, type InputRequest, type KillRequest, type ResizeRequest, type SpawnRequest } from '../shared/ipc'
import { PtyManager } from './pty-manager'
import { defaultStatusFile, watchStatusFile } from './status-watcher'
import {
  badCwdMessage,
  buildLaunch,
  commandExists,
  hasTranscript,
  isDirectory,
  missingCommandMessage,
  validateSpawn,
  withResume
} from './launch'
import { configPath, loadPresets } from './presets'
import { readResult } from './transcript'
import { createWorktree } from './worktree'
import { WorkspaceStore, parseWorkspace } from './workspace-store'
import { copyScript, installHook, isHookInstalled, readSettings } from './hook-install'
import { loadWorkflows, saveWorkflows } from './workflows-store'

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
  const launch = buildLaunch(
    shell,
    withResume(req, (id) => hasTranscript(join(homedir(), '.claude', 'projects'), id))
  )
  if (!launch) return ptys.spawn(req)
  if (launch.probe && !(await commandExists(shell, launch.probe))) return fail(missingCommandMessage(launch.probe))
  ptys.spawn({ ...req, command: launch.file, args: launch.args })
})
ipcMain.handle(IPC.presets, () => loadPresets())
ipcMain.handle(IPC.createWorktree, (_e, folder: unknown) => createWorktree(folder))
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

const workspace = new WorkspaceStore(configPath('workspace.json'))
ipcMain.handle(IPC.workspaceLoad, () => workspace.load())
ipcMain.on(IPC.workspaceSave, (_e, ws: unknown) => {
  const valid = parseWorkspace(ws)
  if (valid) workspace.schedule(valid)
})

// The hook script ships inside the app (extraResources when packaged) and is copied to the config
// folder, so settings.json points at a path that survives moving or updating the app.
const hookSrc = () =>
  app.isPackaged
    ? join(process.resourcesPath, 'hooks', 'agent-canvas-hook.sh')
    : join(app.getAppPath(), 'hooks', 'agent-canvas-hook.sh')
const hookDest = configPath('hooks/agent-canvas-hook.sh')
const claudeSettings = join(homedir(), '.claude', 'settings.json')
ipcMain.handle(IPC.hookStatus, () => {
  try {
    return isHookInstalled(readSettings(claudeSettings))
  } catch {
    return false // unreadable: Install reports why
  }
})
ipcMain.handle(IPC.hookInstall, () => {
  try {
    installHook(claudeSettings, hookSrc(), hookDest)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

const workflowsPath = configPath('workflows.json')
// Team mode (KAO-54): Chromium hides local addresses from WebRTC behind mDNS names, which don't
// resolve on Linux without avahi, so teammates on one network couldn't connect. Peers here are
// teammates the host approved, so plain local addresses are fine.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns')

// Team mode signaling (KAO-54): main only relays sealed text on `tw-` topics; SignalHub validates both.
const signals = new SignalHub((topic, message) => win?.webContents.send(IPC.teamSignal, { topic, message }))
ipcMain.on(IPC.teamSubscribe, (_e, topic: unknown) => validTopic(topic) && signals.subscribe(topic))
ipcMain.on(IPC.teamUnsubscribe, (_e, topic: unknown) => validTopic(topic) && signals.unsubscribe(topic))
ipcMain.handle(IPC.teamPublish, (_e, topic: unknown, message: unknown) =>
  validTopic(topic) && validMessage(message) ? signals.publish(topic, message) : false
)

ipcMain.handle(IPC.workflowsLoad, () => loadWorkflows(workflowsPath))
ipcMain.handle(IPC.workflowsSave, (_e, list: unknown) => saveWorkflows(workflowsPath, list))

/** File → Save canvas as workflow… (the renderer asks for a name and saves). */
const setMenu = () =>
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: [
          { label: 'Save canvas as workflow…', click: () => win?.webContents.send(IPC.menuSaveWorkflow) },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      { role: 'editMenu' },
      { role: 'viewMenu' }
    ])
  )

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0e1014',
    title: 'Tilework',
    // e2e starts hidden and shows the window itself on a spare workspace, so test runs don't
    // pop up over your work; it keeps rendering while not on screen.
    show: !process.env.AGENT_CANVAS_E2E,
    webPreferences: {
      backgroundThrottling: !process.env.AGENT_CANVAS_E2E,
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
  setMenu()
  // Keep an installed hook script in step with this version of the app.
  if (existsSync(hookDest)) copyScript(hookSrc(), hookDest)
  // PTYs inherit this env var, so the hook writes to the file we tail.
  process.env.AGENT_CANVAS_STATUS_FILE = defaultStatusFile()
  const claudeDir = join(homedir(), '.claude')
  watchStatusFile(process.env.AGENT_CANVAS_STATUS_FILE, (e) => {
    if (!ptys.has(e.tileId)) return
    if ('focus' in e) {
      // Nublet raises our window itself (GNOME won't let an app steal focus); we just show the tile.
      win?.webContents.send(IPC.focusTile, { tileId: e.tileId })
      return
    }
    const { tileId, state, transcript, session } = e
    win?.webContents.send(IPC.status, session ? { tileId, state, session } : { tileId, state })
    // Only our own hook's Stop events for live tiles get here; readResult also confines the path to ~/.claude.
    // Claude Code buffers transcript writes, so the final message can land just after Stop fires.
    // ponytail: fixed delay; poll until the file stops growing if 1s ever proves short.
    if (transcript)
      setTimeout(
        () =>
          readResult(transcript, claudeDir).then(
            (text) => text && ptys.has(tileId) && win?.webContents.send(IPC.result, { tileId, text }),
            () => {}
          ),
        1000
      )
  })
  createWindow()
})
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  signals.closeAll()
  workspace.flush()
  ptys.killAll()
})
