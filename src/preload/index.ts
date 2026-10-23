import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type CanvasApi, type DataEvent, type ExitEvent, type StatusEvent } from '../shared/ipc'

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
  onData: (cb) => listen<DataEvent>(IPC.data, cb),
  onExit: (cb) => listen<ExitEvent>(IPC.exit, cb),
  onStatus: (cb) => listen<StatusEvent>(IPC.status, cb)
}

contextBridge.exposeInMainWorld('canvasApi', api)
