import { memo, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { canvasStore, type CanvasState } from './canvas/store'

interface Props {
  tileId: string
  /** Undefined runs the user's login shell. */
  command?: string
  args?: string[]
  shell?: boolean
  cwd?: string
  /** False when the canvas isn't at 100%: xterm is hidden (still running) and a text snapshot shows instead. */
  live: boolean
}

/** The visible rows as plain text. */
function snapshot(term: Terminal): string {
  const b = term.buffer.active
  const rows: string[] = []
  for (let i = 0; i < term.rows; i++) rows.push(b.getLine(b.viewportY + i)?.translateToString(true) ?? '')
  return rows.join('\n')
}

/**
 * One xterm.js terminal bound to one PTY. Memoized: moving or panning never re-renders it.
 * xterm can't be scaled (blurry, wrong hit-testing; see docs/zoom-spike.md), so it is only
 * shown at 100% zoom.
 */
export const TerminalTile = memo(function TerminalTile({ tileId, command, args, shell, cwd, live }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const [snap, setSnap] = useState<string | null>(null)
  const argsKey = args?.join('\0')

  useEffect(() => {
    const api = window.canvasApi
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Cascadia Code", "DejaVu Sans Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      theme: { background: '#14171d', foreground: '#d6dae3', cursor: '#7cc4a4', selectionBackground: '#2e3a4a' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host.current!)
    termRef.current = term

    // WebGL is crisper and faster; fall back to the DOM renderer if the GPU says no.
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      /* default renderer */
    }

    fit.fit()
    const offData = api.onData((e) => e.tileId === tileId && term.write(e.data))
    const offExit = api.onExit(
      (e) => e.tileId === tileId && term.write(`\r\n\x1b[2m[process exited ${e.code}]\x1b[0m\r\n`)
    )
    const input = term.onData((data) => api.input({ tileId, data }))
    // A real keystroke (not a terminal reply) restarts the handoff loop guard.
    const typed = term.onKey(() => canvasStore.getState().userTyped())
    const resize = term.onResize(({ cols, rows }) => api.resize({ tileId, cols, rows }))
    api.spawn({ tileId, command, args, shell, cwd, cols: term.cols, rows: term.rows })

    // Refit once the size settles, so a resize drag doesn't flood the PTY with SIGWINCH.
    let fitTimer: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      clearTimeout(fitTimer)
      fitTimer = setTimeout(() => fit.fit(), 50)
    })
    ro.observe(host.current!)

    // Keyboard focus follows the store: only the focused tile's xterm holds DOM focus.
    const focusIfMine = (s: CanvasState) => s.focusedTileId === tileId && s.viewport.zoom === 1 && term.focus()
    focusIfMine(canvasStore.getState())
    const unsub = canvasStore.subscribe((s, prev) => s.focusedTileId !== prev.focusedTileId && focusIfMine(s))
    const onFocus = () => canvasStore.getState().focusTile(tileId)
    term.textarea?.addEventListener('focus', onFocus)

    return () => {
      clearTimeout(fitTimer)
      ro.disconnect()
      unsub()
      term.textarea?.removeEventListener('focus', onFocus)
      input.dispose()
      typed.dispose()
      resize.dispose()
      offData()
      offExit()
      api.kill({ tileId })
      termRef.current = null
      term.dispose()
    }
    // argsKey stands in for args so a new array with the same items does not respawn.
  }, [tileId, command, argsKey, shell, cwd])

  // Zoomed: hide xterm (it keeps parsing output) and refresh a text snapshot once a second.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    if (live) {
      setSnap(null)
      if (canvasStore.getState().focusedTileId === tileId) term.focus()
      return
    }
    term.blur()
    const grab = () => setSnap(snapshot(term))
    grab()
    const timer = setInterval(grab, 1000)
    return () => clearInterval(timer)
  }, [live, tileId])

  const zoomHere = () => {
    const r = host.current!.closest('.surface')!.getBoundingClientRect()
    canvasStore.getState().zoomToTile(tileId, { w: r.width, h: r.height })
  }

  return (
    <div className="tile-body">
      <div className="tile-term" ref={host} style={live ? undefined : { visibility: 'hidden' }} />
      {!live && (
        <pre className="tile-snapshot" title="Click to zoom to 100%" onClick={zoomHere}>
          {snap}
        </pre>
      )}
    </div>
  )
})
