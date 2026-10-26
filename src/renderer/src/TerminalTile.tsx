import { memo, useLayoutEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { SerializeAddon } from '@xterm/addon-serialize'
import { canvasStore, type CanvasState } from './canvas/store'
import { snapshot } from './snapshot'
import { emitLocalResize, onMirror, registerLocal, wantScreen } from './team/terminals'

interface Props {
  tileId: string
  /** Undefined runs the user's login shell. */
  command?: string
  args?: string[]
  shell?: boolean
  cwd?: string
  /** False when the canvas isn't at 100%: xterm is hidden (still running) and a coloured snapshot shows instead. */
  live: boolean
  /** A teammate's tile (KAO-54): no process here, no input; it shows what its owner streams. */
  mirror?: boolean
}

/** Lines of scrollback sent to a teammate who starts watching a tile. */
const SHARED_SCROLLBACK = 200

/** Terminal colours, matched to the app's palette in styles.css (--tile, --text, --accent). */
const THEME = {
  background: '#15181e',
  foreground: '#d5d9e0',
  cursor: '#7aa2f7',
  cursorAccent: '#15181e',
  selectionBackground: '#7aa2f74d',
  scrollbarSliderBackground: '#ffffff14',
  scrollbarSliderHoverBackground: '#ffffff26',
  scrollbarSliderActiveBackground: '#ffffff33',
  black: '#1f232b',
  red: '#e27d7d',
  green: '#93c79b',
  yellow: '#dfb771',
  blue: '#7aa2f7',
  magenta: '#b99bdc',
  cyan: '#7cc6c9',
  white: '#c3c8d2',
  brightBlack: '#5c6370',
  brightRed: '#ef9a9a',
  brightGreen: '#aed8b4',
  brightYellow: '#ecca8d',
  brightBlue: '#9bbaf9',
  brightMagenta: '#ccb3e8',
  brightCyan: '#9ad8da',
  brightWhite: '#eceff4'
}
/** Shared with .tile-snapshot, so switching between live and snapshot doesn't shift the text. */
const FONT = {
  fontFamily: '"JetBrains Mono", "Cascadia Code", "DejaVu Sans Mono", monospace',
  fontSize: 13,
  lineHeight: 1.2
}

/**
 * One xterm.js terminal bound to one PTY. Memoized: moving or panning never re-renders it.
 * xterm can't be scaled (blurry, wrong hit-testing; see docs/zoom-spike.md), so it is only
 * shown at 100% zoom.
 */
export const TerminalTile = memo(function TerminalTile({ tileId, command, args, shell, cwd, live, mirror }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const serializerRef = useRef<SerializeAddon | null>(null)
  const fitRef = useRef<() => void>(() => {})
  const [snap, setSnap] = useState<string | null>(null)
  const argsKey = args?.join('\0')

  // A layout effect like the snapshot one below, and declared before it, so the terminal exists
  // by the time a tile that starts zoomed out (a restored layout, a new workflow) takes its first snapshot.
  useLayoutEffect(() => {
    const api = window.canvasApi
    const term = new Terminal({
      ...FONT,
      cursorBlink: !mirror,
      disableStdin: !!mirror,
      allowProposedApi: true,
      theme: THEME
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    const serializer = new SerializeAddon()
    term.loadAddon(serializer)
    serializerRef.current = serializer
    term.open(host.current!)
    termRef.current = term
    fitRef.current = () => fit.fit()

    // WebGL is crisper and faster; fall back to the DOM renderer if the GPU says no.
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      /* default renderer */
    }

    if (mirror) {
      fitRef.current = () => {} // keep the owner's grid size, even when this tile goes live again
      return startMirror(tileId, term, () => {
        termRef.current = null
        serializerRef.current = null
        term.dispose()
      })
    }

    fit.fit()
    const offData = api.onData((e) => e.tileId === tileId && term.write(e.data))
    const offExit = api.onExit(
      (e) => e.tileId === tileId && term.write(`\r\n\x1b[2m[process exited ${e.code}]\x1b[0m\r\n`)
    )
    const input = term.onData((data) => api.input({ tileId, data }))
    // A real keystroke (not a terminal reply) restarts the handoff loop guard.
    const typed = term.onKey(() => canvasStore.getState().userTyped())
    const resize = term.onResize(({ cols, rows }) => {
      api.resize({ tileId, cols, rows })
      emitLocalResize(tileId, cols, rows)
    })
    // Team mode: a teammate who starts watching gets this screen and some scrollback.
    const unregister = registerLocal(tileId, () => ({
      serialize: () => serializer.serialize({ scrollback: SHARED_SCROLLBACK }),
      cols: term.cols,
      rows: term.rows
    }))
    // Read the session at spawn time, so learning a new one later never respawns the tile.
    const resume = canvasStore.getState().tiles.find((t) => t.id === tileId)?.sessionId
    // KAO-52: queued input (a split worker's task) waits until the PTY is there to take it.
    void api
      .spawn({ tileId, command, args, shell, cwd, resume, cols: term.cols, rows: term.rows })
      .then(() => canvasStore.getState().ptyStarted(tileId, Date.now()))

    // Refit once the size settles (no resize for 120 ms), so a resize drag doesn't reflow the
    // terminal or flood the PTY with SIGWINCH on every frame.
    let fitTimer: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      clearTimeout(fitTimer)
      fitTimer = setTimeout(() => fit.fit(), 120)
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
      unregister()
      unsub()
      term.textarea?.removeEventListener('focus', onFocus)
      input.dispose()
      typed.dispose()
      resize.dispose()
      offData()
      offExit()
      api.kill({ tileId })
      termRef.current = null
      serializerRef.current = null
      fitRef.current = () => {}
      term.dispose()
    }
    // argsKey stands in for args so a new array with the same items does not respawn.
  }, [tileId, command, argsKey, shell, cwd, mirror])

  // Zoomed: hide xterm (it keeps parsing output) and refresh a coloured snapshot once a second.
  // A layout effect, so the first snapshot is in place before the browser paints: otherwise
  // the tile flashes empty for a frame every time the zoom leaves 100%.
  useLayoutEffect(() => {
    const term = termRef.current
    const serializer = serializerRef.current
    if (!term || !serializer) return
    if (live) {
      setSnap(null)
      fitRef.current() // the tile may have been resized while zoomed out
      if (canvasStore.getState().focusedTileId === tileId) term.focus()
      return
    }
    term.blur()
    const grab = () => setSnap(snapshot(term, serializer))
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
        <pre
          className="tile-snapshot"
          title="Click to zoom to 100%"
          onClick={zoomHere}
          // Built by @xterm/addon-serialize, which escapes the terminal text.
          dangerouslySetInnerHTML={{ __html: snap ?? '' }}
        />
      )}
    </div>
  )
})

/**
 * A teammate's tile (KAO-54): the owner's grid size, fed from their stream, never resized to
 * fit here (that would garble a TUI drawn for their size). Asks for the current screen first.
 */
function startMirror(tileId: string, term: Terminal, dispose: () => void): () => void {
  const off = onMirror(tileId, (e) => {
    if (e.kind === 'screen') {
      term.reset()
      term.resize(e.cols, e.rows)
      term.write(e.data)
    } else if (e.kind === 'size') term.resize(e.cols, e.rows)
    else term.write(e.data)
  })
  wantScreen(tileId)
  return () => {
    off()
    dispose()
  }
}
