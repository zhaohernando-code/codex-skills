# codex-skills

Public source of truth for reusable Codex skills, Claude Code bridge sync, and portable governance helpers.

## Install

```bash
git clone https://github.com/zhaohernando-code/codex-skills.git
cd codex-skills
scripts/install.sh
```

The installer copies `skills/` into `${CODEX_HOME:-$HOME/.codex}/skills`, installs the local Claude bridge, syncs Claude-visible skill links, validates skills, and applies the local `skill-creator` governance patch.

## Maintain

Create or update personal skills in this repository first:

1. Edit `skills/<skill-name>/`.
2. Update `docs/skill_list.md`.
3. Run `scripts/validate-skills.sh`.
4. Run `scripts/check-public-safety.sh`.
5. Commit and push `main`.
6. Run `scripts/install.sh` to sync local Codex and Claude Code surfaces.

`scripts/sync-from-local.sh` is a maintainer helper for importing local personal skills into the repo. It does not commit.
