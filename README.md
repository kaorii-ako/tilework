# Agent Canvas

A Linux desktop app where every coding agent (Claude Code, Codex, Gemini CLI, or a plain shell) runs in a real terminal tile on a pan-and-zoom canvas.
See at a glance which agents are working, idle, or waiting on you. Working name.

## Dev setup (Bazzite / Fedora Atomic)

Runs directly on the host; no distrobox, sudo or rpm-ostree needed.

1. Node 22+ and npm 11 from Homebrew: `brew install node` (tested on Node 26).
2. Build tools for node-pty: `gcc`, `g++`, `make`, `python3` (present on Bazzite).
3. `npm install`. The `postinstall` downloads Electron's binary and rebuilds node-pty for Electron's ABI.
   npm 11 blocks install scripts by default; `package.json` already allows node-pty's via `allowScripts`.
4. `npm run dev`.

If node-pty fails to load after changing Node or Electron versions: `npx electron-builder install-app-deps`.

## Claude Code hook

Live tile status and handoffs come from `hooks/agent-canvas-hook.sh`, which you add to `~/.claude/settings.json` by hand (the app never edits it). See [docs/STATUS-HOOKS.md](docs/STATUS-HOOKS.md) for the snippet.
On `Stop` the hook also forwards `transcript_path` from Claude Code's hook input. The app reads the last assistant message from that transcript (only for its own tiles, only under `~/.claude/`) and uses it as the tile's result for link handoffs.

## Scripts

| Script | What it does |
| -- | -- |
| `npm run dev` | Dev mode with hot reload (Wayland via `--ozone-platform-hint=auto`) |
| `npm run build` | Build main, preload and renderer into `out/` |
| `npm start` | Run the built app |
| `npm test` | Unit tests (vitest) |
| `npm run typecheck` | `tsc --noEmit` over everything |
