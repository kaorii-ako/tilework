# Handoff

Updated 2026-10-24, after the KAO-26, 31, 32 and 33 chain. All PRs are merged; there are no open PRs.

## Where things stand
Main has the whole MVP plus links and handoffs:
- KAO-21 scaffold, KAO-28 lint/format, KAO-22 canvas, KAO-23 zoom spike, KAO-24 status badges, KAO-25 launcher.
- KAO-26 (#2): save/restore of `~/.config/agent-canvas/workspace.json` (tiles, viewport, links). `startWorkspace()` restores on mount, saves debounced on every change, and flushes on `beforeunload`.
- KAO-31 (#7): the launcher takes keyboard focus on open and gives it back to a terminal on close.
- KAO-32 (#8): links between tiles. `Link {id, fromTileId, toTileId, mode}`, `links` in `canvasStore`, SVG layer under the tiles, ports on tile edges, status colour on lines. Agent status now lives in `canvasStore` too.
- KAO-33 (#9): handoffs. The Stop hook forwards `transcript_path`; main reads the last assistant message (only `.jsonl` under `~/.claude/`, capped at 4,000 chars) and sends it over `agent:result`. Manual "Send →" chip, auto mode (queues while the target is busy), loop guard (5 handoffs / 10 min without a keystroke, then back to manual with "loop paused"). `src/renderer/src/canvas/handoff.ts` holds the logic.

## Next step
Kao tries it by hand (checklist in the PR table of the last chat), then decides the open questions below. KAO-27, KAO-29 and KAO-30 were not run (KAO-29: typescript-eslint once it supports TypeScript 7; KAO-30: coloured zoom snapshots).

## Open decisions
- Strip `CLAUDE_CODE_*` env vars from tile PTYs? If the app is launched from inside a Claude Code session, tiles inherit a variable that disables transcripts, so handoffs never get a result.
- Loop guard is global (any keystroke resets it, parallel auto chains share the limit). Make it per chain?
- A link can be dropped anywhere on the target tile, not only on the input port.
- `docs/PRODUCT.md` does not list the `agent:result` channel or the links and handoff model yet.

## Watch out for
- The hook must be in `~/.claude/settings.json` by hand (`docs/STATUS-HOOKS.md`). Claude Code writes the transcript slightly after Stop fires, so main waits 1 s before reading it.
- To drive the app from a script: `node_modules/.bin/electron . --ozone-platform=x11 --remote-debugging-port=<port>`. On the default Wayland backend CDP input stalls. Unset `CLAUDE_CODE_*` first if the tiles run claude.
- Snapshots are plain text. For colours, add `@xterm/addon-serialize`.
- A stale stash ("stale local HANDOFF draft") sits in the main checkout; it is an old draft, safe to drop.
