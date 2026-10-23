import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'

interface Props {
  tileId: string
  title?: string
  /** Undefined runs the user's login shell. */
  command?: string
  args?: string[]
  cwd?: string
}

export function TerminalTile({ tileId, title, command, args, cwd }: Props) {
  const host = useRef<HTMLDivElement>(null)

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
    const offExit = api.onExit((e) => e.tileId === tileId && term.write(`\r\n\x1b[2m[process exited ${e.code}]\x1b[0m\r\n`))
    const input = term.onData((data) => api.input({ tileId, data }))
    const resize = term.onResize(({ cols, rows }) => api.resize({ tileId, cols, rows }))
    api.spawn({ tileId, command, args, cwd, cols: term.cols, rows: term.rows })

    const ro = new ResizeObserver(() => fit.fit())
    ro.observe(host.current!)
    term.focus()

    return () => {
      ro.disconnect()
      input.dispose()
      resize.dispose()
      offData()
      offExit()
      api.kill({ tileId })
      term.dispose()
    }
  }, [tileId, command, args, cwd])

  return (
    <section className="tile">
      <header className="tile-bar">{title ?? command ?? 'shell'}</header>
      <div className="tile-term" ref={host} />
    </section>
  )
}
