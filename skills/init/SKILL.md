---
name: init
description: Use when the user gives a fuzzy project hint inside `~/codex`, such as `新中台`, `股票看板`, `聊天项目`, `LobeChat`, or similar shorthand, and Codex should quickly route to the right project, identify the canonical docs to read first, and avoid broad workspace search.
---

# Init

Use this skill to resolve fuzzy project names in `~/codex` without scanning the whole workspace first.

## Workflow

1. Read `~/codex/WORKSPACE_INDEX.json`.
2. Run `python3 scripts/resolve_project.py "<user hint>"`.
3. Use the top match from the resolver as the default target.
4. Read the returned `canonical_docs` in order.
5. Only inspect `runtime/*` or `.codex-system/*` when the resolver says they are relevant.
6. Only if the resolver returns `needs_fallback_search=true` should you do any targeted `rg`, and that search should stay inside the top candidate repo paths instead of the whole workspace.

## Output

When this skill triggers, report:

- most likely project
- why it matched
- which files to read first
- whether runtime inspection is needed
- whether `.codex-system` inspection is needed

## Hard rule

Prefer `WORKSPACE_INDEX.json` and canonical docs first. Do not start with a global search across `~/codex`.
