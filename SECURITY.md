# Security

This is a public repository. Do not commit credentials, private runtime state, local state databases, workflow sessions, baseline archives, or private edge-auth helper implementations.

Before every commit, run:

```bash
scripts/check-public-safety.sh
```

If the check blocks a file, either remove the file from the public repo or parameterize the content with environment variables such as `$HOME`, `$CODEX_HOME`, `$CODEX_WORKFLOW_ROOT`, `$CODEX_SKILLS_REPO`, or `$DEEPSEEK_LAUNCHER`.
