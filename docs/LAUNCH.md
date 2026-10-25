# Tilework launch kit

Prepared 2026-10-25. Nothing here has been posted yet. You post everything from your own accounts.

## What the research says

Sources, read in Chrome: the Product Hunt pages for AgentGrid and Maestri, and every 2026 Show HN about running agents on a canvas (via the HN Algolia API).

- **The space is crowded:** AgentGrid, Maestri, TermCanvas, Nodeterm, OpenCove, ccanvas, CodeGrid, Ret, Rondoflow, Murmell, OpenHands Agent Canvas. Almost every "agents on a canvas" Show HN in 2026 got 1 to 4 points. "Another canvas" doesn't get attention on its own.
- **What broke out:** Whiteboard (YC W26) got 424 points and 143 comments. It had a sharp angle of its own (understanding what agents did), a demo video, an MIT repo, a personal story and a clear install line.
- **What users praise:** in AgentGrid's comments it's restored sessions after a restart ("restart anxiety"). In Maestri's it's agents linked by drawing a line. Our handoffs already do the second, and KAO-48 adds the first.
- **What users ask for:** a decision queue or notifications (KAO-49), worktrees per agent (KAO-50), shared notes, and Ghostty-quality rendering.
- **Our angle:** Linux and GNOME first, which none of the polished ones are. Handoffs you can see and approve, manual by default. The Nublet top-bar pill. Free and MIT, where Maestri is paid and Mac-only.

## Before launch day (in order)

1. Merge #15, then #16, #17 and #18, and nublet#1.
2. ~~KAO-51 demo GIF~~: done (`docs/demo.gif`, `site/img/demo.mp4`).
3. Make the repo public, set Pages to "GitHub Actions", and push tag `v0.1.0`. Then publish the draft release.
4. Do KAO-48 (resume sessions) if there's time. It's the feature people praise most.
5. Repo settings: description, topics (`claude-code`, `ai-agents`, `terminal`, `linux`, `gnome`, `electron`, `infinite-canvas`) and a social preview image (the site hero).

## Product Hunt

Launch on a Tuesday to Thursday at 00:01 PT. Be in the comments all day.

- **Name:** Tilework
- **Tagline** (52 chars): Every coding agent in view, on one canvas. For Linux.
- **Description** (under 260 chars): Tilework runs Claude Code, Codex, Gemini CLI and your shell in real terminal tiles on an infinite canvas. A dot per tile shows who's working, done or waiting on you. Link tiles to hand one agent's result to the next. Free, MIT, Linux.
- **Topics:** Developer Tools, Linux, Artificial Intelligence, Open Source
- **Gallery** (1270×760, in `docs/launch/`): `gallery-1-demo.gif` (a real Plan → Build → Review run), `gallery-2-send.png`, `gallery-3-review.png`, `gallery-4-workflows.png`. Add a shot of the Nublet pill if you can take one in GNOME.
- **Links:** the site (GitHub Pages) and the repo.

**First comment (maker):**

> Hi Product Hunt, I'm Tawin. I run several Claude Code sessions at once on Linux, and I kept losing track of which one was waiting on me. Every good canvas app for agents was Mac-only, so I built Tilework.
>
> Each agent gets a real terminal tile (a real PTY, your own CLI and config) on a canvas you can pan and zoom. One dot per tile tells you who's working, done or needs you. Drag a line between two tiles, and when the first finishes, Send → passes its answer to the next with your instruction. It's manual by default, so nothing runs without you. Workflows lay out Plan → Build → Review in one click, and if you use GNOME, the Nublet extension shows your tiles in the top bar.
>
> It's free and MIT licensed. I'd love to hear what gets in your way, and which agent you'd want to wire up first.

## Show HN (post the day after Product Hunt, 8 to 10am ET on a weekday)

**Title:** Show HN: Tilework – coding agents in real terminals on a canvas, for Linux

**Text:** two short paragraphs, the same story as the first comment. Then the install line, the repo link, and one honest limitation (only Claude Code reports status today).

## Other places (one post each, different wording, a few days apart)

- r/linux and r/gnome: lead with the AppImage and the Nublet pill.
- r/ClaudeAI and r/ClaudeCode: lead with handoffs and workflows. Include the GIF.
- Lobsters (if you have an invite), tag `linux`.
- An awesome-claude-code list: open a PR adding Tilework.
- X and Bluesky: the demo GIF plus one line.

## Getting stars

- Put the demo GIF at the top of the README (KAO-51), and keep the install to one line.
- Answer every issue in the first week. Label a few as `good first issue`.
- Ship visible releases (v0.1.1, v0.2) every week or two. Each one is a reason to post again.
- Don't buy stars or trade upvotes. Product Hunt and GitHub detect it, and it can get the launch removed.
