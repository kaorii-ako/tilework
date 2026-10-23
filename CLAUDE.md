# Agent Canvas

Read `docs/PRODUCT.md` first. It has the product, the branding rule and the architecture.

## Commands
- `npm run dev`: run the app (hot reload)
- `npm test`: vitest, must pass before every PR
- `npm run typecheck`: strict tsc over everything
- `npm run build`: production build into `out/`
- node-pty broken after a version bump: `npx electron-builder install-app-deps`

## Folder map
- `src/shared/ipc.ts`: every IPC channel name and payload type, plus the `CanvasApi` interface
- `src/shared/types.ts`: the `Tile` shape used by canvas, launcher and persistence
- `src/main/`: Electron main process; `pty-manager.ts` owns all PTYs
- `src/preload/`: exposes `window.canvasApi` (sandboxed, built as CJS)
- `src/renderer/src/`: React UI; `TerminalTile.tsx` is one xterm.js tile
- `src/renderer/src/canvas/`: canvas store (zustand), pan/focus handling, `TileFrame`
- `docs/`: product brief and specs

## Conventions
- New IPC: add the channel to `IPC` and its payload type in `src/shared/ipc.ts`, extend `CanvasApi`, then implement it in preload and main. Never use raw channel strings elsewhere.
- Validate IPC payloads in main; the renderer is untrusted.
- Canvas state lives only in `canvasStore`; add actions there (with tests), don't keep tile state in components.
- Need more tile fields? Extend `Tile` in `src/shared/types.ts`; don't define a parallel type.
- The renderer never touches Node or node-pty; everything goes through `window.canvasApi`.
- Logic gets a vitest test next to it (`*.test.ts`).
- Original branding only: no copied names, icons, copy or screenshots.

## Git
- Never push to main. Work on the Linear branch for the issue, in a worktree.
- One feature per PR. Commit messages include `KAO-<n>`; PR body has `Fixes KAO-<n>`.
- Don't edit `HANDOFF.md` or brain docs from a parallel agent branch.
