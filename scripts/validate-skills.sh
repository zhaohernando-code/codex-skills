#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
VALIDATOR="${SKILL_VALIDATOR:-$CODEX_HOME/skills/.system/skill-creator/scripts/quick_validate.py}"

cd "$ROOT"

if [[ ! -d skills ]]; then
  echo "[validate-skills] missing skills/ directory" >&2
  exit 1
fi

count=0
failed=0

while IFS= read -r -d '' skill_md; do
  skill_dir="$(dirname "$skill_md")"
  count=$((count + 1))

  if [[ -x "$VALIDATOR" || -f "$VALIDATOR" ]]; then
    if ! python3 "$VALIDATOR" "$skill_dir"; then
      echo "[validate-skills] failed: $skill_dir" >&2
      failed=$((failed + 1))
    fi
  else
    if ! python3 - "$skill_md" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
match = re.match(r"^---\n(.*?)\n---", text, re.S)
if not match:
    raise SystemExit(f"{path}: missing YAML frontmatter")
frontmatter = match.group(1)
for key in ("name:", "description:"):
    if key not in frontmatter:
        raise SystemExit(f"{path}: missing {key}")
name = ""
for line in frontmatter.splitlines():
    if line.startswith("name:"):
        name = line.split(":", 1)[1].strip().strip('"').strip("'")
if not re.fullmatch(r"[a-z0-9-]{1,64}", name):
    raise SystemExit(f"{path}: invalid skill name {name!r}")
PY
    then
      echo "[validate-skills] failed: $skill_dir" >&2
      failed=$((failed + 1))
    fi
  fi
done < <(find skills -mindepth 2 -maxdepth 2 -name SKILL.md -print0 | sort -z)

if (( count == 0 )); then
  echo "[validate-skills] no skills found" >&2
  exit 1
fi

if (( failed > 0 )); then
  echo "[validate-skills] failed=$failed total=$count" >&2
  exit 1
fi

echo "[validate-skills] ok total=$count validator=$([[ -f "$VALIDATOR" ]] && echo system || echo fallback)"
