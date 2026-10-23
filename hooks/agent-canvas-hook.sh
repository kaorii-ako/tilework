#!/usr/bin/env bash
# Agent Canvas status hook for Claude Code. Usage: agent-canvas-hook.sh <EventName>
# Appends one JSON line to the file the app tails. Pure bash builtins, no forks, exits silently if not in a tile.
[[ -n "$AGENT_CANVAS_TILE_ID" && "$AGENT_CANVAS_TILE_ID" =~ ^[A-Za-z0-9._-]+$ && "$1" =~ ^[A-Za-z]+$ ]] || exit 0
printf '{"tile":"%s","event":"%s","ts":%(%s)T}\n' "$AGENT_CANVAS_TILE_ID" "$1" -1 \
  >> "${AGENT_CANVAS_STATUS_FILE:-${XDG_RUNTIME_DIR:-/tmp}/agent-canvas-status.jsonl}" 2>/dev/null
exit 0
