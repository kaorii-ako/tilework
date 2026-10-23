# Handoff

Updated 2026-10-23, after KAO-22 with zoom (PR #5 open, not merged).

## Where things stand
- KAO-21 is done and on main.
- KAO-22's canvas is in PR #5 on branch `79807/kao-22-infinite-canvas-pan-zoom-drag-and-resize-tiles`. It has pan (space+drag, middle-drag, two-finger scroll), tile drag and resize, click to focus and raise, a "+ Shell" button and a close button.
- Zoom uses the hybrid approach Kao picked from the KAO-23 spike: ctrl+wheel around the cursor, live xterm only at 100%, and plain-text snapshots otherwise. Clicking a snapshot zooms to that tile.
- Canvas state is a zustand store in `src/renderer/src/canvas/store.ts`. Read `docs/PRODUCT.md` → Canvas.
- Open PRs: #1 KAO-24, #2 KAO-26, #3 KAO-25, #5 KAO-22 (this), #6 KAO-23. KAO-28 (#4) is merged; this branch has main merged in and passes `npm run lint` and `format:check`.

## Next step
1. Kao tries PR #5 by hand (`npm run dev` on the branch), especially trackpad pan and pinch, which I could only test with synthetic events.
2. Merge PR #5 first, then KAO-23 (#6) (its doc is what PRODUCT.md cites), then rebase the other agent PRs onto it:
   - **KAO-25:** drop `App.tsx` and `src/shared/placement.ts`. The launcher calls `canvasStore.getState().addTile()` with `placeNewTile()` and replaces "+ Shell". `TileFrame` passes `tile.args` through to `TerminalTile`.
   - **KAO-26:** use the shared `Viewport` in the store, and implement its `CanvasState` with `getState()`, `setLayout()` and `subscribe()`.
   - **KAO-24 and KAO-28:** small text conflicts in `TerminalTile.tsx` and `styles.css`.

## Watch out for
- Snapshots are plain text. For colours, add `@xterm/addon-serialize` and use `serializeAsHTML()` in `snapshot()` in `TerminalTile.tsx`.
- To drive the app from a script, run `npx electron-vite dev -- --remote-debugging-port=9339` and use CDP `Input.dispatch*` events. Synthetic DOM pointer events can't take pointer capture, and rAF stalls while the window is covered.
