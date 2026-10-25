# Live agent status (Claude Code hooks)

Each tile's title bar shows one status dot (hover it for the name): blue for Working, green for Ready (`idle`), amber for Needs you, dim for Exited. Tiles that never report (shell, codex, gemini) keep a grey Shell dot.

## How it works

1. `PtyManager` sets `AGENT_CANVAS_TILE_ID=<id>` (and the main process sets `AGENT_CANVAS_STATUS_FILE`) in every PTY.
2. `hooks/agent-canvas-hook.sh <EventName>` appends `{"tile","event","ts"}` to that file. On `Stop` it also reads the hook's JSON input from stdin and adds `"transcript"` (Claude Code's `transcript_path`): `{"tile","event":"Stop","ts","transcript":"/home/you/.claude/projects/.../<session>.jsonl"}`. Paths containing quotes, backslashes or control characters are left out. Pure bash builtins, about 2 ms, silent no-op outside a tile.
3. Main tails the file (250 ms poll), maps events with `src/shared/status.ts`, and sends `agent:status` to the renderer.
4. On `Stop` with a transcript (KAO-33), main reads the end of that JSONL, takes the last assistant message's text (capped at 4,000 characters, keeping the end) and sends it as `agent:result`. It only does this for live tile ids, and only for `.jsonl` files that are under `~/.claude/` after resolving symlinks and `..`. The renderer stores it as the tile's last result, which link handoffs paste into the next tile.

| Event | State |
| -- | -- |
| SessionStart, Stop | idle |
| UserPromptSubmit, PreToolUse | working |
| Notification | needs you |
| SessionEnd | exited |

## Install

Easiest: click **Install** in the banner the app shows on launch when the hook is missing. It copies the script to `~/.config/agent-canvas/hooks/agent-canvas-hook.sh` (refreshed on every launch, so it follows app updates and survives moving the app), writes `~/.claude/settings.json.bak`, then appends one entry per event below and changes nothing else. Claude Code sessions that were already running pick it up after a restart.

By hand: merge this into `~/.claude/settings.json`. Each event holds an array, so append this entry next to your existing hooks; do not replace the array. Use an absolute path to the script.

```json
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "/path/to/agent-canvas/hooks/agent-canvas-hook.sh SessionStart" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "/path/to/agent-canvas/hooks/agent-canvas-hook.sh UserPromptSubmit" }] }],
    "PreToolUse":       [{ "hooks": [{ "type": "command", "command": "/path/to/agent-canvas/hooks/agent-canvas-hook.sh PreToolUse" }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "/path/to/agent-canvas/hooks/agent-canvas-hook.sh Notification" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "/path/to/agent-canvas/hooks/agent-canvas-hook.sh Stop" }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "/path/to/agent-canvas/hooks/agent-canvas-hook.sh SessionEnd" }] }]
  }
}
```

Hooks for the same event run in parallel, so this one coexists with the others. If an event already has a matcher group with `"hooks": [...]`, you can instead add the command object to that inner array.

Claude Code started outside Tilework has no `AGENT_CANVAS_TILE_ID`, so the hook exits immediately.

If you installed the hook before KAO-33, nothing changes in `settings.json`: the same `Stop` entry now forwards `transcript_path`. Just pull the new script.

## Handoffs (KAO-33)

When a linked tile's Claude Code stops with a new result, a **Send →** button appears on the line (manual links show nothing until then). Clicking it pastes `Handoff from <title>:` + the result + the link's instruction (the label on the line, e.g. "Review this for bugs"; the first Send asks for one if it's empty) into the target as one bracketed paste, without Enter. Right-click a link (or its chip) for **Send handoff** and **Auto-send**. Auto pastes and presses Enter on its own when the target is idle or a plain shell, and otherwise queues (the line's `Auto-send` chip shows `queued`) until it goes idle. An auto chain that sends more than 5 handoffs in 10 minutes without a keystroke is switched back to manual and marked `loop paused`. Nothing is ever pasted into a tile that has exited. Tiles without the hook (plain shells, codex, gemini) have no result, so Send is disabled with a tooltip.

## Resuming sessions (KAO-48)

On `SessionStart` the hook also forwards Claude Code's `session_id`. The app stores it on the tile (`sessionId` in workspace.json). On the next launch, a Claude tile starts with `--resume <id>` if that session's transcript is still somewhere under `~/.claude/projects/`. Otherwise it starts a fresh session. The id must match `[A-Za-z0-9-]{1,128}`, both in the hook and in main.

## Known limits

- `Notification` also fires for Claude's idle reminder, which shows as `needs you` until the next event.
- Status is not cleared if Claude Code is killed without a `SessionEnd`.
- Claude Code buffers transcript writes, so main waits 1 s after `Stop` before reading the transcript.
- The loop guard is global: any keystroke in any tile resets it, and parallel auto chains share the 5-per-10-minutes budget.

## Focus requests (Nublet)

Another local program can bring a tile into view by appending `{"tile":"<tileId>","event":"Focus"}` to the status file. If that tile is live, the app zooms to it at 100% and focuses it. The app doesn't raise its own window, because GNOME blocks focus stealing, so the caller raises it. The [Nublet](https://github.com/kaorii-ako/nublet) top-bar extension does this when you click a Claude session that runs in a tile.
