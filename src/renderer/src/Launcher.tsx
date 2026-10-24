import { useEffect, useState } from 'react'
import type { Preset } from '../../shared/types'

export interface LaunchChoice {
  preset: Preset
  cwd?: string
  title?: string
}

const CUSTOM: Preset = { id: 'custom', name: 'Custom command', command: '' }
/** The two big buttons; every other preset sits under "More options". */
const MAIN = ['claude', 'shell']
const RECENT_KEY = 'agent-canvas.recent-folders'

export function loadRecent(): string[] {
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

const folderName = (p: string) => p.split('/').filter(Boolean).pop() ?? p

function usePresets(): Preset[] {
  const [presets, setPresets] = useState<Preset[]>([])
  useEffect(() => {
    window.canvasApi.presets().then(setPresets)
  }, [])
  return presets
}

/** Claude Code and Shell first (falling back to the first two presets), the rest after. */
function split(presets: Preset[]): [Preset[], Preset[]] {
  const main = MAIN.map((id) => presets.find((p) => p.id === id)).filter((p): p is Preset => !!p)
  const big = main.length ? main : presets.slice(0, 2)
  return [big, presets.filter((p) => !big.includes(p))]
}

/** A big "start this agent" button. The first one takes focus, so Enter starts it. */
function BigButtons({ presets, onPick }: { presets: Preset[]; onPick(p: Preset): void }) {
  return (
    <div className="big-buttons">
      {presets.map((p, i) => (
        <button type="button" key={p.id} className="big" autoFocus={i === 0} onClick={() => onPick(p)}>
          {p.name}
        </button>
      ))}
    </div>
  )
}

/**
 * The empty canvas: one centered prompt with the two big buttons and the folder they start in
 * (the last one used, or home), which "change" picks.
 */
export function EmptyState({ onLaunch }: { onLaunch(c: LaunchChoice): void }) {
  const [big] = split(usePresets())
  const [folder, setFolder] = useState<string | undefined>(() => loadRecent()[0])
  const change = async () => {
    const p = await window.canvasApi.pickFolder()
    if (!p) return
    saveRecent(p)
    setFolder(p)
  }
  return (
    <div className="empty">
      <h1>Start an agent</h1>
      <BigButtons presets={big} onPick={(preset) => onLaunch({ preset, cwd: folder })} />
      <p className="empty-folder">
        in <span title={folder}>{folder ? folderName(folder) : 'your home folder'}</span> ·{' '}
        <button type="button" className="text-button" onClick={change}>
          change
        </button>
      </p>
    </div>
  )
}

/** "New tile": the same big buttons, a folder, and everything else tucked under "More options". */
export function Launcher({ onLaunch, onClose }: { onLaunch: (c: LaunchChoice) => void; onClose: () => void }) {
  const [big, rest] = split(usePresets())
  const [recent] = useState(loadRecent)
  const [cwd, setCwd] = useState(() => recent[0] ?? '')
  const [more, setMore] = useState(false)
  const [custom, setCustom] = useState('')
  const [title, setTitle] = useState('')

  const launch = (preset: Preset) => {
    if (cwd) saveRecent(cwd)
    onLaunch({ preset, cwd: cwd || undefined, title: title.trim() || undefined })
  }
  const launchCustom = () => {
    // Passed unsplit to `$SHELL -lc`, so quotes, pipes and aliases work.
    if (custom.trim()) launch({ ...CUSTOM, command: custom.trim(), shell: true })
  }

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div
        className="launcher"
        role="dialog"
        aria-label="New tile"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2>New tile</h2>
        <BigButtons presets={big} onPick={launch} />
        <div className="folder">
          <span className="folder-label">Folder</span>
          <input
            list="recent-folders"
            placeholder="Home folder"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            aria-label="Folder"
          />
          <datalist id="recent-folders">
            {recent.map((r) => (
              <option key={r} value={r} label={folderName(r)} />
            ))}
          </datalist>
          <button type="button" onClick={() => window.canvasApi.pickFolder().then((p) => p && setCwd(p))}>
            Browse…
          </button>
        </div>
        <button type="button" className="disclosure" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? 'Fewer options' : 'More options'}
        </button>
        {more && (
          <div className="more">
            <div className="row">
              {rest.map((p) => (
                <button type="button" key={p.id} onClick={() => launch(p)}>
                  {p.name}
                </button>
              ))}
            </div>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault()
                launchCustom()
              }}
            >
              <input
                placeholder="Custom command, e.g. npm run dev"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                aria-label="Custom command"
              />
              <button type="submit" disabled={!custom.trim()}>
                Run
              </button>
            </form>
            <input placeholder="Tile name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        )}
      </div>
    </div>
  )
}
