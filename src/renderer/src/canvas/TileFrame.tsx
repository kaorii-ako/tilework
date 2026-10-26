import { memo, useEffect, type PointerEvent as ReactPointerEvent } from 'react'
import type { AgentState } from '../../../shared/status'
import { canvasStore, dragTo, screenToCanvas, useCanvas } from './store'
import { perFrame } from './perFrame'
import { TerminalTile } from '../TerminalTile'

/**
 * Drag `onMove(to)` with pointer capture until release. `onEnd` gets the release event,
 * or null when cancelled (pointercancel, or Esc when `escCancels`).
 */
function track(
  e: ReactPointerEvent,
  onMove: (to: { x: number; y: number }) => void,
  onEnd?: (ev: PointerEvent | null) => void,
  escCancels = false
) {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  const frame = perFrame(onMove)
  const move = (ev: PointerEvent) => frame({ x: ev.clientX, y: ev.clientY })
  const end = (ev: PointerEvent | null) => {
    if (ev) frame.flush()
    else frame.cancel()
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', esc, true)
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    onEnd?.(ev)
  }
  const up = (ev: PointerEvent) => end(ev)
  const cancel = () => end(null)
  const esc = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return
    ev.preventDefault()
    ev.stopPropagation()
    end(null)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', cancel)
  if (escCancels) window.addEventListener('keydown', esc, true)
}

/** Drag a new link out of tile `from`'s right edge; dropping anywhere on another tile links them. */
function startLink(e: ReactPointerEvent, from: string) {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  const surface = (e.currentTarget as HTMLElement).closest('.surface')!
  const r = surface.getBoundingClientRect()
  const s = canvasStore.getState()
  const at = (p: { x: number; y: number }) =>
    screenToCanvas(canvasStore.getState().viewport, { x: p.x - r.left, y: p.y - r.top })
  surface.classList.add('linking')
  s.setLinkDraft({ from, at: at({ x: e.clientX, y: e.clientY }) })
  track(
    e,
    (to) => s.setLinkDraft({ from, at: at(to) }),
    (ev) => {
      surface.classList.remove('linking')
      s.setLinkDraft(null)
      const target = ev && document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.tile')
      if (target?.dataset.tileId) s.addLink(from, target.dataset.tileId)
    },
    true
  )
}

const LABEL: Record<AgentState | 'shell', string> = {
  shell: 'Shell',
  working: 'Working',
  idle: 'Ready',
  'needs-input': 'Needs you',
  exited: 'Exited'
}

/**
 * One status dot from Claude Code hooks (KAO-24), named by its tooltip. Resets to "shell"
 * whenever the tile respawns: `spawnKey` changes exactly when TerminalTile starts a new PTY.
 */
const TileStatus = memo(function TileStatus({ tileId, spawnKey }: { tileId: string; spawnKey: string }) {
  const state = useCanvas((s) => s.status[tileId]) ?? 'shell'
  useEffect(() => () => canvasStore.getState().clearStatus(tileId), [tileId, spawnKey])
  return <i className="dot" data-state={state} role="img" aria-label={LABEL[state]} title={LABEL[state]} />
})

/** Position, size, title bar and resize handle around one terminal. */
export const TileFrame = memo(function TileFrame({ id }: { id: string }) {
  const tile = useCanvas((s) => s.tiles.find((t) => t.id === id))
  const z = useCanvas((s) => s.order.indexOf(id))
  const focused = useCanvas((s) => s.focusedTileId === id)
  const live = useCanvas((s) => s.viewport.zoom === 1)
  if (!tile) return null

  const startDrag = (kind: 'move' | 'resize') => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const s = canvasStore.getState()
    const start = kind === 'move' ? { x: tile.x, y: tile.y } : { x: tile.w, y: tile.h }
    const from = { x: e.clientX, y: e.clientY }
    track(e, (to) => {
      const p = dragTo(start, from, to, canvasStore.getState().viewport.zoom)
      if (kind === 'move') s.moveTile(id, p.x, p.y)
      else s.resizeTile(id, p.x, p.y)
    })
  }

  return (
    <section
      className={focused ? 'tile focused' : 'tile'}
      data-tile-id={id}
      style={{ transform: `translate(${tile.x}px, ${tile.y}px)`, width: tile.w, height: tile.h, zIndex: z + 1 }}
      onPointerDownCapture={() => canvasStore.getState().focusTile(id)}
    >
      <header className="tile-bar" onPointerDown={startDrag('move')}>
        <TileStatus tileId={id} spawnKey={JSON.stringify([tile.command, tile.args, tile.shell, tile.cwd])} />
        <span className="tile-title" title={tile.cwd}>
          {tile.title}
        </span>
        {tile.branch && (
          <span className="tile-branch" title={`git worktree on ${tile.branch}`}>
            {tile.branch}
          </span>
        )}
        {/* KAO-52: how this tile takes part in a dynamic workflow. */}
        {tile.join && (
          <span className="tile-tag" title="Waits for its busy inputs, then gets one combined handoff">
            waits for all
          </span>
        )}
        {tile.router && (
          <span className="tile-tag" title="Picks the next tile by ending its reply with ROUTE: <tile name>">
            router
          </span>
        )}
        {tile.workerOf && (
          <span className="tile-tag" title="A parallel worker made by a split link; reused on the next split">
            worker
          </span>
        )}
        <button
          type="button"
          className="tile-close"
          title="Close tile"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => canvasStore.getState().removeTile(id)}
        >
          ×
        </button>
      </header>
      <TerminalTile tileId={id} command={tile.command} args={tile.args} shell={tile.shell} cwd={tile.cwd} live={live} />
      <div className="tile-resize" onPointerDown={startDrag('resize')} />
      <div className="port-in" />
      {/* The whole right edge starts a link; the dot in its middle shows where the line leaves. */}
      <div className="link-edge" title="Drag onto another tile to link" onPointerDown={(e) => startLink(e, id)}>
        <i className="port-out" />
      </div>
    </section>
  )
})
