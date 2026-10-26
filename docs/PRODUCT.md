# Tilework: product brief

Read this before touching the code. The product is called **Tilework** (renamed from the working name "Agent Canvas", which is an OpenHands product). Internal ids keep the old name: `~/.config/agent-canvas`, `AGENT_CANVAS_TILE_ID`, `hooks/agent-canvas-hook.sh`, so existing installs and Nublet keep working.

## What it is

A Linux desktop app for running many coding agents side by side. Each agent (Claude Code, Codex, Gemini CLI, or just a shell) lives in a real terminal tile backed by a real PTY, not an imitation of one. Tiles sit on an infinite canvas you can pan, zoom and arrange however you like. The point is to see at a glance which agents are busy, which are idle, and which are blocked waiting for you.

It is inspired by a Mac-only app, but it is its own product with its own name, look and words.

## Original branding only

Never copy another product's name, logo, icons, UI copy, layouts or screenshots. Write our own text and design our own visuals. If you are unsure whether something is too close, make it different.

## MVP (tonight)

| Issue | What |
| -- | -- |
| KAO-21 | App shell with one real terminal tile (done) |
| KAO-22 | Infinite canvas: pan, zoom, drag, resize, multi-tile focus |
| KAO-23 | Spike: zooming xterm.js without blurry text or broken mouse hit-testing |
| KAO-24 | Live status per tile from Claude Code hooks |
| KAO-25 | "New tile" launcher with presets (claude, codex, gemini, shell) and a working folder |
| KAO-26 | Save and restore the layout between launches |
| KAO-28 | editorconfig, Prettier and lint scripts |

## Later

Handoffs between tiles, loops, a voice planner, per-repo "studios", AppImage packaging.

## Architecture

Electron + electron-vite, React, TypeScript (strict).

- **Main process** (`src/main`). `PtyManager` wraps node-pty and keeps a `Map<tileId, IPty>`. A tile with no `command` gets the user's `$SHELL` (fallback `/bin/bash`) as a login shell (`-l`). Every PTY gets `AGENT_CANVAS_TILE_ID=<tileId>` in its env (and loses any inherited `CLAUDECODE` / `CLAUDE_CODE_*` session variables, which would stop a nested Claude Code from writing its transcript), which the status hooks (KAO-24) use to report back. Spawning an existing tileId replaces its PTY. All PTYs are killed on quit.
- **IPC** (`src/shared/ipc.ts`). The only place channels and payloads are defined:
  - renderer → main: `pty:spawn {tileId, command?, args?, cwd?, cols, rows}` (invoke), `pty:input {tileId, data}`, `pty:resize {tileId, cols, rows}`, `pty:kill {tileId}`
  - main → renderer: `pty:data {tileId, data}`, `pty:exit {tileId, code}`
- **Preload** (`src/preload`). Exposes `window.canvasApi` (type `CanvasApi`) via contextBridge. contextIsolation on, nodeIntegration off, sandbox on. It is built as CommonJS because sandboxed preloads must be.
- **Canvas** (`src/renderer/src/canvas`). One zustand store (`store.ts`) holds `viewport {x, y, zoom}`, `tiles: Tile[]`, `order` (tile ids back to front) and `focusedTileId`. Read it in components with `useCanvas(selector)`, and outside React with `canvasStore.getState()` and `canvasStore.subscribe`. The convention is `screen = canvas * zoom + (x, y)`. Panning writes one CSS transform on `.world` straight from a store subscription, so no tile or terminal re-renders while panning. Space+drag pans from anywhere, and middle-drag and two-finger scroll pan from the background. ctrl+wheel (and trackpad pinch) zooms around the cursor between 20% and 150%, snapping to exactly 100% when it passes it. A plain space press is held back until we know whether it starts a pan (`spaceGesture.ts`). Keyboard focus follows `focusedTileId`, so only that tile's xterm holds DOM focus.
- **Zoom is hybrid** (from the KAO-23 spike, `docs/zoom-spike.md`). Scaled xterm is blurry and its mouse hit-testing breaks, and resizing the font per zoom level resizes every PTY. So terminals are live only at exactly 100%. At any other zoom, `TerminalTile` hides xterm with `visibility: hidden` (it keeps running and keeps its size) and shows a plain-text snapshot of the visible rows, refreshed once a second. Clicking a snapshot zooms to 100% centered on that tile. You can't type into a tile while zoomed out, by design.
- **Renderer** (`src/renderer`). `<TerminalTile tileId command args cwd />` uses @xterm/xterm, the fit addon and the WebGL addon (falling back to the DOM renderer). A ResizeObserver refits it 50 ms after the size settles, and xterm's `onResize` sends the new cols and rows to the PTY. It is memoized, so moving its frame never re-renders it.
- **Workflows** (`src/shared/workflows.ts`, KAO-35). A workflow is tiles (title, command, model, relative layout) plus links (instruction, mode). Built-ins ship in code; custom ones are saved in `~/.config/agent-canvas/workflows.json` (`src/main/workflows-store.ts`, validated with `parseWorkflows`). `instantiateWorkflow` turns one into real tiles and links. Each `Link` carries an optional `instruction`, which ends the handoff text.
- **Dynamic workflows** (`src/renderer/src/canvas/flow.ts` and `handoff.ts`, KAO-52). Workflows can branch and adapt at runtime instead of running as straight chains:
  - **Conditional routes:** a link with `when` fires only if the source's result contains that text. An `otherwise` link fires only if none of its sibling `when` links matched. `firingLinks` decides this when a result arrives.
  - **Join:** a tile with `join` waits for every input whose source is still busy (working, needing input, owing a result, or starting), then gets one combined handoff. The first round waits for all parallel workers; later rounds go as soon as the busy inputs are done.
  - **Split:** sending on a `split` link parses the result's task list (a ```` ```tasks ```` block, or top-level list items) and gives each task to the target or to a worker cloned from it, at most 8. Workers carry `workerOf`, copy the target's outgoing links, and are reused on the next split.
  - **Router:** a tile with `router` is told its choices, and the `ROUTE: <tile title>` line in its reply decides which links fire.
  - **Queued input:** split tasks and a workflow's goal wait in `queued` until the tile is ready. A Claude Code tile is ready at its first status. Any other tile is ready `PTY_SETTLE_MS` after its PTY starts, because a login shell's startup can read stdin and eat a paste.
  - **Settings:** everything is set from the link's right-click menu, shown on link chips and tile tags, saved in `workspace.json`, and kept in custom workflows. Split workers are left out of saved workflows.
- **Team mode** (`src/shared/team.ts`, `src/renderer/src/team/`, `src/main/signal.ts`, KAO-54). Teammates share one canvas peer to peer, free and without accounts:
  - **Connection:** WebRTC data channels, with public STUN servers. The connection details are swapped through a public ntfy.sh topic (or `TILEWORK_SIGNAL_URL`), sealed with AES-256-GCM using the key from the invite code (`tw1.<room>.<key>`). Main relays only ciphertext, and only on `tw-` topics.
  - **Joining:** the host approves each join and relays between guests.
  - **Routing:** `TeamCore` routes messages and checks that a tile's output, screen, size and status come from its owner.
  - **Teammates' tiles:** each carries `ownerId` and renders as a read-only mirror (`TerminalTile mirror`). No process runs, there's no input, and it keeps the owner's grid size. Only the title, geometry and flow flags are shared, never the command, folder or session. These tiles are never saved, and they can't be moved, resized or linked locally.
  - **Limits:** strict NATs need a TURN relay, which isn't built yet (KAO-57). Cross-person handoffs are KAO-55, and overlap warnings are KAO-56.
