# Handoff

Updated 2026-10-25, after Tilework 0.2.0.

## Where things stand
- **Public repo:** https://github.com/kaorii-ako/tilework. The history was rewritten to the noreply email with no Claude co-author lines. The old private repo, kaorii-ako/agent-canvas, keeps its PR history and is the local remote `old-private`. Don't make it public: its PR pages show the school email.
- **Release:** v0.1.0 is published with the AppImage. CI builds it when you push a `v*` tag, and the CI build passed the packaged real-shell test.
- **Site:** https://kaorii-ako.github.io/tilework/. It deploys from `site/` on pushes to main.
- **Nublet:** the integration is merged and live: tile names in the pill, and a click focuses the tile. It's also copied into `~/.local/share/gnome-shell/extensions/nublet@kaorii-ako`; log in again to load it. The backup is at `~/.local/share/gnome-shell/nublet-backup-2026-10-25`.
- **Linear:** KAO-30 and KAO-44 to KAO-47 are Done. KAO-29 is still blocked (typescript-eslint supports TypeScript only below 6.1). KAO-10 and KAO-20 are manual tasks for Tawin.
- **Launch kit:** `docs/LAUNCH.md` has the Product Hunt copy, the Show HN draft, where to post, and research notes.

## Since 0.1.0
- **v0.2.0 is out** (https://github.com/kaorii-ako/tilework/releases/tag/v0.2.0). The CI AppImage passed the packaged real-shell test.
  - KAO-48: Claude tiles resume their session after a restart.
  - KAO-49: desktop notifications.
  - KAO-50: optional git worktree per tile.
  - KAO-51: demo GIF and video from a real run, plus Product Hunt gallery images in `docs/launch/`.
- **Merging:** PRs are merged by fast-forwarding main locally and pushing. GitHub's squash and rebase merges stamp the account's primary (school) email until email privacy is on.

## Next steps
1. **Product Hunt: scheduled.** It goes live at 00:01 PT on Monday 2026-10-26 (14:01 in Bangkok), at https://www.producthunt.com/products/tilework. On launch day: answer every comment, and post the Show HN the next day (`docs/LAUNCH.md`). The pre-launch dashboard suggests a website badge and a forum thread.
   Old note: everything is ready in `docs/LAUNCH.md` and `docs/launch/`. Claude Code's permission system blocked Claude in Chrome from opening producthunt.com/posts/new ("Real-World Transactions"). Tawin either allows that action, then Claude fills in the form in Browser 2 and stops before the final click, or Tawin submits it by hand.
2. **GitHub email privacy:** Settings → Emails: "Keep my email addresses private" and "Block command line pushes that expose my email".
3. **Then Show HN and Reddit,** per `docs/LAUNCH.md`.
4. **Ideas from the research, not yet issues:** shared notes tiles (a markdown file agents can read and write), cleaning up a tile's worktree when it closes, status for Codex and Gemini.

## Git setup
- **Local checkout:** `origin` is tilework. `user.email` is `261148263+kaorii-ako@users.noreply.github.com` here and in `~/code/nublet`.
- **Commits:** no `Co-Authored-By: Claude` lines.
- **Lockfile:** this PR also fixes `package-lock.json`, whose license field said UNLICENSED.

## Tests
- `npm test`: 134 unit tests.
- `npm run e2e`: 18 Playwright tests. `REAL_CLAUDE=1 DEMO_FRAMES=<dir> npx playwright test real-claude -g Plan` re-records the demo frames.
- `npm run dist`, then `PACKAGED=1 npx playwright test packaged`.

## Watch out for
- **Hook upkeep:** internal ids still say agent-canvas (config dir, `AGENT_CANVAS_TILE_ID`, hook file) on purpose. Changing them breaks installed hooks and Nublet.
- **Scripting the app:** use `--ozone-platform=x11`.
- **Stray tab:** an AgentGrid tab is still open in the "Work/Github" Chrome browser. Close it by hand.
