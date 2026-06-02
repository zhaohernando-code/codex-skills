#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
DRY_RUN=0
ALLOW_DIRTY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    *)
      echo "[install] unknown argument: $1" >&2
      exit 2
      ;;
  esac
  shift
done

cd "$ROOT"

commit="unknown"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  commit="$(git rev-parse --short HEAD)"
  if [[ "$ALLOW_DIRTY" != "1" && -n "$(git status --short)" ]]; then
    echo "[install] repo has uncommitted changes; commit first or pass --allow-dirty" >&2
    git status --short >&2
    exit 1
  fi
fi

"$ROOT/scripts/check-public-safety.sh"
"$ROOT/scripts/validate-skills.sh"

echo "[install] repo=$ROOT commit=$commit dry_run=$DRY_RUN"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[install] would sync skills/ -> $CODEX_HOME/skills"
  echo "[install] would sync Claude bridge -> $HOME/.claude/plugins/local/codex-custom-skills"
  echo "[install] would apply patches/skill-creator-governance.patch"
  exit 0
fi

mkdir -p "$CODEX_HOME/skills"
rsync -a --delete \
  --exclude '.system' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  "$ROOT/skills/" "$CODEX_HOME/skills/"

"$ROOT/scripts/sync-claude-bridge.sh"

skill_creator="$CODEX_HOME/skills/.system/skill-creator/SKILL.md"
patch_file="$ROOT/patches/skill-creator-governance.patch"
marker="Hernando codex-skills Source Workflow"

if [[ ! -f "$skill_creator" ]]; then
  echo "[install] missing system skill-creator at $skill_creator" >&2
  exit 1
fi

if grep -q "$marker" "$skill_creator"; then
  echo "[install] skill-creator patch already present"
else
  if ! patch --forward "$skill_creator" "$patch_file"; then
    echo "[install] failed to apply $patch_file to $skill_creator" >&2
    echo "[install] inspect upstream skill-creator changes and refresh the patch before claiming sync complete" >&2
    exit 1
  fi
fi

"$ROOT/scripts/validate-skills.sh"

synced_count="$(find "$CODEX_HOME/skills" -mindepth 2 -maxdepth 2 -name SKILL.md -not -path "$CODEX_HOME/skills/.system/*" | wc -l | tr -d ' ')"
echo "[install] complete commit=$commit synced_skills=$synced_count codex_home=$CODEX_HOME"
