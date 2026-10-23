# Handoff

Updated 2026-10-23, after KAO-21.

## Where things stand
- KAO-21 is done: the app shell runs one real terminal tile (Electron 45, electron-vite 6, React, xterm.js, node-pty).
- `npm run dev`, `npm test`, `npm run typecheck` and `npm run build` all work on the Bazzite host with Homebrew Node 26.
- The architecture and IPC contract are in `docs/PRODUCT.md`. Gotchas are in the Linear doc "Agent Canvas brain".
- Every other MVP issue was blocked only by KAO-21, so they are all unblocked now.

## Next step
Run two terminals at the same time, both in `~/code/agent-canvas`:

- **Terminal 2 (agents):** start Claude Code and run
  `/linear-agent run KAO-23 KAO-24 KAO-25 KAO-26 KAO-28`
  That runs KAO-23 on Opus, KAO-24, KAO-25 and KAO-26 on Sonnet, and KAO-28 on Haiku. Each gets its own worktree and opens a PR, and none of them push to main.
- **Terminal 1 (Kao):** do KAO-22 (infinite canvas) yourself on its Linear branch, in a worktree.

## Watch out for
- KAO-22 and KAO-26 both touch how tiles are placed. Keep the `Tile` shape in `src/shared/types.ts` as the single source, and merge KAO-22 first.
- KAO-23's zoom spike affects how KAO-22 scales tiles. Read its findings before you settle on zoom in KAO-22.
- KAO-25 spawns `command` directly. If `claude`, `codex` or `gemini` aren't on Electron's PATH, run them through the login shell instead (`$SHELL -l -c`).
