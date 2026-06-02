#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="${PLUGIN_DIR:-$HOME/.claude/plugins/local/codex-custom-skills}"

rsync -a --delete "$ROOT/claude-bridge/" "$PLUGIN_DIR/"
chmod +x "$PLUGIN_DIR/scripts/sync-codex-skills.sh"
"$PLUGIN_DIR/scripts/sync-codex-skills.sh"
