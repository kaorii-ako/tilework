# Handoff

Updated 2026-10-25, after the public launch of Tilework 0.1.0.

## Where things stand
- **Public repo:** https://github.com/kaorii-ako/tilework. The history was rewritten to the noreply email with no Claude co-author lines. The old private repo, kaorii-ako/agent-canvas, keeps its PR history and is the local remote `old-private`. Don't make it public: its PR pages show the school email.
- **Release:** v0.1.0 is published with the AppImage. CI builds it when you push a `v*` tag, and the CI build passed the packaged real-shell test.
- **Site:** https://kaorii-ako.github.io/tilework/. It deploys from `site/` on pushes to main.
- **Nublet:** the integration is merged and live: tile names in the pill, and a click focuses the tile. It's also copied into `~/.local/share/gnome-shell/extensions/nublet@kaorii-ako`; log in again to load it. The backup is at `~/.local/share/gnome-shell/nublet-backup-2026-10-25`.
- **Linear:** KAO-30 and KAO-44 to KAO-47 are Done. KAO-29 is still blocked (typescript-eslint supports TypeScript only below 6.1). KAO-10 and KAO-20 are manual tasks for Tawin.
- **Launch kit:** `docs/LAUNCH.md` has the Product Hunt copy, the Show HN draft, where to post, and research notes.

## Next steps
1. **Product Hunt:** not posted. Tawin will give browser control (Claude in Chrome, **Browser 2**) to submit it with the copy in `docs/LAUNCH.md`. Best after KAO-51 (the demo GIF).
2. **Before merging anything on GitHub:** in GitHub Settings → Emails, turn on "Keep my email addresses private" and "Block command line pushes that expose my email". Until then, GitHub squash and rebase merges stamp the school email on commits. (It happened twice on nublet today and was fixed by amending and force-pushing.)
3. **Backlog from the research:** KAO-51 demo GIF, KAO-48 resume Claude sessions after a restart (the most praised feature in this space), KAO-49 notifications, KAO-50 a worktree per tile.
4. **Linear's GitHub integration:** reconnect it to kaorii-ako/tilework so `Fixes KAO-n` closes issues.

## Git setup
- **Local checkout:** `origin` is tilework. `user.email` is `261148263+kaorii-ako@users.noreply.github.com` here and in `~/code/nublet`.
- **Commits:** no `Co-Authored-By: Claude` lines.
- **Lockfile:** this PR also fixes `package-lock.json`, whose license field said UNLICENSED.

## Tests
- `npm test`: 123 unit tests.
- `npm run e2e`: 15 Playwright tests.
- `npm run dist`, then `PACKAGED=1 npx playwright test packaged`.

## Watch out for
- **Hook upkeep:** internal ids still say agent-canvas (config dir, `AGENT_CANVAS_TILE_ID`, hook file) on purpose. Changing them breaks installed hooks and Nublet.
- **Scripting the app:** use `--ozone-platform=x11`.
- **Stray tab:** an AgentGrid tab is still open in the "Work/Github" Chrome browser. Close it by hand.
