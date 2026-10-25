#!/bin/sh
# Stands in for Claude Code in e2e: waits until ~/.claude/settings.json has the Tilework hook,
# then fires it the way Claude Code would (command from settings.json, hook JSON on stdin).
settings="$HOME/.claude/settings.json"
hook() { # $1 = event, stdin = hook input
  cmd=$(grep -o "'[^']*agent-canvas-hook\.sh' $1" "$settings" | head -n 1)
  [ -n "$cmd" ] && eval "$cmd"
}
echo "fake claude: waiting for the hook"
i=0
until grep -q agent-canvas-hook "$settings" 2>/dev/null; do i=$((i + 1)); [ $i -gt 300 ] && exit 1; sleep 0.2; done
echo '{"session_id":"e2e-session-1"}' | hook SessionStart
echo '{}' | hook UserPromptSubmit
sleep 1
transcript="$HOME/.claude/projects/e2e/session.jsonl"
mkdir -p "$(dirname "$transcript")"
printf '%s\n' '{"type":"assistant","message":{"id":"m1","content":[{"type":"text","text":"REAL-HOOK-RESULT"}]}}' > "$transcript"
printf '{"hook_event_name":"Stop","transcript_path":"%s"}' "$transcript" | hook Stop
echo "fake claude: done"
exec sleep 600
