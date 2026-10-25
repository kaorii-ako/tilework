# Tilework

**Run many coding agents side by side on an infinite canvas of real terminals. Built for Linux.**

Claude Code, Codex, Gemini CLI or a plain shell: each one runs in a real terminal tile (a real PTY, not an imitation). Pan, zoom and arrange them however you like, see at a glance which agents are working, idle or waiting on you, and wire them together so one agent's result flows into the next.

![A real run: Planner, Builder and Reviewer Claude Code tiles handing off with Send →](docs/demo.gif)

- **Real terminals.** xterm.js on node-pty. Your agents, your shell, your dotfiles.
- **Live status.** A dot per tile: working, idle, or needs you (from Claude Code hooks), plus a desktop notification when an agent finishes or needs you while you're in another window.
- **Handoffs.** Drag a line from one tile to another. When the first agent finishes, **Send →** pastes its result plus your instruction into the next.
- **Workflows.** Start Plan → Build → Review, Build ↔ Review, Research → Write or Quick fix in one click, or save your own canvas as a workflow.
- **Worktrees.** Tick **Own git worktree** under More options and the tile runs on its own branch next to the repo, so parallel agents never edit the same checkout.
- **Remembers your layout** between launches, and Claude Code tiles pick up their conversation where they left off.
- **Nublet.** If you use the [Nublet](https://github.com/kaorii-ako/nublet) GNOME extension, your tiles show up in the top bar.

## Install

Download the AppImage from [Releases](https://github.com/kaorii-ako/tilework/releases), then:

```sh
chmod +x Tilework-*.AppImage && ./Tilework-*.AppImage
```

Linux x64. You need the agent CLIs you want to run (`claude`, `codex`, `gemini`) on your `PATH`.

## Dev setup (Bazzite / Fedora Atomic)

Runs directly on the host; no distrobox, sudo or rpm-ostree needed.

1. Node 22+ and npm 11 from Homebrew: `brew install node` (tested on Node 26).
2. Build tools for node-pty: `gcc`, `g++`, `make`, `python3` (present on Bazzite).
3. `npm install`. The `postinstall` downloads Electron's binary and rebuilds node-pty for Electron's ABI.
   npm 11 blocks install scripts by default; `package.json` already allows node-pty's via `allowScripts`.
4. `npm run dev`.

If node-pty fails to load after changing Node or Electron versions: `npx electron-builder install-app-deps`.

## Using it

Start an agent from the empty canvas, add a second with **+ New tile**, drag from the first tile's right edge onto the second to link them, and click **Send →** on the line when the first agent finishes. The label on the line is the instruction that goes with the handoff ("Review this for bugs"); click it to change it.

**Start a workflow** lays out a ready-made team in one go: Plan → Build → Review, Build ↔ Review, Research → Write, or Quick fix. Each tile runs `claude --model <x>` and every link starts as manual. **File → Save canvas as workflow…** saves your own to `~/.config/agent-canvas/workflows.json`. The **?** button in the bottom toolbar lists the rest.

## Claude Code hook

Live tile status and handoffs come from `hooks/agent-canvas-hook.sh`. If it isn't in `~/.claude/settings.json`, the app shows a banner on launch: **Install** copies the script to `~/.config/agent-canvas/hooks/`, backs up `settings.json.bak` and appends the hook entries, leaving every other setting and hook alone. To add it by hand instead, see [docs/STATUS-HOOKS.md](docs/STATUS-HOOKS.md).
On `Stop` the hook also forwards `transcript_path` from Claude Code's hook input. The app reads the last assistant message from that transcript (only for its own tiles, only under `~/.claude/`) and uses it as the tile's result for link handoffs.

## Scripts

| Script | What it does |
| -- | -- |
| `npm run dev` | Dev mode with hot reload (Wayland via `--ozone-platform-hint=auto`) |
| `npm run build` | Build main, preload and renderer into `out/` |
| `npm start` | Run the built app |
| `npm run dist` | Build the AppImage into `dist/`. `PACKAGED=1 npx playwright test packaged` then checks it opens a real shell. Pushing a `v*` tag builds it in CI and attaches it to a draft GitHub release |
| `npm test` | Unit tests (vitest) |
| `npm run e2e` | Build, then drive the real app with Playwright: create, drag, zoom, link, handoff, restart. Needs a desktop session (runs under X11/XWayland); uses a temporary home, so your own workspace is never touched, and opens its windows on workspace 2. `REAL_CLAUDE=1 npm run e2e -- real-claude` also runs two real Claude Code tiles (needs the hook installed) |
| `npm run typecheck` | `tsc --noEmit` over everything |

## License

[MIT](LICENSE)
