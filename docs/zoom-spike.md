# Spike: xterm.js inside a zoomed canvas (KAO-23)

Throwaway test page: `spikes/zoom/`. Run it with `npm run spike:zoom` (opens in Electron, so it's the same Chromium as the app). It has 6 tiles streaming coloured output, an approach picker, a renderer picker (webgl/dom), a zoom slider, plus **hit test** and **perf sweep** buttons.

`npm run spike:zoom -- --report <dir>` runs every approach × renderer × zoom (50/75/100/150%), saves screenshots and writes `report.json`. The numbers below come from that run (Electron 45, xterm 6, Linux/Wayland, DPR 1, 165 Hz display, so the frame budget is about 6 ms).

- **Hit test**: a synthetic drag over cols 5 to 25 of row 3, using on-screen pixels, then `term.getSelectionPosition()`.
- **Perf sweep**: animates zoom 1 → 0.4 → 1 over 120 frames while all 6 tiles stream output.

## 1. CSS `transform: scale()` on the container

- **Sharp text: no, with WebGL.** The WebGL canvas is a bitmap scaled by the compositor. At 150% it's visibly blurry; at 50% it's soft and aliased. The DOM renderer stays sharp because Chromium re-rasters the text, but that renderer is slower and we'd lose WebGL.
- **Clicks and selection: wrong at any zoom other than 100%, with both renderers.** xterm takes the mouse position from `getBoundingClientRect()` (which is scaled) and divides by its unscaled cell size (`browser/input/Mouse.ts`), so the hit lands at `cell × zoom`. Measured: at 50% the drag selected row 1, cols 3-13; at 75%, row 2, cols 4-19; at 150%, row 5, cols 8-38 (expected row 3, cols 5-25). xterm has no option to correct for this; fixing it would mean rewriting mouse events before xterm sees them.
- **6 tiles: free.** About 0.2 ms of zoom work per frame, 0 long frames. The grid stays at a fixed cols × rows, so the PTY is never resized.

## 2. Change `fontSize` at each zoom level and refit

- **Sharp text: yes**, with both renderers (each glyph is drawn at its real size). Below about 50% the font is 6-7 px and unreadable anyway.
- **Clicks and selection: correct at every zoom** (row 3, cols 5-25 every time). Nothing is transformed.
- **6 tiles: expensive.** Every zoom step rebuilds the glyph atlas and reflows 6 terminals. WebGL: 5 ms average and 13 ms max of zoom work per frame, p95 frame 18 ms. DOM: 11 ms average and 39 ms max, 31 of 119 frames over 20 ms. The cost grows linearly with the number of tiles.
- **The deal-breaker: the grid changes with zoom.** Cell metrics round to whole pixels, so refitting gives a different cols × rows at each level (WebGL: 88×14 at 50%, 67×15 at 75%, 77×16 at 100%, 74×16 at 150%). Each zoom step would resize the PTY, sending SIGWINCH to every agent and making their TUIs reflow and redraw. Pinning cols × rows avoids that, but then the tile's pixel size no longer matches the canvas zoom exactly.

## 3. Hybrid: live terminal at 100%, static snapshot when zoomed

- **Sharp text: yes.** At 100% it's the real xterm, unscaled. When zoomed, the snapshot is plain DOM text (the visible rows of `buffer.active`) inside the scaled world, and Chromium re-rasters it sharply (checked at 50%, 75% and 150%). In the spike the snapshot has no colours; `@xterm/addon-serialize`'s `serializeAsHTML()` would keep them (not installed, because it's a spike).
- **Clicks and selection: correct by construction.** You can only interact at 100%, where the hit test is exact. When zoomed, the snapshot isn't interactive, and clicking it zooms back to 100%.
- **6 tiles: free.** About 0.2 ms per frame, 0 long frames, the same as approach 1. The snapshot refreshes at 1 Hz (well under 1 ms for 6 tiles). The terminals stay alive and keep parsing PTY output while hidden, and cols × rows never change.
- **Cost:** you can't type into a tile or select in it while zoomed out. That's acceptable for an overview ("which agent is blocked?"), and the KAO-24 status badges cover the at-a-glance need.

## Recommendation

**Use approach 3, the hybrid.** Pan and zoom the whole world with one CSS `transform: scale()` (cheap, no PTY resizes). Show live xterm only when zoom is exactly 1. At any other zoom, hide the xterm host (never dispose it) and show a DOM snapshot of the visible rows, refreshed about once a second. Clicking a snapshot zooms to 100% centred on that tile. Approach 1 is ruled out because the hit-testing is wrong. Approach 2 is ruled out because every zoom step resizes the PTY and it's janky with 6 tiles.

### Wiring for KAO-22

- Canvas world: a single container with `transform: translate(x,y) scale(z)`, with `transform-origin: 0 0`. Tiles are positioned in world units from `Tile {x,y,w,h}`, with no per-tile scaling.
- `TerminalTile.tsx`: take a `live: boolean` prop (`zoom === 1`). When it's false, set `hidden` on the `.tile-term` host and render a snapshot `<pre>` from `term.buffer.active`. Skip `fit.fit()` while hidden, because the ResizeObserver would otherwise fit a `display:none` element. Keep the PTY and the `Terminal` instance alive.
- Snap zoom to exactly 1 for "focus a tile" (double-click or click on a snapshot), so the live state is easy to reach.
- Optional upgrade: add `@xterm/addon-serialize` for coloured snapshots.

Not tested here: DPR 2 and fractional scaling. The hybrid doesn't depend on DPR, but approach 1's blur gets worse at fractional DPR.
