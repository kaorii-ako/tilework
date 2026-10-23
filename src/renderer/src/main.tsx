import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import { Canvas } from './canvas/Canvas'
import { NEW_TILE, canvasStore } from './canvas/store'

// Start with one shell tile. KAO-26 replaces this with the saved layout.
canvasStore.getState().addTile({ id: crypto.randomUUID(), title: 'shell', x: 40, y: 40, ...NEW_TILE })

// No StrictMode: its double mount would spawn and kill a PTY on every start.
createRoot(document.getElementById('root')!).render(<Canvas />)
