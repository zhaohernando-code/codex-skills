# Worktree / Branch / Scratch Reaper — Design

Status: DRAFT for review (not yet implemented)
Author: Claude (Opus 4.8), 2026-05-29
Scope: `~/codex` shared multi-agent workspace. Mechanism is agent-agnostic and runs
against any project repo plus the root governance repo.

## 1. Problem

Multi-agent task execution creates three kinds of disposable state, and nothing
destroys them after a task closes out. They accumulate without bound:

| Resource | Created by | Observed blow-up (ai-control-platform, 2026-05-29) |
|---|---|---|
| task/worker git branches | every task + every child agent | 199 local branches (197 reapable) |
| task worktrees under `worker-workspaces/<project>/` | each isolated task | dozens; two were stale-but-flagged by the guard |
| scratch dirs under `tmp/` | each test / scaffold run | 35,505 entries |

Root cause is structural, not incidental: **creation has an owner, destruction
has none.** Each agent reliably runs `git worktree add` / `branch` / `mkdtemp`,
but no step is responsible for tearing them down once their content is merged.

This is the same failure pattern as the broader audit root cause: state tracked
by a brittle key with no reconciliation to reality. Here the "key" is a branch /
worktree that long ago merged into `origin/main` but still sits on disk, so the
closeout guard keeps re-litigating already-published work (false "unmerged"
blockers — see the SHA-vs-tree fix and `isContainedBy`).

## 2. Goals / Non-goals

Goals:
- G1. Reclaim branches, worktrees, and scratch dirs whose work is provably done.
- G2. Be conservative and fail-safe: never delete anything that holds unpublished
  or uncommitted work. False negatives (leaving junk) are acceptable; false
  positives (deleting real work) are not.
- G3. Reuse the existing containment judgment (`isContainedBy` in
  `scripts/git-remote-state.js`) so reaping and the closeout guard agree on what
  "merged" means, and so the behavior is identical for codex and claude.
- G4. Be observable: every reap action is logged with the evidence that made it
  safe; every skip is logged with the reason it was kept.
- G5. Idempotent and re-runnable; safe to run repeatedly and concurrently-ish.

Non-goals:
- N1. Not a general GC of arbitrary user files. Only the three resource classes.
- N2. Not responsible for pushing/merging unfinished work — it only reclaims work
  that is ALREADY merged. Unmerged work is reported, never resolved, never deleted.
- N3. Not changing how worktrees/branches are CREATED (that contract stays).

## 3. Safety predicate (the only thing that authorizes a delete)

> REVISED after independent review (deepseek-v4-pro + opus-4.8). Key correction:
> the closeout guard's `isContainedBy` is tuned so a false "merged" verdict is
> SAFE (it only unblocks a Stop). The reaper inverts the cost — a false "merged"
> verdict DELETES. So the reaper must NOT reuse the lenient tree-equality branch
> for its destructive decision. It uses strict DAG ancestry only.

A branch is **reapable** only if ALL hold:
- R1. It is not a protected ref: not `main`, not the repo's default branch, not
  `HEAD`, not currently checked out in ANY worktree.
- R2. Its tip is a strict DAG ancestor of the pinned mainline baseline —
  `isAncestor(repo, branchTip, originDefault)` is true (equivalently `git branch
  --merged origin/<default>`). The baseline is `refs/remotes/origin/<default>`
  resolved via `origin/HEAD` and freshly fetched — NOT the ambient `@{upstream}`
  of whatever the canonical checkout happens to have checked out (that can be a
  feature branch / detached HEAD and would judge against the wrong baseline).
  Ancestry guarantees every commit on the branch is already in origin, so §9's
  "recreate with `git branch <name> <sha>`" is actually true.
- R2-report-only. A branch whose tip is tree-equal to the baseline tip but is NOT
  an ancestor (amend/squash that never got pushed under this sha, OR a divergent
  line that coincidentally converged, OR a revert-to-known-tree) is NEVER
  auto-deleted. It is REPORTED as "tree-equal, not ancestor — distinct commits
  exist only here" so a human can reconcile. Deleting it would orphan unique
  commits whose shas are not in origin (recoverable only from reflog, which B1's
  removal of `--prune=now` now preserves, but still not a safe auto-action).
- R3. It matches a reapable name pattern (see §4). Hand-named long-lived branches
  are never auto-reaped without an explicit allowlist.

A worktree is **reapable** only if ALL hold:
- W1. It lives under `worker-workspaces/` (the disposable-task root). Canonical
  checkouts (`projects/<id>`, repo roots) are NEVER reaped.
- W2. Its working tree is clean — no uncommitted/untracked changes (`git status
  --porcelain --ignore-submodules=none` empty) AND `git stash list` for it is
  empty AND it is not in a detached-HEAD-with-unique-commits state. A dirty,
  stashed, or detached worktree is ALWAYS kept, regardless of merge state.
- W3. Its checked-out branch is reapable per R1–R3 (i.e. its committed work is
  already published).
- W4. No live process is using it (see §6 liveness check).
- W5. It is not the reaper's OWN worktree (or an ancestor of the reaper's cwd).
  The reaper must exclude the worktree it is running from, and never pass
  `--force` (so git's own refusal to remove the current/dirty/locked worktree is
  the final backstop).

A scratch dir under `tmp/` is **reapable** only if:
- S1. It is provably gitignored — verified PER PATH with `git check-ignore`, not
  assumed from "it's under tmp/". Never `rm -rf` a path that isn't provably
  ignored, and never one that is a registered worktree or contains a `.git`.
- S2. Its NEWEST-mtime-within (not just the top dir's mtime) is older than a
  configurable TTL (default 1h for test tmpdirs; a longer override for scaffold
  outputs meant for post-run inspection). A deep tree being actively written must
  not be reaped because its parent dir mtime looks old.
- S3. It is not currently open by a live process (lsof best-effort) and holds no
  task lock (see §6).
- S4. ROOT FIX (preferred over reaping): scratch creation should use `mktemp -d`
  plus an EXIT trap so the steady state never reaches 35k entries. The reaper is
  then only a backstop for crashed runs, not the primary cleanup.

ANY ambiguity (cannot determine upstream, cannot stat, git command fails) →
treat as NOT reapable. Fail closed.

## 4. Reapable name patterns

Auto-reap (when §3 holds): ONLY `task/**` and `worker/**` — the prefixes actually
emitted by the task/worktree creation machinery (confirmed against the observed
199-branch listing). These are machine-generated, per-task, expected to be
ephemeral.

`fix/**` is explicitly NOT auto-reaped: "fix" is one of the most common HUMAN
branch prefixes (`fix/login-timeout`), and a developer may keep a merged fix
branch locally for reference. Reaping it by name would surprise the operator.
Any non-`task/`/`worker/` prefix is reaped only via an explicit configured
allowlist, never by default.

Never auto-reap (keep unless explicitly listed): `main`, default branch, release
branches, and any branch not matching a generated prefix. A human-named branch
like `routing-fix` is kept by default — it gets reaped only if it both matches an
allowlist AND satisfies R2 (already-published).

## 5. Tool: `scripts/reap-merged-worktrees.js`

A standalone Node script (no deps beyond what the guard already uses), importing
`isContainedBy` / `gitRemoteSyncState` helpers from `scripts/git-remote-state.js`
so the merge judgment is shared with the closeout guard (G3).

Modes:
- `--dry-run` (DEFAULT): print what WOULD be reaped and why, plus what was kept and
  why. Deletes nothing. This is the default so an accidental run is harmless.
- `--apply`: actually reap. Requires `--force` the FIRST time it is run on a
  machine (a one-time "I have reviewed this" gate); thereafter `--apply` runs
  fully. (This replaces the count-based N-cap from Q4 — a count cap is theatre: if
  the predicate is right, reaping 200 is safe; if it's wrong, reaping 1 is not.
  The real interlock is correctness + the run lock below, not a number.)
- `--scope branches|worktrees|scratch|sessions|all` (default `all`).
- `--project <id>` to limit to one repo; otherwise iterates every repo in
  `WORKSPACE_INDEX.json` plus the root governance repo.
- `--age-hours N` for scratch TTL (default 1).
- `--json` to emit a machine-readable report (for the dashboard / audits).

The reaper takes the existing `LOCK_DIR` (.codex-system/locks, currently defined
but unused in the guard) flock for its whole run, so two reaper runs and (where
feasible) task-creation serialize. It NEVER passes `--force` to git
`worktree remove` / `branch -D`; git's own refusal (checked-out, dirty, locked,
not-fully-merged) is the final safety net.

Order of operations per repo:
1. Resolve baseline: `git fetch origin` (read-only), then pin
   `refs/remotes/origin/<default>` via `origin/HEAD`. Judge everything against
   this, not `@{upstream}`.
2. Enumerate worktrees → reap clean+published ones (`git worktree remove`, no
   `--force`), excluding the reaper's own worktree (W5).
3. RE-enumerate worktrees (state changed), then reap published generated branches.
   Try `git branch -d` (safe, refuses if checked-out anywhere or not merged)
   before `-D`; only force-delete a branch confirmed not checked out and merged.
4. `git worktree prune` to reclaim admin files. NO `git gc --prune=now` — it
   operates on the shared object store across all linked worktrees and can drop
   in-flight objects from concurrent tasks AND erase the reflog that §9 relies on
   for recovery. Leave object GC to git's safe defaults (`gc.pruneExpire`).
5. Scratch dirs: `git check-ignore` per path + newest-mtime TTL + liveness, then
   `rm -rf` only the provably-safe ones.
6. Session JSON (4th class): `.codex-system/workflow-sessions/*.json` also grow
   unbounded. TTL-reap ended sessions older than the threshold. (These are also
   why liveness CANNOT be based on session JSON — see §6.)

All git writes run with cwd OUTSIDE the canonical checkout (or via `git -C`) so
the workflow guard's canonical-mutation block does not fire — branch/worktree
deletion is not a content mutation of the canonical tree. This was confirmed
during the manual 199→2 cleanup.

## 6. Liveness check (avoid reaping in-flight work)

A worktree/scratch dir may belong to a task running RIGHT NOW. Liveness must NOT
be based on `.codex-system/workflow-sessions/*.json`: those files are written per
session and never pruned (the 4th unbounded class), and the schema carries no PID
and no reliable "active" flag — a session's last-recorded `cwd` may have moved
after the task finished. Honoring every path ever recorded would keep worktrees
forever (reaper becomes a no-op); honoring none races live tasks. Session JSON is
therefore a poor liveness signal in both directions.

Instead, liveness is a positive lock signal:
- L1. Each running task holds a PID-stamped flock lockfile under `LOCK_DIR` naming
  its worktree root (set at task start, released on exit; stale locks whose PID is
  dead are ignored). The reaper keeps any worktree with a live lock. This requires
  a small addition to task startup to write the lock — until that exists, the
  reaper treats "no lock infrastructure" as "cannot prove dead" and falls back to
  L2+L3 conservatively.
- L2. Best-effort `lsof`/open-handle check on the directory; if anything holds it
  open, keep it.
- L3. An mtime guard: a worktree touched within the last N minutes (default 30) is
  kept even if it looks published, to avoid racing a just-finished task whose
  merge/cleanup is still settling. This also covers the TOCTOU window between the
  liveness check and the delete (combined with: never `--force`, so git refuses a
  worktree that became dirty/locked in that window).

If liveness cannot be determined, keep (fail closed).

## 7. Architecture: shift destruction left; reaper is only a backstop

Both reviewers independently made the deepest point: a standalone reaper that
scans later and INFERS published-ness re-creates the very "brittle key, reconcile
against reality" pattern the audit flagged. The robust fix is to destroy at the
moment published-ness is GROUND TRUTH, not inferred later.

Primary mechanism (preferred) — destroy at closeout:
- The closeout already pushes the task branch (agent-workflow-guard.js
  `attemptAutoCloseout`, ~line 540). The moment to delete the local task branch +
  worktree is right after that push to ORIGIN is CONFIRMED succeeded — there it is
  certain the work is published, with no tree-equality guessing and no baseline
  ambiguity. CRITICAL: gate on origin confirmation, NOT local-main containment —
  `attemptAutoCloseout` currently continues even when the push FAILS (records an
  issue, lines ~540-545), so "local main has it" does NOT mean "published."
- Stop keeping per-task LOCAL branches as durable state at all. After a confirmed
  push, the commit lives on origin; the local branch is pure debt. Push + delete
  removes ~197/199 of the observed blow-up at the source, with zero inference.

Backstop mechanism — the standalone reaper:
- Narrows to an ORPHAN SWEEPER for crashed/abandoned tasks only: TTL over
  `worker-workspaces/` entries that are clean AND whose branch tip is a STRICT
  ANCESTOR of `origin/<default>` AND hold no live lock. No tree-equality, no
  `--prune=now`, no guard integration. Materially less code, strictly safer.
- Runs manually (`--dry-run` default) or on a low-frequency schedule
  (cron/launchd), emitting a JSON report.

NOT doing — auto-reap inside the Stop gate (rejected, was "Phase 2"):
- The Stop gate fires on a natural-language completion-claim regex
  (`COMPLETION_RE`). Wiring a filesystem delete to a model SAYING "done/完成" is
  unsafe. Stop also fires while the agent's cwd may BE the worktree, and re-fires
  on SubagentStop/retries — deleting the cwd out from under a live/looping process
  is chaotic and not idempotent. A mutation in a decision gate also has no
  transactional rollback (worktree removed but `branch -D` fails → half state),
  and a bug in that path would block legitimate completions for BOTH codex and
  claude (self-DoS). Destruction stays OUT of the guard. The guard may at most
  enqueue a candidate path for the separate, lock-holding reaper to consume.

## 8. Testing strategy (real behavior, not tautology)

Built as `scripts/reap-merged-worktrees.test.js` (node:test), each test creating a
throwaway repo + worktrees in a tmpdir, exercising REAL git, asserting on outcomes:
- T1. A branch whose tip is a strict ancestor of origin/<default> → reaped.
- T2a. A branch tree-equal to the baseline tip AND an ancestor (amend already
  pushed) → reaped.
- T2b. A branch tree-equal to the baseline tip but NOT an ancestor (divergent
  history that converged, or a revert-to-known-tree, with distinct local commits)
  → KEPT and REPORTED as "tree-equal, not ancestor". Write T2b FIRST, watch the
  naive isContainedBy-based impl wrongly reap it, then implement the ancestor-only
  gate so it passes. This is the central safety regression test.
- T3. A branch with one unpublished commit → KEPT; reported as unmerged.
- T4. A worktree with uncommitted changes on a fully-merged branch → KEPT (W2).
- T4b. A worktree whose branch is merged but that has a `git stash` entry → KEPT.
- T5. A worktree holding a live PID lock → KEPT (L1); a worktree whose only signal
  is a stale session JSON → NOT kept on that basis alone (session JSON is not a
  liveness signal).
- T6. Canonical checkout / `main` / the reaper's own worktree → never reaped
  (R1, W1, W5).
- T7. `--dry-run` deletes nothing but reports the same classification as `--apply`.
- T8. Scratch dir older than TTL → reaped; newer → kept; a path NOT provably
  gitignored per `git check-ignore` → never touched (S1).
- T9. Idempotent: a second run is a no-op.
Wire into `check-workflow-closeout.js` so the reaper's safety predicate is itself
regression-guarded.

## 9. Rollback / blast-radius

- Default `--dry-run` means the dangerous mode is opt-in.
- Deleting a merged branch is recoverable: its commit is in origin/main history;
  re-create with `git branch <name> <sha>` if ever needed. We deliberately do NOT
  keep separate patch files — those become their own un-closed debt.
- Deleting a clean, published worktree loses nothing (working tree == HEAD ==
  published content).
- The only irreversible case the predicate allows is scratch dirs (S1–S3), which
  are gitignored, TTL'd temp data by definition.
- Unpublished/dirty state is never touched, so the worst realistic failure is
  leaving junk behind (acceptable), not destroying work.

## 10. Open questions — resolved after review

- Q1. Scratch TTL → default 1h (test tmpdirs are worthless once the run ends);
  longer override for scaffold outputs meant for inspection. RESOLVED.
- Q2. Phase-1 scheduling → documented manual command + optional launchd. RESOLVED.
- Q3. The 9 currently-unpublished worker/child branches stay out of scope — the
  reaper keeps and reports them; salvage is a separate human decision. UNCHANGED.
- Q4. Count-based N-cap → REPLACED with a one-time `--force` gate on first
  `--apply` + a run lock (a count cap is friction, not safety). RESOLVED.

## 11. Review incorporation log (deepseek-v4-pro + opus-4.8, 2026-05-29)

Two independent reviewers were spawned via `manual_agent_cli` to critique this
plan; the main process verified each code-level claim against the source before
accepting. Verified facts: `isContainedBy`/`treeOf` is tip-vs-tip (NOT a history
walk) — so the original R2 prose overstated the code and the tree path is wrong
for deletion; `upstreamRef` resolves `@{upstream}` (not pinned origin/default);
`LOCK_DIR` is defined but unused; `attemptAutoCloseout` continues even when the
push to origin fails.

ACCEPTED (both reviewers, code-verified): drop `git gc --prune=now` (B1);
ancestor-only deletes, tree-equality is report-only (B2/B3); keep destruction out
of the Stop gate (former Phase 2); pin baseline to `origin/<default>` (B4);
PID/flock liveness + session-JSON is a 4th reaped class, not a liveness signal
(B5); forbid `--force` + take the run lock (B6); check `git stash` (B7) and
`git check-ignore` per path (B8); drop `fix/**` from auto-reap; shift destruction
left to confirmed-push at closeout + stop keeping local task branches.

ACCEPTED with my adjustment: the N-cap interlock is theatre → replaced with a
one-time `--force` gate (kept the spirit, dropped the count). Scratch TTL → 1h.

NOTED as gap, deferred: remote `origin/task/*` branch accumulation (DS-M9) — out
of scope here; to be handled at the remote (e.g. GitHub auto-delete-on-merge) or
a separate step. Fetch/push race making the reaper non-idempotent under concurrent
pushes (DS-M5) — accepted as inherent, safe (false-negative), documented.
