#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

failures=()
LOCAL_ABS_PATTERN="/Users/"'hernando_zhao'
GITHUB_TOKEN_PATTERN='ghp''_[A-Za-z0-9_]{20,}'
GITHUB_PAT_PATTERN='github''_pat_[A-Za-z0-9_]{20,}'
OPENAI_KEY_PATTERN='sk''-[A-Za-z0-9]{20,}'
BEARER_PATTERN='Bear''er[[:space:]]+[A-Za-z0-9._~+/=-]{12,}'

add_failure() {
  failures+=("$1")
}

is_text_file() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  if file "$file" | grep -qiE 'text|json|yaml|python|shell|javascript|markdown|svg|xml'; then
    return 0
  fi
  case "$file" in
    *.md|*.txt|*.json|*.yaml|*.yml|*.sh|*.js|*.mjs|*.cjs|*.py|*.toml|*.ini|*.xml|*.svg) return 0 ;;
  esac
  return 1
}

while IFS= read -r -d '' file; do
  rel="${file#./}"
  case "$rel" in
    .git/*|node_modules/*|tmp/*|dist/*|build/*|*/__pycache__/*|*.pyc) continue ;;
  esac

  case "$rel" in
    .codex-system/*|*/.codex-system/*|workflow-sessions/*|*/workflow-sessions/*|baselines/*|*/baselines/*|*.db|*.db-*|*.sqlite|*.sqlite-*|*.tar.gz)
      add_failure "$rel: state/cache/archive file is not allowed in the public repo"
      continue
      ;;
  esac

  if [[ "$(basename "$rel")" == "edge-agent-auth-token.sh" ]]; then
    add_failure "$rel: private edge auth helper implementation is not allowed"
    continue
  fi

  is_text_file "$file" || continue

  if grep -nF "$LOCAL_ABS_PATTERN" "$file" >/tmp/codex-skills-safety-hit.$$ 2>/dev/null; then
    add_failure "$rel: contains local absolute path for the maintainer home directory"
  fi

  if grep -nE 'HZ_DEV_AUTH_BYPASS_[A-Z]+' "$file" >/tmp/codex-skills-safety-hit.$$ 2>/dev/null; then
    add_failure "$rel: contains private edge auth bypass variable name"
  fi

  if grep -nE "$GITHUB_TOKEN_PATTERN|$GITHUB_PAT_PATTERN|$OPENAI_KEY_PATTERN|$BEARER_PATTERN" "$file" >/tmp/codex-skills-safety-hit.$$ 2>/dev/null; then
    add_failure "$rel: contains token-like secret material"
  fi

  if grep -nE '(^|[^A-Z0-9_])(API_KEY|TOKEN|SECRET|PASSWORD|AUTH_TOKEN|ACCESS_TOKEN)[A-Z0-9_]*[[:space:]]*[:=][[:space:]]*['"'"'"]?[^$<>{}[:space:]'"'"'"]' "$file" >/tmp/codex-skills-safety-hit.$$ 2>/dev/null; then
    add_failure "$rel: contains sensitive variable assignment"
  fi
done < <(find . -type f -print0)

rm -f /tmp/codex-skills-safety-hit.$$

if (( ${#failures[@]} > 0 )); then
  printf '[public-safety] blocked %d issue(s):\n' "${#failures[@]}" >&2
  for failure in "${failures[@]}"; do
    printf '  - %s\n' "$failure" >&2
  done
  exit 1
fi

echo "[public-safety] ok"
