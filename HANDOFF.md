# Handoff

Updated 2026-10-25, after the launch-prep pass. Nothing is merged or public yet.

## Where things stand
- **Name:** the product is now **Tilework**. "Agent Canvas" is an OpenHands product. Internal ids keep the old name: `~/.config/agent-canvas`, `AGENT_CANVAS_TILE_ID`, `hooks/agent-canvas-hook.sh`. The license is MIT.
- **Open PRs**, all stacked on #15, so merge #15 first:
  - #14 KAO-30: coloured zoom snapshots (based on main)
  - #15 KAO-44: rename, LICENSE, public README
  - #16 KAO-45: AppImage (`npm run dist`) and the release workflow for `v*` tags
  - #17 KAO-46: Focus line in the status file, for Nublet
  - #18 KAO-47: landing page in `site/` and the Pages workflow
  - nublet#1: Nublet shows tile names and focuses the tile on click
- **Launch kit** (Product Hunt copy, Show HN, the stars plan, research notes): `docs/LAUNCH.md`.
- **New backlog from the research:** KAO-48 resume sessions after a restart, KAO-49 notifications, KAO-50 a worktree per tile, KAO-51 the demo GIF.
- **Blocked:** KAO-29 (typescript-eslint still supports TypeScript only below 6.1). KAO-10 and KAO-20 are manual tasks for Tawin.

## Next step
Merge the PRs. Do KAO-51. Then follow "Before launch day" in `docs/LAUNCH.md`: repo public, Pages, tag `v0.1.0`.

## Tests
- `npm test`: 120 unit tests once #17 is in.
- `npm run e2e`: 15 Playwright tests, including the Focus line test.
- `PACKAGED=1 npx playwright test packaged`: after `npm run dist`, checks that the AppImage build opens a real shell.

## Watch out for
- The release and Pages workflows haven't run yet. The first `v0.1.0` tag will test the release workflow. Pages needs the repo to be public.
- The Nublet change is only tested outside GNOME Shell. Copy it into `~/.local/share/gnome-shell/extensions/nublet@kaorii-ako` and log in again to try it.
- Scripting the app: use `--ozone-platform=x11`. On Wayland, synthetic input stalls when the window isn't visible.
