#!/usr/bin/env bash
# Install reusable git hooks into projects under a Codex workflow root.

set -euo pipefail

CODEX_ROOT="${CODEX_WORKFLOW_ROOT:-$HOME/codex}"
HOOKS_DIR="${CODEX_GIT_HOOKS_DIR:-$(cd "$(dirname "$0")/git-hooks" && pwd)}"

echo "Installing git hooks to codex projects..."

for project_dir in "$CODEX_ROOT"/projects/*/; do
  if [ -d "$project_dir/.git" ]; then
    project_name=$(basename "$project_dir")
    git_hooks_dir="$project_dir/.git/hooks"

    echo "  → $project_name"

    for hook in pre-commit pre-push post-merge; do
      if [ -f "$HOOKS_DIR/$hook" ]; then
        cp "$HOOKS_DIR/$hook" "$git_hooks_dir/$hook"
        chmod +x "$git_hooks_dir/$hook"
      fi
    done
  fi
done

echo "✅ Git hooks installed"
