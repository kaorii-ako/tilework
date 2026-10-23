# Live agent status (Claude Code hooks)

Each tile's title bar shows a dot and a label: `working`, `idle`, `needs you`, `exited`. Tiles that never report (shell, codex, gemini) show `shell` and no dot.

## How it works

1. `PtyManager` sets `AGENT_CANVAS_TILE_ID=<id>` (and the main process sets `AGENT_CANVAS_STATUS_FILE`) in every PTY.
2. `hooks/agent-canvas-hook.sh <EventName>` appends `{"tile","event","ts"}` to that file. Pure bash builtins, about 2 ms, silent no-op outside a tile.
3. Main tails the file (250 ms poll), maps events with `src/shared/status.ts`, and sends `agent:status` to the renderer.

| Event | State |
| -- | -- |
| SessionStart, Stop | idle |
| UserPromptSubmit, PreToolUse | working |
| Notification | needs you |
| SessionEnd | exited |

## Install

The app never touches your settings. Merge this into `~/.claude/settings.json` by hand. Each event holds an array, so append this entry next to your existing hooks (Coucou, herdr, ...); do not replace the array. Use the absolute path to your checkout.

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

Claude Code started outside Agent Canvas has no `AGENT_CANVAS_TILE_ID`, so the hook exits immediately.

## Known limits

- `Notification` also fires for Claude's idle reminder, which shows as `needs you` until the next event.
- Status is not cleared if Claude Code is killed without a `SessionEnd`.
