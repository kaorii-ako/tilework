import { useEffect, useState } from 'react'
import type { Preset } from '../../shared/types'

export interface LaunchChoice {
  preset: Preset
  cwd?: string
  title?: string
  /** Set when the tile got its own git worktree (KAO-50); cwd is then that worktree. */
  branch?: string
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
    <>
      {presets.map((p, i) => (
        <button type="button" key={p.id} className="big" autoFocus={i === 0} onClick={() => onPick(p)}>
          {p.name}
        </button>
      ))}
    </>
  )
}

/** The last folder used (or home), shown as "in <folder> · change". */
export function useFolder(): [string | undefined, () => Promise<void>] {
  const [folder, setFolder] = useState<string | undefined>(() => loadRecent()[0])
  const change = async () => {
    const p = await window.canvasApi.pickFolder()
    if (!p) return
    saveRecent(p)
    setFolder(p)
  }
  return [folder, change]
}

export function FolderLine({ folder, onChange }: { folder?: string; onChange(): void }) {
  return (
    <p className="folder-line">
      in <span title={folder}>{folder ? folderName(folder) : 'your home folder'}</span> ·{' '}
      <button type="button" className="text-button" onClick={onChange}>
        change
      </button>
    </p>
  )
}

/**
 * The empty canvas: one centered prompt with the big buttons (Claude Code, Shell, Start a
 * workflow) and the folder they start in.
 */
export function EmptyState({ onLaunch, onWorkflow }: { onLaunch(c: LaunchChoice): void; onWorkflow(): void }) {
  const [big] = split(usePresets())
  const [folder, change] = useFolder()
  return (
    <div className="empty">
      <h1>Start an agent</h1>
      <div className="big-buttons">
        <BigButtons presets={big} onPick={(preset) => onLaunch({ preset, cwd: folder })} />
        <button type="button" className="big" onClick={onWorkflow}>
          Start a workflow
        </button>
      </div>
      <FolderLine folder={folder} onChange={change} />
    </div>
  )
}

/** "New tile": the same big buttons, a folder, and everything else tucked under "More options". */
export function Launcher({
  onLaunch,
  onWorkflow,
  onClose
}: {
  onLaunch: (c: LaunchChoice) => void
  onWorkflow: () => void
  onClose: () => void
}) {
  const [big, rest] = split(usePresets())
  const [recent] = useState(loadRecent)
  const [cwd, setCwd] = useState(() => recent[0] ?? '')
  const [more, setMore] = useState(false)
  const [custom, setCustom] = useState('')
  const [title, setTitle] = useState('')
  const [ownWorktree, setOwnWorktree] = useState(false)
  const [error, setError] = useState('')

  const launch = async (preset: Preset) => {
    if (cwd) saveRecent(cwd)
    const choice: LaunchChoice = { preset, cwd: cwd || undefined, title: title.trim() || undefined }
    if (ownWorktree) {
      const wt = await window.canvasApi.createWorktree(cwd)
      if (!wt.ok) return setError(wt.error)
      Object.assign(choice, { cwd: wt.path, branch: wt.branch })
    }
    onLaunch(choice)
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
        <div className="big-buttons">
          <BigButtons presets={big} onPick={launch} />
        </div>
        <button type="button" className="workflow-option" onClick={onWorkflow}>
          Workflow…
        </button>
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
            <label className="check">
              <input
                type="checkbox"
                checked={ownWorktree}
                onChange={(e) => {
                  setOwnWorktree(e.target.checked)
                  setError('')
                }}
              />
              Own git worktree (a new branch next to the repo, so agents don’t step on each other)
            </label>
          </div>
        )}
        {error && (
          <p className="launcher-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
