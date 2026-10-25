import { useEffect, useState } from 'react'
import { useCanvas } from './store'
import { notifyEnabled, setNotifyEnabled } from './notify'

const HINT_KEY = 'agent-canvas.link-hint-done'

function hintDone(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}

function markHintDone(): void {
  try {
    localStorage.setItem(HINT_KEY, '1')
  } catch {
    /* the hint just shows again next time */
  }
}

/** First time there are two tiles and no link yet: say how to link. Gone for good after the first link. */
function LinkHint() {
  const tiles = useCanvas((s) => s.tiles.length)
  const links = useCanvas((s) => s.links.length)
  const [done, setDone] = useState(hintDone)
  useEffect(() => {
    if (links > 0 && !done) {
      markHintDone()
      setDone(true)
    }
  }, [links, done])
  if (done || tiles < 2 || links > 0) return null
  return (
    <div className="hint" role="status">
      Drag from a tile’s right edge onto another tile to link them.
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          markHintDone()
          setDone(true)
        }}
      >
        ×
      </button>
    </div>
  )
}

const HELP: [string, string][] = [
  ['Start an agent', 'New tile, or Ctrl+Shift+N'],
  ['Start a workflow', 'Several agents already linked: New tile → Workflow…'],
  ['Link two tiles', 'Drag from a tile’s right edge onto another tile'],
  ['Say what to do', 'Click the label on a line: what the next agent should do with the result'],
  ['Hand off', 'When the first agent finishes, click Send → on the line'],
  ['Hand off by itself', 'Right-click the line, then Auto-send'],
  ['Remove a link', 'Click the line and press Delete, or right-click it'],
  ['Save a workflow', 'File → Save canvas as workflow…'],
  ['Move around', 'Scroll or drag the background; hold Space to drag from anywhere'],
  ['Zoom', 'Ctrl+scroll or pinch; click a zoomed-out tile to work in it']
]

function NotifyToggle() {
  const [on, setOn] = useState(notifyEnabled)
  return (
    <label className="help-toggle">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setNotifyEnabled(e.target.checked)
          setOn(e.target.checked)
        }}
      />
      Notify me when an agent finishes or needs me (while Tilework isn’t focused)
    </label>
  )
}

function Help({ onClose }: { onClose(): void }) {
  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e.target instanceof Element && e.target.closest('.help, .toolbar')) return
      onClose()
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close, true)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', close, true)
    }
  }, [onClose])
  return (
    <div className="help" role="dialog" aria-label="Help">
      <dl>
        {HELP.map(([what, how]) => (
          <div key={what}>
            <dt>{what}</dt>
            <dd>{how}</dd>
          </div>
        ))}
      </dl>
      <NotifyToggle />
    </div>
  )
}

/** The one toolbar, bottom center: New tile, Zoom to fit, Help. */
export function Toolbar({ onNewTile, onFit }: { onNewTile(): void; onFit(): void }) {
  const [help, setHelp] = useState(false)
  return (
    <>
      <LinkHint />
      {help && <Help onClose={() => setHelp(false)} />}
      <div className="toolbar" role="toolbar">
        <button type="button" onClick={onNewTile} title="New tile (Ctrl+Shift+N)">
          + New tile
        </button>
        <button type="button" onClick={onFit} title="Show every tile">
          Zoom to fit
        </button>
        <button type="button" className="icon" aria-label="Help" aria-expanded={help} onClick={() => setHelp(!help)}>
          ?
        </button>
      </div>
    </>
  )
}
