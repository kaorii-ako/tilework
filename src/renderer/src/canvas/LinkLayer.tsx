import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AgentState } from '../../../shared/status'
import type { Link, Tile } from '../../../shared/types'
import { canvasStore, inPort, linkCurve, outPort, useCanvas } from './store'

const STATES: (AgentState | 'shell')[] = ['shell', 'working', 'idle', 'needs-input', 'exited']

function LinkLine({
  link,
  from,
  to,
  state,
  selected,
  onMenu
}: {
  link: Link
  from: Tile
  to: Tile
  state: AgentState | 'shell'
  selected: boolean
  onMenu(x: number, y: number): void
}) {
  const { d, mid } = linkCurve(outPort(from), inPort(to))
  return (
    <g className={selected ? 'link selected' : 'link'} data-state={state} data-link-id={link.id}>
      <path className="link-line" d={d} markerEnd={`url(#link-arrow-${state})`} />
      <path
        className="link-hit"
        d={d}
        onPointerDown={(e) => e.button === 0 && canvasStore.getState().selectLink(link.id)}
        onContextMenu={(e) => {
          e.preventDefault()
          canvasStore.getState().selectLink(link.id)
          onMenu(e.clientX, e.clientY)
        }}
      />
      <g className="link-chip" transform={`translate(${mid.x} ${mid.y})`}>
        <rect x={-26} y={-9} width={52} height={18} rx={9} />
        <text dy="0.35em">{link.mode}</text>
      </g>
    </g>
  )
}

/**
 * Every link as an SVG bézier, in one layer inside the world under the tiles. It re-renders
 * on tile moves and link changes; tiles and terminals never do because of it.
 */
export function LinkLayer() {
  const links = useCanvas((s) => s.links)
  const tiles = useCanvas((s) => s.tiles)
  const draft = useCanvas((s) => s.linkDraft)
  const selected = useCanvas((s) => s.selectedLinkId)
  const status = useCanvas((s) => s.status)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e.target instanceof Element && e.target.closest('.link-menu')) return
      setMenu(null)
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', close, true)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  const byId = new Map(tiles.map((t) => [t.id, t]))
  const draftFrom = draft && byId.get(draft.from)

  return (
    <>
      <svg className="links">
        <defs>
          {STATES.map((st) => (
            <marker
              key={st}
              id={`link-arrow-${st}`}
              className="link-arrow"
              data-state={st}
              viewBox="0 0 10 10"
              refX={10}
              refY={5}
              markerWidth={10}
              markerHeight={10}
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M0 0 L10 5 L0 10 z" />
            </marker>
          ))}
        </defs>
        {links.map((l) => {
          const from = byId.get(l.fromTileId)
          const to = byId.get(l.toTileId)
          if (!from || !to) return null
          return (
            <LinkLine
              key={l.id}
              link={l}
              from={from}
              to={to}
              state={status[l.fromTileId] ?? 'shell'}
              selected={selected === l.id}
              onMenu={(x, y) => setMenu({ id: l.id, x, y })}
            />
          )
        })}
        {draftFrom && <path className="link-draft" d={linkCurve(outPort(draftFrom), draft.at).d} />}
      </svg>
      {menu &&
        createPortal(
          // The world is transformed, so the menu lives in <body> where `fixed` means the window.
          <div className="link-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                canvasStore.getState().removeLink(menu.id)
                setMenu(null)
              }}
            >
              Remove link
            </button>
          </div>,
          document.body
        )}
    </>
  )
}
