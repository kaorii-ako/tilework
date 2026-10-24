import { useEffect, useState } from 'react'
import type { Preset } from '../../shared/types'

export interface LaunchChoice {
  preset: Preset
  cwd?: string
  title?: string
}

const CUSTOM: Preset = { id: 'custom', name: 'Custom command', command: '' }
const RECENT_KEY = 'agent-canvas.recent-folders'

function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string').slice(0, 8) : []
  } catch {
    return []
  }
}

function saveRecent(cwd: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([cwd, ...loadRecent().filter((r) => r !== cwd)].slice(0, 8)))
  } catch {
    /* recents are a convenience */
  }
}

export function Launcher({ onLaunch, onClose }: { onLaunch: (c: LaunchChoice) => void; onClose: () => void }) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [presetId, setPresetId] = useState('')
  const [custom, setCustom] = useState('')
  const [cwd, setCwd] = useState('')
  const [title, setTitle] = useState('')
  const [recent] = useState(loadRecent)

  useEffect(() => {
    window.canvasApi.presets().then((p) => {
      setPresets(p)
      setPresetId((id) => id || p[0]?.id || CUSTOM.id)
    })
  }, [])

  const all = [...presets, CUSTOM]
  const isCustom = presetId === CUSTOM.id
  const ready = !isCustom || custom.trim().length > 0

  const submit = () => {
    if (!ready) return
    let preset = all.find((p) => p.id === presetId) ?? CUSTOM
    if (isCustom) {
      // Passed unsplit to `$SHELL -lc`, so quotes, pipes and aliases work.
      preset = { ...CUSTOM, command: custom.trim(), shell: true }
    }
    if (cwd) saveRecent(cwd)
    onLaunch({ preset, cwd: cwd || undefined, title: title.trim() || undefined })
  }

  return (
    <div className="scrim" onMouseDown={onClose}>
      <form
        className="launcher"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2>New tile</h2>
        <div className="presets" role="radiogroup" aria-label="Preset">
          {all.map((p) => (
            <button
              type="button"
              key={p.id}
              role="radio"
              aria-checked={p.id === presetId}
              className={p.id === presetId ? 'on' : ''}
              // Presets load async, so the selected button mounts with the list and takes focus then.
              autoFocus={p.id === presetId}
              onClick={() => setPresetId(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
        {isCustom && (
          <input
            autoFocus
            placeholder="Shell command, e.g. npm run dev | tee log"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        )}
        <label>
          Folder
          <div className="row">
            <input
              list="recent-folders"
              placeholder="Home folder"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
            />
            <datalist id="recent-folders">
              {recent.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <button type="button" onClick={() => window.canvasApi.pickFolder().then((p) => p && setCwd(p))}>
              Browse
            </button>
          </div>
        </label>
        {recent.length > 0 && (
          <div className="recent">
            {recent.map((r) => (
              <button type="button" key={r} title={r} onClick={() => setCwd(r)}>
                {r.split('/').filter(Boolean).pop() ?? r}
              </button>
            ))}
          </div>
        )}
        <label>
          Title (optional)
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="row end">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!ready}>
            Open tile
          </button>
        </div>
      </form>
    </div>
  )
}
