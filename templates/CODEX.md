# Codex Rules

- Personal skills are maintained in `skills/` first, then installed into `${CODEX_HOME:-$HOME/.codex}/skills`.
- System skills are not vendored here. Local system-skill changes are tracked as minimal patches under `patches/`.
- Claude Code visibility is handled through `claude-bridge/` and `scripts/sync-claude-bridge.sh`.
- Governance helpers under `governance/` are portable templates; project-specific gates remain in each project repository.
