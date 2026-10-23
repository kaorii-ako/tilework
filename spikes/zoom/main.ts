// Throwaway spike for KAO-23: three ways to zoom xterm.js tiles. See docs/zoom-spike.md.
import '@xterm/xterm/css/xterm.css'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'

type Approach = 'transform' | 'font' | 'hybrid'
type Renderer = 'webgl' | 'dom'

const FONT = 13
const W = 560
const H = 320
const GAP = 24

interface Spike {
  el: HTMLElement
  host: HTMLElement
  snap: HTMLPreElement
  term: Terminal
  fit: FitAddon
  cellH: number
  x: number
  y: number
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const world = $<HTMLDivElement>('world')
const out = $<HTMLPreElement>('out')
const zoomInput = $<HTMLInputElement>('zoom')

let approach: Approach = 'transform'
let renderer: Renderer = 'webgl'
let zoom = 1
let streaming = true
let tiles: Spike[] = []
let snapTimer = 0

function build(): void {
  for (const t of tiles) t.term.dispose()
  world.replaceChildren()
  tiles = Array.from({ length: 6 }, (_, i) => {
    const el = document.createElement('section')
    el.className = 'tile'
    el.innerHTML = `<header class="tile-bar">tile ${i + 1}</header><div class="tile-term"></div><pre class="snap" hidden></pre>`
    world.append(el)
    const host = el.querySelector<HTMLElement>('.tile-term')!
    const snap = el.querySelector<HTMLPreElement>('.snap')!
    snap.onclick = () => setZoom(1)
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Cascadia Code", "DejaVu Sans Mono", monospace',
      fontSize: FONT,
      allowProposedApi: true,
      theme: { background: '#14171d', foreground: '#d6dae3', selectionBackground: '#2e3a4a' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    if (renderer === 'webgl') term.loadAddon(new WebglAddon())
    const t: Spike = {
      el,
      host,
      snap,
      term,
      fit,
      cellH: 15,
      x: (i % 3) * (W + GAP) + GAP,
      y: Math.floor(i / 3) * (H + GAP) + GAP
    }
    for (let r = 0; r < 40; r++) term.writeln(line(i, r))
    return t
  })
  apply()
}

let tick = 0
function line(i: number, n: number): string {
  const c = 31 + ((i + n) % 6)
  return `\x1b[2m${String(n).padStart(5, '0')}\x1b[0m \x1b[${c}m[agent ${i + 1}]\x1b[0m compiled module_${n % 97} in ${(n * 7) % 300}ms  0123456789abcdef`
}
setInterval(() => {
  if (!streaming) return
  tick++
  for (const [i, t] of tiles.entries()) t.term.writeln(line(i, tick))
}, 50)

function apply(): void {
  const live = approach !== 'hybrid' || zoom === 1
  world.style.transform = approach === 'font' ? '' : `scale(${zoom})`
  for (const t of tiles) {
    const s = approach === 'font' ? zoom : 1
    Object.assign(t.el.style, { left: `${t.x * s}px`, top: `${t.y * s}px`, width: `${W * s}px`, height: `${H * s}px` })
    const fs = approach === 'font' ? Math.max(1, Math.round(FONT * zoom * 2) / 2) : FONT
    if (t.term.options.fontSize !== fs) t.term.options.fontSize = fs
    t.host.hidden = !live
    t.snap.hidden = live
    if (live) {
      t.fit.fit()
      t.cellH = t.el.querySelector<HTMLElement>('.xterm-screen')!.offsetHeight / t.term.rows
    }
  }
  clearInterval(snapTimer)
  if (!live) {
    snapshot()
    // ponytail: plain-text snapshot at 1 Hz; serialize addon would keep colours.
    snapTimer = window.setInterval(snapshot, 1000)
  }
  $<HTMLSpanElement>('zoomVal').textContent =
    `${Math.round(zoom * 100)}%  ${tiles[0]?.term.cols}x${tiles[0]?.term.rows}`
}

function snapshot(): void {
  for (const t of tiles) {
    const b = t.term.buffer.active
    const rows: string[] = []
    for (let r = 0; r < t.term.rows; r++) rows.push(b.getLine(b.viewportY + r)?.translateToString(true) ?? '')
    t.snap.style.fontSize = `${FONT}px`
    t.snap.style.lineHeight = `${t.cellH}px`
    t.snap.textContent = rows.join('\n')
  }
}

function setZoom(z: number): void {
  zoom = Math.round(z * 100) / 100
  zoomInput.value = String(zoom)
  apply()
}

/** Drag-selects cols 5..25 on row 3 of tile 1 using on-screen pixels, returns what xterm actually selected. */
function hitTest():
  | { zoom: number; approach: Approach; renderer: Renderer; grid: string; expected: string; got: string; ok: boolean }
  | { zoom: number; approach: Approach; note: string } {
  const t = tiles[0]
  if (t.host.hidden) return { zoom, approach, note: 'snapshot (not interactive); click zooms to 100%' }
  const screen = t.el.querySelector<HTMLElement>('.xterm-screen')!
  const r = screen.getBoundingClientRect()
  const cw = r.width / t.term.cols
  const ch = r.height / t.term.rows
  const at = (col: number, row: number) => ({
    clientX: r.left + col * cw + 1,
    clientY: r.top + (row + 0.5) * ch,
    bubbles: true,
    button: 0,
    detail: 1
  })
  t.term.clearSelection()
  const target = document.elementFromPoint(at(5, 3).clientX, at(5, 3).clientY)!
  target.dispatchEvent(new MouseEvent('mousedown', { ...at(5, 3), buttons: 1 }))
  document.dispatchEvent(new MouseEvent('mousemove', { ...at(25, 3), buttons: 1 }))
  document.dispatchEvent(new MouseEvent('mouseup', at(25, 3)))
  const p = t.term.getSelectionPosition()
  const vy = t.term.buffer.active.viewportY
  const got = p ? `row ${p.start.y - vy} col ${p.start.x}-${p.end.x}` : 'nothing'
  const expected = 'row 3 col 5-25'
  return { zoom, approach, renderer, grid: `${t.term.cols}x${t.term.rows}`, expected, got, ok: got === expected }
}

/** Animates zoom 1 -> 0.4 -> 1 over 120 frames with all 6 tiles streaming; reports frame times and zoom work per frame. */
function perfSweep(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const deltas: number[] = []
    const work: number[] = []
    let error = ''
    let last = performance.now()
    let f = 0
    const r1 = (n: number) => Math.round(n * 10) / 10
    const stats = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b)
      return {
        avg: r1(xs.reduce((a, b) => a + b, 0) / xs.length),
        p95: r1(s[Math.floor(s.length * 0.95)]),
        max: r1(s[s.length - 1])
      }
    }
    const step = (now: number) => {
      deltas.push(now - last)
      last = now
      f++
      const t0 = performance.now()
      try {
        setZoom(1 - 0.6 * Math.sin((Math.PI * f) / 120))
      } catch (e) {
        error ||= String(e)
      }
      work.push(performance.now() - t0)
      if (f < 120) return void requestAnimationFrame(step)
      setZoom(1)
      deltas.shift()
      resolve({
        approach,
        renderer,
        frameMs: stats(deltas),
        zoomWorkMs: stats(work),
        longFrames: deltas.filter((d) => d > 20).length,
        error
      })
    }
    requestAnimationFrame(step)
  })
}

function set(a: Approach, r: Renderer, z: number): void {
  approach = a
  $<HTMLSelectElement>('approach').value = a
  if (r !== renderer || !tiles.length) {
    renderer = r
    $<HTMLSelectElement>('renderer').value = r
    build()
  }
  setZoom(z)
}

$<HTMLSelectElement>('approach').onchange = (e) =>
  set((e.target as HTMLSelectElement).value as Approach, renderer, zoom)
$<HTMLSelectElement>('renderer').onchange = (e) =>
  set(approach, (e.target as HTMLSelectElement).value as Renderer, zoom)
zoomInput.oninput = () => setZoom(Number(zoomInput.value))
$<HTMLInputElement>('stream').onchange = (e) => (streaming = (e.target as HTMLInputElement).checked)
$<HTMLButtonElement>('hit').onclick = () => (out.textContent = JSON.stringify(hitTest(), null, 1))
$<HTMLButtonElement>('perf').onclick = async () => (out.textContent = JSON.stringify(await perfSweep(), null, 1))

// Hook for spikes/zoom/run.mjs --report.
Object.assign(window, { spike: { set, hitTest, perfSweep, setStreaming: (on: boolean) => (streaming = on) } })
set('transform', 'webgl', 1)
