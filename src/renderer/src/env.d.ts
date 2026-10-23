import type { CanvasApi } from '../../shared/ipc'

declare global {
  interface Window {
    canvasApi: CanvasApi
  }
}
