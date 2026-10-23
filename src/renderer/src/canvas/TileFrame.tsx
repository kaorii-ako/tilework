import { memo, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { AgentState } from '../../../shared/status'
import { canvasStore, dragTo, useCanvas } from './store'
import { TerminalTile } from '../TerminalTile'

/** Drag `onMove(to)` with pointer capture until release. */
function track(e: ReactPointerEvent, onMove: (to: { x: number; y: number }) => void) {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  const move = (ev: PointerEvent) => onMove({ x: ev.clientX, y: ev.clientY })
  const up = () => {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}

const LABEL: Record<AgentState, string> = {
  working: 'working',
  idle: 'idle',
  'needs-input': 'needs you',
  exited: 'exited'
}

/**
 * Live agent state from Claude Code hooks (KAO-24). Resets to "shell" whenever the
 * tile respawns: `spawnKey` changes exactly when TerminalTile starts a new PTY.
 */
const TileStatus = memo(function TileStatus({ tileId, spawnKey }: { tileId: string; spawnKey: string }) {
  const [state, setState] = useState<AgentState>()
  useEffect(() => {
    const off = window.canvasApi.onStatus((e) => e.tileId === tileId && setState(e.state))
    return () => {
      off()
      setState(undefined)
    }
  }, [tileId, spawnKey])
  return (
    <span className="tile-status" data-state={state ?? 'shell'}>
      {state && <i className="dot" />}
      {state ? LABEL[state] : 'shell'}
    </span>
  )
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
        <span className="tile-title">{tile.title}</span>
        <TileStatus tileId={id} spawnKey={JSON.stringify([tile.command, tile.args, tile.shell, tile.cwd])} />
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
    </section>
  )
})
