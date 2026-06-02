#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
LOCAL_SKILL_LIST="${LOCAL_SKILL_LIST:-$HOME/skill_list.md}"

cd "$ROOT"

if [[ ! -d "$CODEX_HOME/skills" ]]; then
  echo "[sync-from-local] missing Codex skills dir: $CODEX_HOME/skills" >&2
  exit 1
fi

rsync -a --delete \
  --exclude '.system' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  "$CODEX_HOME/skills/" "$ROOT/skills/"

if [[ -f "$LOCAL_SKILL_LIST" ]]; then
  mkdir -p "$ROOT/docs"
  cp "$LOCAL_SKILL_LIST" "$ROOT/docs/skill_list.md"
fi

"$ROOT/scripts/check-public-safety.sh"
"$ROOT/scripts/validate-skills.sh"

echo "[sync-from-local] imported local skills into repo. Review git diff before commit."
