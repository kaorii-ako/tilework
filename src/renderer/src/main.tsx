import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import { Canvas } from './canvas/Canvas'
import { canvasStore } from './canvas/store'
import { startWorkspace } from './workspace'
import { ptyWrite, startHandoffs } from './canvas/handoff'

// Restores the saved layout (or adds one starting shell tile) and keeps it saved.
void startWorkspace(canvasStore)
// One status listener for the whole app; tiles and link lines read it from the store.
window.canvasApi.onStatus((e) => canvasStore.getState().setStatus(e.tileId, e.state))
// Handoffs (KAO-33): a tile's result marks its links pending; auto links deliver on their own.
window.canvasApi.onResult((e) => canvasStore.getState().setResult(e.tileId, e.text))
startHandoffs(canvasStore, ptyWrite)

// No StrictMode: its double mount would spawn and kill a PTY on every start.
createRoot(document.getElementById('root')!).render(<Canvas />)
