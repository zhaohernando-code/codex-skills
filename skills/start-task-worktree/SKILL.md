---
name: start-task-worktree
description: Prepare an isolated git task worktree before development or any code-changing work. Use when Codex is asked to implement, fix, refactor, generate project files, run mutation-producing scripts, install or update dependencies, or otherwise make repo edits in the shared Hernando workspace; also use when a task may affect multiple repos and each repo needs its own worktree before editing.
---

# Start Task Worktree

## Rule

Before the first write for a development task, create or confirm an isolated task worktree. Do not edit a canonical checkout under `~/codex/projects/*` or `$HOME/domain-temp-site` directly.

Canonical checkouts are for reading, integration, publish baselines, and final verification. Task worktrees are for implementation, experiments, generated files, dependency changes, tests that mutate the repo, and commits.

## Quick Start

When Codex App thread tools are available, use Codex-native worktrees instead of
the fallback script. A Codex-native worktree is bound to the thread environment,
so future commands stay in the correct checkout without relying on manual `cd`.

For the current conversation, fork the thread into a Codex worktree before any
repo write:

```text
call fork_thread with environment: { type: "worktree" }
```

After a successful worktree fork, stop work in the original thread and tell the
user to continue in the created worktree thread. If the tool returns a
`pendingWorktreeId`, emit the standard created-thread directive in the final
response:

```text
::created-thread{pendingWorktreeId="..."}
```

Only use `create_thread` when the user explicitly asks for a new/background
thread. In that case, call `list_projects`, choose the matching project, and
create the thread with:

```text
target: { type: "project", projectId: "...", environment: { type: "worktree" } }
```

Use the bundled script only when Codex-native thread tools are unavailable, such
as in a plain CLI session:

```bash
python3 $CODEX_HOME/skills/start-task-worktree/scripts/prepare_worktree.py --project <project-id> --slug <task-slug>
```

If the repo is not in `~/codex/WORKSPACE_INDEX.json`, pass an explicit repo path:

```bash
python3 $CODEX_HOME/skills/start-task-worktree/scripts/prepare_worktree.py --repo /absolute/path/to/repo --slug <task-slug>
```

After the fallback script succeeds, switch all implementation commands to the printed `worktree_path`. Tell the user which worktree and branch are being used before editing files.

## Workflow

1. Identify every repo that will be changed. For fuzzy project names in `~/codex`, read `~/codex/WORKSPACE_INDEX.json` or use the existing `init` skill first.
2. If Codex App thread tools are available and the current thread is not already
   in a Codex worktree, fork or create a Codex-native worktree thread as
   described above.
3. Use `prepare_worktree.py` only as a fallback when native thread tools are not
   available.
4. If the script reports that the current cwd is already an isolated task worktree, keep working there and do not create a nested worktree.
5. If the script reports dirty canonical state, stop before editing and surface the blocker. Do not "just make a small change" in main.
6. For multi-repo work, create all required worktrees first. Do not edit a newly discovered repo until its own worktree exists.
7. Run tests, commits, and task-local validation inside the task worktree. Leave canonical clean until the explicit merge/publish phase.

## Branch and Base Policy

The script fetches `origin` and creates task branches from a remote-tracking baseline, normally `origin/main`. It must not branch from local `main` when local `main` is dirty, ahead, or otherwise not a clean upstream baseline.

Use a branch name that describes the task:

```bash
python3 $CODEX_HOME/skills/start-task-worktree/scripts/prepare_worktree.py --project ai-control-platform --slug fix-worker-events --branch task/fix-worker-events
```

Only override the base ref when the user explicitly asks for a non-main target:

```bash
python3 $CODEX_HOME/skills/start-task-worktree/scripts/prepare_worktree.py --project ai-control-platform --slug release-fix --base origin/release
```

## Failure Handling

- Missing project: ask for or infer the exact repo, then rerun with `--repo`.
- Dirty canonical checkout: do not start implementation. Ask the owner to migrate, commit, stash, or otherwise reconcile that state.
- Existing branch or path: rerun with a more specific `--slug` or explicit `--branch`.
- Fetch failure: do not fall back to local `main`; report the network or remote issue.

## Closeout

This skill only establishes the implementation boundary. It does not replace project closeout, tests, live verification, publish, merge, or upstream push requirements.
