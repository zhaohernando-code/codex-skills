#!/usr/bin/env bash
set -euo pipefail

CODEX_SKILLS_DIR="${CODEX_SKILLS_DIR:-$HOME/.codex/skills}"
PLUGIN_DIR="${PLUGIN_DIR:-$HOME/.claude/plugins/local/codex-custom-skills}"
CLAUDE_SKILLS_DIR="$PLUGIN_DIR/skills"

mkdir -p "$CLAUDE_SKILLS_DIR"

if [[ ! -d "$CODEX_SKILLS_DIR" ]]; then
  echo "[sync-codex-skills] missing Codex skills dir: $CODEX_SKILLS_DIR" >&2
  exit 1
fi

find "$CLAUDE_SKILLS_DIR" -mindepth 1 -maxdepth 1 -type l | while IFS= read -r link; do
  target="$(readlink "$link" || true)"
  if [[ "$target" == "$CODEX_SKILLS_DIR/"* && ! -e "$target/SKILL.md" ]]; then
    rm -f "$link"
  fi
done

count=0
skipped=0
while IFS= read -r skill_file; do
  skill_dir="$(dirname "$skill_file")"
  skill_name="$(basename "$skill_dir")"

  case "$skill_name" in
    .*|"")
      continue
      ;;
  esac

  dest="$CLAUDE_SKILLS_DIR/$skill_name"
  if [[ -e "$dest" && ! -L "$dest" ]]; then
    echo "[sync-codex-skills] skip non-symlink destination: $dest" >&2
    skipped=$((skipped + 1))
    continue
  fi

  ln -sfn "$skill_dir" "$dest"
  count=$((count + 1))
done < <(find "$CODEX_SKILLS_DIR" -mindepth 2 -maxdepth 2 -name SKILL.md -not -path "$CODEX_SKILLS_DIR/.system/*" | sort)

echo "[sync-codex-skills] synced=$count skipped=$skipped plugin=$PLUGIN_DIR"
