import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import { TerminalTile } from './TerminalTile'

// No StrictMode: its double mount would spawn and kill a PTY on every start.
createRoot(document.getElementById('root')!).render(
  <main className="app">
    <TerminalTile tileId="tile-1" title="shell" />
  </main>
)
