# Handoff

Updated 2026-10-26, after Tilework 0.3.0.

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

- **v0.3.0 is out:** KAO-53 adds the fan-out workflow "Plan → 3 Builders → Review", where workflow tiles can set `worktree: true`.

## In flight (2026-10-26)
- **PR #13, KAO-52: dynamic workflows.**
  - Conditional routes (when/otherwise), join, split into parallel workers, router (`ROUTE:`), start with a goal.
  - New built-ins: Plan → Parallel build → Review, and Triage. Build ↔ Review now stops on APPROVED.
  - 168 unit tests and new e2e tests pass. Not yet run as a full loop with real Claude Code.
- **KAO-54 PR: team mode phase 1.** Stacked on #13, so merge #13 first.
  - Share a canvas peer to peer (WebRTC) with an invite code. Signaling goes through ntfy.sh, encrypted. Free, no server.
  - The host approves each join, and teammates' tiles are live, read-only mirrors.
  - 195 unit tests pass. The two-instance e2e passes against a local fake ntfy and against the real ntfy.sh.
  - Not tested: two different home networks, where strict NATs need TURN (KAO-57).
- Design doc: Linear "Team mode design". Next phases: KAO-55 (cross-person handoffs and chat), KAO-56 (overlap warnings), KAO-57 (relay and polish).

## Next steps
0. **Try both PRs by hand.** Start Plan → Parallel build → Review with a goal. Then share a canvas with a second machine: Share, send the code, the teammate joins, you Allow. Merge #13, then the KAO-54 PR. Don't merge before the Product Hunt day is over.
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
- `npm test`: 136 unit tests.
- `npm run e2e`: 19 Playwright tests. `REAL_CLAUDE=1 DEMO_FRAMES=<dir> npx playwright test real-claude -g Plan` re-records the demo frames.
- `npm run dist`, then `PACKAGED=1 npx playwright test packaged`.

## Watch out for
- **Hook upkeep:** internal ids still say agent-canvas (config dir, `AGENT_CANVAS_TILE_ID`, hook file) on purpose. Changing them breaks installed hooks and Nublet.
- **Scripting the app:** use `--ozone-platform=x11`.
- **Stray tab:** an AgentGrid tab is still open in the "Work/Github" Chrome browser. Close it by hand.
