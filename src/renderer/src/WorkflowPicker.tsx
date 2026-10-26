import { useEffect, useState } from 'react'
import { BUILTIN_WORKFLOWS, type Workflow } from '../../shared/workflows'
import { FolderLine, useFolder } from './Launcher'
import { askText } from './Prompt'

/** A tiny picture of the workflow: its tiles as boxes in their layout, its links as arrows. */
function Diagram({ wf }: { wf: Workflow }) {
  const x0 = Math.min(...wf.tiles.map((t) => t.x))
  const y0 = Math.min(...wf.tiles.map((t) => t.y))
  const x1 = Math.max(...wf.tiles.map((t) => t.x + t.w))
  const y1 = Math.max(...wf.tiles.map((t) => t.y + t.h))
  const byKey = new Map(wf.tiles.map((t) => [t.key, t]))
  return (
    <svg className="diagram" viewBox={`${x0 - 40} ${y0 - 120} ${x1 - x0 + 80} ${y1 - y0 + 240}`} aria-hidden>
      <defs>
        <marker
          id="diagram-arrow"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10 z" />
        </marker>
      </defs>
      {wf.links.map((l, i) => {
        const a = byKey.get(l.from)!
        const b = byKey.get(l.to)!
        // A link back to an earlier tile arcs under the row; a forward one goes straight.
        const back = b.x < a.x
        const ay = a.y + a.h / 2 + (back ? a.h / 4 : 0)
        const by = b.y + b.h / 2 + (back ? b.h / 4 : 0)
        const d = back
          ? `M ${a.x + a.w / 2} ${a.y + a.h} C ${a.x + a.w / 2} ${a.y + a.h + 110}, ${b.x + b.w / 2} ${b.y + b.h + 110}, ${b.x + b.w / 2} ${b.y + b.h + 8}`
          : `M ${a.x + a.w} ${ay} L ${b.x - 8} ${by}`
        return <path key={i} d={d} markerEnd="url(#diagram-arrow)" />
      })}
      {wf.tiles.map((t) => (
        <g key={t.key}>
          <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={36} />
          <text x={t.x + t.w / 2} y={t.y + t.h / 2} dy="0.35em">
            {t.title}
          </text>
        </g>
      ))}
    </svg>
  )
}

/**
 * Pick a workflow and a folder; Start lays its tiles and links out on the canvas.
 * Custom workflows (from File → Save canvas as workflow) can be renamed or deleted by right-click.
 */
export function WorkflowPicker({
  onStart,
  onClose
}: {
  /** Resolves to an error message when the workflow couldn't start (e.g. its worktrees need a git repo). */
  onStart(wf: Workflow, cwd: string | undefined): Promise<string | void>
  onClose(): void
}) {
  const [error, setError] = useState('')
  const start = async (w: Workflow) => setError((await onStart(w, folder)) || '')
  const [custom, setCustom] = useState<Workflow[]>([])
  const [picked, setPicked] = useState(BUILTIN_WORKFLOWS[0].id)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [folder, change] = useFolder()
  useEffect(() => {
    window.canvasApi.loadWorkflows().then(setCustom)
  }, [])
  const all = [...BUILTIN_WORKFLOWS, ...custom]
  const wf = all.find((w) => w.id === picked) ?? all[0]

  const save = async (list: Workflow[]) => setCustom(await window.canvasApi.saveWorkflows(list))
  const rename = async (id: string) => {
    setMenu(null)
    const old = custom.find((w) => w.id === id)
    const name = await askText({ title: 'Rename workflow', initial: old?.name, ok: 'Rename' })
    if (name) await save(custom.map((w) => (w.id === id ? { ...w, name } : w)))
  }
  const remove = async (id: string) => {
    setMenu(null)
    if (picked === id) setPicked(BUILTIN_WORKFLOWS[0].id)
    await save(custom.filter((w) => w.id !== id))
  }

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div
        className="launcher picker"
        role="dialog"
        aria-label="Start a workflow"
        onMouseDown={(e) => {
          e.stopPropagation()
          setMenu(null)
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          if (menu) setMenu(null)
          else onClose()
        }}
      >
        <h2>Start a workflow</h2>
        <div className="cards" role="radiogroup" aria-label="Workflows">
          {all.map((w) => (
            <button
              type="button"
              key={w.id}
              role="radio"
              aria-checked={w.id === wf.id}
              aria-label={w.name}
              className="card"
              autoFocus={w.id === wf.id}
              onClick={() => {
                setPicked(w.id)
                setError('')
              }}
              onDoubleClick={() => void start(w)}
              onContextMenu={(e) => {
                e.preventDefault()
                if (!w.builtIn) setMenu({ id: w.id, x: e.clientX, y: e.clientY })
              }}
            >
              <Diagram wf={w} />
              <span className="card-name">{w.name}</span>
              <span className="card-desc">{w.description}</span>
            </button>
          ))}
        </div>
        <div className="row spread">
          <FolderLine folder={folder} onChange={change} />
          <div className="row">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={() => void start(wf)}>
              Start
            </button>
          </div>
        </div>
        {error && (
          <p className="launcher-error" role="alert">
            {error}
          </p>
        )}
        {menu && (
          <div
            className="link-menu"
            role="menu"
            style={{ left: menu.x, top: menu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button type="button" role="menuitem" onClick={() => void rename(menu.id)}>
              Rename…
            </button>
            <button type="button" role="menuitem" onClick={() => void remove(menu.id)}>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
