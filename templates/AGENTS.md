# Agent Rules

- Treat this repository as the source of truth for reusable skills and governance helpers.
- Update `docs/skill_list.md` whenever a skill is added, removed, renamed, or materially changed.
- Run `scripts/check-public-safety.sh` and `scripts/validate-skills.sh` before committing.
- Do not place project-private runtime state, credentials, cache files, workflow sessions, or machine-specific paths in reusable skills.
- After pushing skill changes, run `scripts/install.sh` on each machine that should receive them.
