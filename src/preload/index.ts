import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type CanvasApi, type DataEvent, type ExitEvent, type ResultEvent, type StatusEvent } from '../shared/ipc'

function listen<T>(channel: string, cb: (e: T) => void): () => void {
  const handler = (_: IpcRendererEvent, e: T) => cb(e)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: CanvasApi = {
  spawn: (req) => ipcRenderer.invoke(IPC.spawn, req),
  input: (req) => ipcRenderer.send(IPC.input, req),
  resize: (req) => ipcRenderer.send(IPC.resize, req),
  kill: (req) => ipcRenderer.send(IPC.kill, req),
  presets: () => ipcRenderer.invoke(IPC.presets),
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder),
  loadWorkspace: () => ipcRenderer.invoke(IPC.workspaceLoad),
  saveWorkspace: (ws) => ipcRenderer.send(IPC.workspaceSave, ws),
  onData: (cb) => listen<DataEvent>(IPC.data, cb),
  onExit: (cb) => listen<ExitEvent>(IPC.exit, cb),
  onStatus: (cb) => listen<StatusEvent>(IPC.status, cb),
  onResult: (cb) => listen<ResultEvent>(IPC.result, cb)
}

contextBridge.exposeInMainWorld('canvasApi', api)
