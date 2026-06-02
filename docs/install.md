# Install

## First Install

```bash
git clone https://github.com/zhaohernando-code/codex-skills.git
cd codex-skills
scripts/install.sh
```

Environment variables:

- `CODEX_HOME`: Codex config root. Defaults to `$HOME/.codex`.
- `CODEX_SKILLS_REPO`: optional pointer to this repository for agents and shell profiles.
- `CODEX_WORKFLOW_ROOT`: workflow governance root. Defaults to `$HOME/codex` in portable scripts.
- `DEEPSEEK_LAUNCHER`: Claude+DeepSeek launcher path for `claude-deepseek-review`.

## Dry Run

```bash
scripts/install.sh --dry-run
```

The dry run checks public safety and skill validity, then reports the local targets without mutating them.

## Maintenance Import

```bash
scripts/sync-from-local.sh
git diff
scripts/check-public-safety.sh
scripts/validate-skills.sh
git commit -am "Update skills"
git push origin main
scripts/install.sh
```

`sync-from-local.sh` is intentionally not a commit tool. Review the diff before publishing because local skills may contain private paths or machine-specific guidance.
