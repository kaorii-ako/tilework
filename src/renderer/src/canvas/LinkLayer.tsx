import {
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { createPortal } from 'react-dom'
import type { AgentState } from '../../../shared/status'
import type { Link, Tile } from '../../../shared/types'
import { canvasStore, inPort, linkCurve, outPort, useCanvas } from './store'
import { handoffBlocker, ptyWrite, sendHandoff } from './handoff'
import { askText } from '../Prompt'

const STATES: (AgentState | 'shell')[] = ['shell', 'working', 'idle', 'needs-input', 'exited']

function LinkLine({
  link,
  from,
  to,
  state,
  selected,
  pending,
  paused,
  blocked,
  twoWay,
  zoom,
  layer,
  onMenu
}: {
  /** Lines are drawn under the tiles, chips over them, so a tile never hides "Send →". */
  layer: 'line' | 'chip'
  link: Link
  from: Tile
  to: Tile
  state: AgentState | 'shell'
  selected: boolean
  /** The source has a result this link hasn't handed off yet. */
  pending: boolean
  paused: boolean
  /** Why it can't send right now, or null. */
  blocked: string | null
  /** A link in the opposite direction exists. */
  twoWay: boolean
  /** Chips are drawn at screen size, so "Send →" stays readable when zoomed out. */
  zoom: number
  onMenu(x: number, y: number): void
}) {
  const { d, mid } = linkCurve(outPort(from), inPort(to))
  const canSend = pending && link.mode === 'manual' && !blocked
  const queued = pending && link.mode === 'auto'
  const auto = link.mode === 'auto'
  // The chip always says what the next tile is asked to do; click it to edit.
  const text = clip(link.instruction ?? '', 22)
  const label = (auto ? 'Auto-send · ' : '') + (text || 'Add instruction')
  const w = Math.round(label.length * 6.3 + 20)
  // A→B and B→A share a midpoint when the tiles line up: one chip above the line, one below,
  // each with its Send → on its outer side. Screen px; the group is scaled to screen size.
  const dir = twoWay && from.x > to.x ? 1 : -1
  const chipY = twoWay ? dir * 14 : 0
  const sendY = chipY + dir * 28
  // The line and its chip both select the link and open its menu; the chip is the sure target when lines overlap.
  const pick = {
    onPointerDown: (e: ReactPointerEvent) => e.button === 0 && canvasStore.getState().selectLink(link.id),
    onContextMenu: (e: ReactMouseEvent) => {
      e.preventDefault()
      canvasStore.getState().selectLink(link.id)
      onMenu(e.clientX, e.clientY)
    }
  }
  const press = (f: () => void) => ({
    role: 'button',
    tabIndex: 0,
    onClick: f,
    onKeyDown: (e: ReactKeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && f()
  })
  if (layer === 'line')
    return (
      <g className={selected ? 'link selected' : 'link'} data-state={state} data-link-id={link.id}>
        <path className="link-line" d={d} markerEnd={`url(#link-arrow-${state})`} />
        <path className="link-hit" d={d} {...pick} />
      </g>
    )
  return (
    <g data-state={state} data-link-id={link.id} transform={`translate(${mid.x} ${mid.y}) scale(${1 / zoom})`}>
      <g
        className={text ? 'link-chip' : 'link-chip empty'}
        transform={`translate(0 ${chipY})`}
        aria-label={`Instruction: ${link.instruction ?? 'none'}`}
        {...pick}
        {...press(() => editInstruction(link.id))}
      >
        <title>
          {(link.instruction ? `“${link.instruction}”\n` : '') + 'Click to edit what the next tile should do'}
        </title>
        <rect x={-w / 2} y={-9} width={w} height={18} rx={9} />
        <text className="link-label" dy="0.35em">
          {label}
        </text>
        {(queued || paused) && (
          <text className={queued ? 'link-badge' : 'link-note'} x={w / 2 + 8} dy="0.35em">
            {queued ? 'queued' : 'loop paused'}
          </text>
        )}
      </g>
      {canSend && (
        <g
          className="link-chip send"
          transform={`translate(0 ${sendY})`}
          aria-label="Send handoff"
          {...pick}
          {...press(() => void manualSend(link.id))}
        >
          <title>Paste the latest result into the next tile, with the instruction (no Enter)</title>
          <rect x={-40} y={-13} width={80} height={26} rx={13} />
          <text className="link-label" dy="0.35em">
            Send →
          </text>
        </g>
      )}
    </g>
  )
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const titleOf = (id: string) => canvasStore.getState().tiles.find((t) => t.id === id)?.title ?? 'the next tile'

/** One text field for what the link's target should do with a handoff. */
async function editInstruction(linkId: string) {
  const link = canvasStore.getState().links.find((l) => l.id === linkId)
  if (!link) return
  const text = await askText({
    title: `What should ${titleOf(link.toTileId)} do with ${titleOf(link.fromTileId)}’s result?`,
    initial: link.instruction,
    placeholder: 'e.g. Review this for bugs',
    ok: 'Save'
  })
  if (text) canvasStore.getState().setLinkInstruction(linkId, text)
}

/** Handoff entries of a link's right-click menu. */
function LinkMenuItems({ linkId, close }: { linkId: string; close(): void }) {
  const mode = useCanvas((s) => s.links.find((l) => l.id === linkId)?.mode)
  const blocked = useCanvas((s) => handoffBlocker(s, linkId))
  return (
    <>
      {/* aria-disabled, not disabled, so the tooltip still shows on hover. */}
      <button
        type="button"
        role="menuitem"
        aria-disabled={!!blocked}
        title={blocked ?? 'Paste the latest result into the next tile (no Enter)'}
        onClick={() => {
          if (blocked) return
          close()
          void manualSend(linkId)
        }}
      >
        Send handoff
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          close()
          void editInstruction(linkId)
        }}
      >
        Edit instruction…
      </button>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={mode === 'auto'}
        title="Paste and press Enter on its own when the source finishes and the target is idle"
        onClick={() => {
          canvasStore.getState().setLinkMode(linkId, mode === 'auto' ? 'manual' : 'auto')
          close()
        }}
      >
        {mode === 'auto' ? '✓ ' : ''}Auto-send
      </button>
    </>
  )
}

/**
 * Paste without Enter so Kao can read and edit it, then put the cursor in the target tile.
 * A link without an instruction asks for one first and keeps the answer.
 */
async function manualSend(linkId: string) {
  const link = canvasStore.getState().links.find((l) => l.id === linkId)
  if (!link) return
  if (!link.instruction) {
    const text = await askText({
      title: `What should ${titleOf(link.toTileId)} do with this?`,
      placeholder: 'e.g. Review this for bugs',
      ok: 'Send'
    })
    if (!text) return
    canvasStore.getState().setLinkInstruction(linkId, text)
  }
  const s = canvasStore.getState()
  if (!sendHandoff(s, linkId, ptyWrite, false)) return
  s.handoffSent(linkId)
  const to = s.links.find((l) => l.id === linkId)?.toTileId
  if (to) s.focusTile(to)
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
  const pending = useCanvas((s) => s.handoffPending)
  const paused = useCanvas((s) => s.loopPaused)
  const zoom = useCanvas((s) => s.viewport.zoom)
  useCanvas((s) => s.lastResult) // re-render when results change; handoffBlocker reads them
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
              layer="line"
              key={l.id}
              link={l}
              from={from}
              to={to}
              state={status[l.fromTileId] ?? 'shell'}
              selected={selected === l.id}
              pending={!!pending[l.id]}
              paused={!!paused[l.id]}
              blocked={handoffBlocker(canvasStore.getState(), l.id)}
              twoWay={links.some((r) => r.fromTileId === l.toTileId && r.toTileId === l.fromTileId)}
              zoom={zoom}
              onMenu={(x, y) => setMenu({ id: l.id, x, y })}
            />
          )
        })}
        {draftFrom && <path className="link-draft" d={linkCurve(outPort(draftFrom), draft.at).d} />}
      </svg>
      <svg className="links chips">
        {links.map((l) => {
          const from = byId.get(l.fromTileId)
          const to = byId.get(l.toTileId)
          if (!from || !to) return null
          return (
            <LinkLine
              layer="chip"
              key={l.id}
              link={l}
              from={from}
              to={to}
              state={status[l.fromTileId] ?? 'shell'}
              selected={selected === l.id}
              pending={!!pending[l.id]}
              paused={!!paused[l.id]}
              blocked={handoffBlocker(canvasStore.getState(), l.id)}
              twoWay={links.some((r) => r.fromTileId === l.toTileId && r.toTileId === l.fromTileId)}
              zoom={zoom}
              onMenu={(x, y) => setMenu({ id: l.id, x, y })}
            />
          )
        })}
      </svg>
      {menu &&
        createPortal(
          // The world is transformed, so the menu lives in <body> where `fixed` means the window.
          <div className="link-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
            <LinkMenuItems linkId={menu.id} close={() => setMenu(null)} />
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
