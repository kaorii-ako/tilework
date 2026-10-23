# Handoff

Updated 2026-10-23, when merging #3 (KAO-25).

## Where things stand
Main now has:
- KAO-21 (scaffold)
- KAO-28 (#4, lint and format)
- KAO-22 (#5, canvas: pan, hybrid zoom, drag, resize, focus)
- KAO-24 (#1, status badges)
- KAO-25 (#3, launcher)

How the merged pieces fit:
- **Launcher:** opens with "+ New tile" or Ctrl+Shift+N and adds tiles through `canvasStore.addTile()` with `placeNewTile()`. Tiles carry `command`, `args`, `shell`, `presetId` and `cwd`.
- **Status badges:** shown in `TileFrame`'s title bar by `TileStatus`. A badge resets to "shell" whenever the tile respawns, meaning its command, args, shell or cwd changed. Main sends `exited` when a PTY dies on its own.
- Checked in the running app: a launched custom command runs in its folder, fires the hook and shows "working". The badge stays visible while zoomed out and turns "exited" on exit.

Still in flight:
- #6 KAO-23 (zoom spike doc), merged right after this.
- The launcher-focus bug: a new issue, worked by a haiku agent. Its PR stays open for review.
- #2 KAO-26 (save and restore layout), being rebased and wired up by a sonnet agent. It gets pushed to #2 and isn't merged.

## Next step
1. Review the launcher-focus PR and #2 (KAO-26), then merge them.
2. Then the MVP is complete. Kao tries it by hand: trackpad pan and pinch, and restoring 4 tiles after a restart.

## Watch out for
- KAO-26 should restore through `canvasStore.getState().setLayout()` and save from `canvasStore.subscribe()`, debounced. Tiles have to keep `command`, `args`, `shell` and `cwd`, or restored tiles come back as plain shells.
- Snapshots are plain text. For colours, add `@xterm/addon-serialize`.
- To drive the app from a script, run `npx electron-vite dev -- --remote-debugging-port=9339` and dispatch DOM events inside the page. CDP `Input.*` events hang while the window is covered.
