#!/usr/bin/env bash
# Agent Canvas status hook for Claude Code. Usage: agent-canvas-hook.sh <EventName>
# Appends one JSON line to the file the app tails. Pure bash builtins, no forks, exits silently if not in a tile.
# On Stop it also forwards transcript_path from the hook's JSON input, so the app can hand off the result (KAO-33).
[[ -n "$AGENT_CANVAS_TILE_ID" && "$AGENT_CANVAS_TILE_ID" =~ ^[A-Za-z0-9._-]+$ && "$1" =~ ^[A-Za-z]+$ ]] || exit 0
extra=''
if [[ "$1" == SessionStart ]]; then
  # The session id lets the app resume this conversation after a restart (KAO-48).
  IFS= read -r -d '' -t 2 input
  re='"session_id"[[:space:]]*:[[:space:]]*"([A-Za-z0-9-]{1,128})"'
  [[ "$input" =~ $re ]] && extra=",\"session\":\"${BASH_REMATCH[1]}\""
elif [[ "$1" == Stop ]]; then
  IFS= read -r -d '' -t 2 input
  # Only plain paths: no quotes, backslashes or control characters, so it is safe to embed as a JSON string.
  re='"transcript_path"[[:space:]]*:[[:space:]]*"([^"\\[:cntrl:]]+)"'
  [[ "$input" =~ $re ]] && extra=",\"transcript\":\"${BASH_REMATCH[1]}\""
fi
printf '{"tile":"%s","event":"%s","ts":%(%s)T%s}\n' "$AGENT_CANVAS_TILE_ID" "$1" -1 "$extra" \
  >> "${AGENT_CANVAS_STATUS_FILE:-${XDG_RUNTIME_DIR:-/tmp}/agent-canvas-status.jsonl}" 2>/dev/null
exit 0
