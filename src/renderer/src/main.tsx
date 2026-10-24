import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import { Canvas } from './canvas/Canvas'
import { canvasStore } from './canvas/store'
import { startWorkspace } from './workspace'

// Restores the saved layout (or adds one starting shell tile) and keeps it saved.
void startWorkspace(canvasStore)

// No StrictMode: its double mount would spawn and kill a PTY on every start.
createRoot(document.getElementById('root')!).render(<Canvas />)
