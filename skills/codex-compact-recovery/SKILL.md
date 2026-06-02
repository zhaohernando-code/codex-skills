---
name: codex-compact-recovery
description: 'Recover a Codex Desktop session after local context compaction failed and the thread became unusable. Use when the user mentions a stuck or unrecoverable Codex session, wants to continue work after seeing "Error running remote compact task: stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses/compact)", or needs a fresh session to inherit the last visible work from local Codex state.'
---

# Codex Compact Recovery

## Overview

Recover work from a Codex Desktop thread that became unusable after a remote compact failure. Do this by finding the affected local thread, extracting the last visible user intent, assistant progress, and recent command results, then generating a handoff prompt for a new session.

This skill does not revive the original server-side thread. It reconstructs the usable context from local `~/.codex` artifacts.

Treat every recovered thread as a partial handoff. Hidden reasoning, remote compact state, and any server-only context are not recoverable from local Codex files.

## Workflow

### 1. Find candidate stuck threads

Run:

```bash
python3 $CODEX_HOME/skills/codex-compact-recovery/scripts/recover_compact_session.py --list
```

This reads the latest local Codex `state_*.sqlite` database, follows each `rollout_path`, and finds threads whose rollout contains the known compact failure string.

By default, the script marks a thread as `stalled` when the last matching compact failure is not followed by any later assistant message in that rollout.

### 2. Generate the inheritance prompt

If the user does not specify a thread, use the most recent `stalled` candidate.

Run:

```bash
python3 $CODEX_HOME/skills/codex-compact-recovery/scripts/recover_compact_session.py
```

Or target a specific thread:

```bash
python3 $CODEX_HOME/skills/codex-compact-recovery/scripts/recover_compact_session.py --thread-id <thread-id>
```

The script emits a resume prompt that includes:

- thread id, title, cwd, and rollout path
- original and latest visible user request
- last assistant message before the compact failure
- recent command results before the failure
- a direct instruction for the next Codex session to continue from the last unfinished step

### 3. Continue in the new session

Use the generated prompt as the starting message in the fresh session. Then continue by inspecting repo state and any referenced files before making changes.

Treat the generated prompt as a handoff, not perfect memory. Repo state, working tree, and files on disk are still the source of truth.

Before doing substantive work in the new session, explicitly account for these risks:

- the previous assistant may have had reasoning that is not visible locally
- remote compact may have dropped intermediate plans or conclusions that never reached the rollout file
- the last visible assistant message may describe an intent, not a completed action
- the most recent command output may already be stale relative to the current workspace

## Decision Rules

- Prefer the most recent `stalled` thread unless the user names a different task or title.
- If several threads match, use the one whose `cwd` and title best match the current user request.
- If no `stalled` thread exists, use the latest matching compact-failure thread and say that it appears partially recovered rather than definitively stuck.
- If the rollout file is missing, skip the thread and continue with the next candidate.

## Limits

- Do not claim to restore hidden reasoning or server-only context. Local rollout files do not expose that.
- Do not mutate `~/.codex/state_*.sqlite`, `~/.codex/logs_*.sqlite`, or rollout files.
- Do not assume the last visible assistant message is the final intended answer. Check recent tool output and current workspace state.
- Do not present the inherited prompt as authoritative memory. Present it as best-effort reconstruction from local artifacts only.

## Script Notes

Main script:

- `$CODEX_HOME/skills/codex-compact-recovery/scripts/recover_compact_session.py`

Useful options:

- `--list`: show candidate threads only
- `--thread-id <id>`: target a specific thread
- `--limit <n>`: control how many recent threads are inspected
- `--json`: emit machine-readable output instead of Markdown
- `--include-archived`: include archived threads in the search

## Starter Prompt

When useful, begin with:

```text
Use $CODEX_HOME/skills/codex-compact-recovery/scripts/recover_compact_session.py to find the latest Codex Desktop session that became unusable after a compact failure. Generate the resume prompt for the best-matching stalled thread, then continue the task from that inherited context instead of starting from scratch.
```
