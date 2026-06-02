---
name: ai-governed-risk-closeout
description: Use when Codex is asked to close, govern, repair, schedule, or automate known risks from a risk ledger without relying on human code review. Applies to single-run or timer-triggered AI risk closeout, known-risk-ledger.json, check-known-risk-closeout, multi-model review, gated auto-merge/publish, rollback evidence, worktree cleanup, and owner authorization for out-of-policy risks.
---

# AI Governed Risk Closeout

## Objective

Close already-known risks through an AI-governed, evidence-first workflow. Do not try to discover every unknown risk. Ensure every risk touched by the run has a durable terminal state or a clear policy/authorization stop.

## Required Inputs

Start by locating and reading:

1. `docs/governance/known-risk-ledger.json`
2. `docs/governance/AI_GOVERNED_RISK_CLOSEOUT_REQUIREMENTS.md`
3. `docs/governance/AI_GOVERNED_RISK_CLOSEOUT_PLAN.md`
4. `docs/governance/ai-governed-risk-closeout-policy.example.json` or the active policy file specified by the user
5. `docs/governance/ai-reviewer-verdict.schema.json`
6. `tools/check-known-risk-closeout.mjs`, `tools/risk-ledger.mjs`, `tools/known-risk-reviewer-prompt.mjs`, `tools/risk-closeout-recovery.mjs`, `tools/scan-risk-closeout-worktrees.mjs`, `tools/risk-closeout-orchestrator-contract.mjs`, and `tools/run-known-risk-closeout.mjs` when implementation details matter
7. `docs/governance/AI_GOVERNED_RISK_CLOSEOUT_SCHEDULING.md` when setting up timer-triggered runs

If the repository does not contain a known-risk ledger or gate, stop and ask to run the P0/P1 setup first.

## Hard Rules

- Work from an isolated task worktree before making repo edits.
- Acquire or implement a run-level lock before a scheduled unattended run mutates the ledger or repair branch.
- Do not mark a risk `fixed` based only on the repair agent's own explanation.
- Do not remove a risk from the ledger to make a gate pass.
- Do not downgrade severity or defer a risk without evidence and policy justification.
- Do not silently ignore newly discovered risks. Add them to the ledger with `source: "closeout-discovery"`.
- Do not ask the owner to review code details. Ask only for risk-policy or business authorization.
- Do not auto-merge or publish when policy forbids it, reviewers are inconclusive, or gates fail.
- Every future phase-level deliverable for this capability must receive a read-only DeepSeek review before merge or acceptance.
- Treat the scheduled dry-run entrypoint as preflight only; it does not repair, verify, merge, publish, or close selected risks.
- `tools/run-known-risk-closeout.mjs --write` must be rejected before reading the ledger, acquiring locks, creating branches, or touching worktrees until the write-mode orchestrator is explicitly implemented and DeepSeek-reviewed.
- Worker runs must not perform orchestrator-owned closeout actions such as merging to main, publishing, or asserting remote mainline consistency unless the project policy explicitly grants that role.

## Workflow

### 1. Establish Scope

Read the ledger and choose the run scope:

- User-specified risk ids, if provided.
- Otherwise select `open` and stale `in_progress` risks in severity order, bounded by the user's or policy's max risk count.
- Respect `depends_on`; process dependencies first.
- If dependency cycles exist, stop and run the known-risk gate.

State the selected risk ids before editing.

### 2. Prepare Isolation

Create or confirm an isolated task worktree. Keep canonical checkouts for reading, publishing baselines, and final verification only.

For unattended runs, ensure a lock exists before mutating the ledger. If no lock mechanism exists yet, implement the lock in the current phase before running unattended repair.

### 3. Repair

For each selected risk:

1. Set it to `in_progress` with a run id when the run has write capability.
2. Write an execution contract before dispatching repair: `granularity`, `decomposition`, `verification`, `owned_files`, forbidden files or actions, and rollback concern. Natural language can explain the contract but cannot replace the structured fields.
3. Restrict edits to `owned_files` unless a scope expansion is necessary.
4. If scope expansion is necessary, record the reason and require reviewer acceptance before closeout.
5. Add or update tests and gates that prove the risk is addressed.
6. Require a repair self-assessment before evidence collection: `on_track`, `evidence_sufficient`, `rerun_needed`, `scope_drift`, and `notes`. A missing self-assessment prevents `fixed` unless the main orchestrator independently reconstructs and records equivalent evidence.
7. If the risk is too large for the current bounded run, use `deferred` only with `deferred_until`, `deferral_reason`, `priority`, and future acceptance gates.
8. If external conditions block work, use `blocked` only with blocker, owner or external condition, recovery conditions, and last condition check.

### 4. Evidence

Run the risk's `acceptance_gates` plus the repository-level gates relevant to the touched files. Record:

- command
- exit code
- concise result
- artifact paths if any
- live verification for user-visible runtime changes

At minimum, run:

```bash
npm run check:known-risk-closeout
```

At final closeout, run:

```bash
npm run check:known-risk-closeout:required
```

This required mode is expected to fail until all risks in the ledger are terminal or the run is intentionally scoped to a subset using a future scoped gate.

### 5. Independent Review

Use at least one read-only skeptic reviewer for non-trivial code changes. Prefer `claude-deepseek-review` or another independent model. The reviewer should see the minimum task view needed to judge the risk: risk id, title, severity, owned files, relevant diff or file excerpts, executed gates, evidence, and output schema. Do not pass the full ledger, unrelated risks, full workflow state, or broad historical summaries unless the review scope explicitly requires them.

Blocking findings prevent `fixed`. Inconclusive reviews prevent unattended merge unless policy explicitly permits retry or owner authorization.

High-risk scopes listed by policy require two independent model reviewer passes.

When available, generate the reviewer task with:

```bash
node tools/run-with-node18.mjs tools/known-risk-reviewer-prompt.mjs --risk-id <risk-id>
```

Reviewer output must conform to `docs/governance/ai-reviewer-verdict.schema.json` before it is added to the ledger.

Before starting a scheduled run, inspect closeout worktrees with:

```bash
node tools/run-with-node18.mjs tools/scan-risk-closeout-worktrees.mjs
```

For a timer-safe dry run, use:

```bash
npm run run:known-risk-closeout -- --max-risks 2
```

This command can prove only that scheduling preflight completed. It cannot move a risk to `fixed`, merge, publish, or satisfy terminal closeout evidence until the P7 write-mode orchestrator contract exists.

The write-mode guard must be verified with:

```bash
node tools/run-with-node18.mjs tools/run-known-risk-closeout.mjs --write
```

Expected result: non-zero exit with `mode: "write_mode_rejected"` and no ledger, lock, branch, or worktree mutation.

### 6. Decide Terminal State

Use the ledger rules:

- `fixed`: commit + verification evidence + reviewer pass; live evidence if user-visible.
- `invalidated`: evidence proves the risk is not applicable or already resolved.
- `deferred`: bounded plan with deadline, priority, reason, and gates.
- `blocked`: blocker and recovery conditions are concrete.
- `requires_owner_authorization`: policy boundary exceeded; owner decision is about risk/business authorization, not code details.

### 7. Merge, Publish, and Rollback

Default to creating a governed repair branch and evidence. Auto-merge and auto-publish only when policy permits and every gate passes.

Separate closeout by execution role:

- Worker-level closeout: prove the repair branch or worktree gates pass, evidence is recorded, reviewer verdict is acceptable, and the worktree is clean. Workers do not merge, publish, or assert remote mainline consistency by default.
- Orchestrator-level closeout: merge, publish, remote mainline consistency checks, and production rollback decisions. Run this only from an authorized integration context, mainline context, or an explicit project policy flag.
- If a worker performs orchestrator-level actions without authorization, classify it as a process defect and require re-audit.

For user-visible runtime changes:

1. Publish or restart the actual served runtime.
2. Verify the actual served route in a browser or HTTP probe.
3. Record rollback commit or rollback procedure.
4. Roll back automatically on live failure when policy allows; otherwise mark blocked with recovery conditions.

### 8. Cleanup

After merge/publish decision:

- Preserve run artifacts and reviewer verdicts.
- Clean successful task worktrees.
- Preserve failed worktrees only when needed for evidence or recovery, and record their path.
- Release the run lock.

## Final Response Contract

End with a compact table:

| risk id | final status | commit | gates | reviewer | publish/live | notes |
| --- | --- | --- | --- | --- | --- | --- |

Also report:

- branch or commit pushed
- whether any policy authorization is required
- whether any new risks were added
- whether worktrees and locks were cleaned
