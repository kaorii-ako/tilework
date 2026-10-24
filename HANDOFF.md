# Handoff

Updated 2026-10-24, after KAO-34 (UX pass, PR #11) was merged. There are no open PRs.

## Where things stand
Main has the MVP plus links (KAO-32), handoffs (KAO-33) and the UX pass (KAO-34):
- **Main flow:** the empty canvas shows "Start an agent" (Claude Code / Shell, "in <folder> · change"). The bottom toolbar has + New tile, Zoom to fit and ?. Tiles show a status dot and a name. Drag from a tile's right edge onto another tile to link them. "Send →" appears on the line when the source finishes. Auto-send is in the line's right-click menu.
- **Claude Code hook:** if `~/.claude/settings.json` lacks it, a banner offers Install. Install copies the script to `~/.config/agent-canvas/hooks/` (refreshed each launch), writes `settings.json.bak` and appends one entry per event (`src/main/hook-install.ts`). It is installed on Kao's machine. The backup sits next to `settings.json`.
- **Spawn env:** tiles drop inherited `CLAUDECODE` / `CLAUDE_CODE_*` (`tileEnv` in `pty-manager.ts`).
- **New tile placement:** new tiles never overlap; they go right of the focused tile. Pointer and wheel updates are coalesced per frame (`canvas/perFrame.ts`).
- **Findings and screenshots:** `docs/ux-pass.md`.

## Tests
- `npm test`: 108 unit tests.
- `npm run e2e`: 7 Playwright tests against the built app in a temporary home. Windows open hidden, then on workspace 2 (`E2E_WORKSPACE`, 0-based). Needs a desktop session (X11/XWayland) plus `xdotool` and `xprop`.
- `REAL_CLAUDE=1 npm run e2e -- real-claude`: opt-in run with two real Claude Code tiles (haiku). Needs claude logged in and the hook installed. It passed on 2026-10-24.

## Next step
Use it for real work and note what gets in the way. Not run yet: KAO-27, KAO-29 (typescript-eslint once it supports TS 7) and KAO-30 (coloured zoom snapshots).

## Open decisions
- The loop guard is global (any keystroke resets it, and parallel auto chains share the limit). Make it per chain?
- A link can be dropped anywhere on the target tile, not only on the input dot.

## Watch out for
- Claude Code sessions started before the hook was installed need a restart to report status.
- Claude's idle reminder fires `Notification`, so an idle tile turns amber ("Needs you") after about a minute.
- Auto-send pastes "Continue from this." and presses Enter, so the target agent may start real work in its folder.
- Scripting the app: use `--ozone-platform=x11`; on Wayland, synthetic input stalls when the window isn't visible.
