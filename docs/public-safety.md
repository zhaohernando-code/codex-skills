# Public Safety

This repo is public. Treat every file as publishable text.

Do not commit:

- Local absolute paths for a specific maintainer home directory.
- Runtime state directories such as `.codex-system/`, workflow sessions, lock files, state databases, caches, or baseline archives.
- Private edge-auth helper implementations.
- GitHub, OpenAI, Anthropic, DeepSeek, or other provider credentials.
- Machine-local config readers that load private tokens from local control-plane state.

Allowed portable variables:

- `$HOME`
- `$CODEX_HOME`
- `$CODEX_WORKFLOW_ROOT`
- `$CODEX_SKILLS_REPO`
- `$DEEPSEEK_LAUNCHER`

Run before commit:

```bash
scripts/check-public-safety.sh
scripts/validate-skills.sh
```
