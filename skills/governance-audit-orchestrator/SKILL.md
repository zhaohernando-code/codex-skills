---
name: governance-audit-orchestrator
description: Use this skill when the user asks for self-governance, watchdog review, third-party code-level audit, multi-dimensional project audit, or validation that existing development flows can find, repair, and escalate issues without trusting prior summaries.
---

# Governance Audit Orchestrator

## Purpose

Run a distrustful, code-level governance audit. Do not treat project summaries, prior reports, status files, or agent claims as facts. They are leads only. Findings must be supported by current code, diffs, commands, logs, screenshots, runtime behavior, or reproducible user paths.

## Project-Agnostic Boundary

Treat the target project, product, modules, entrypoints, tools, and runtime as inputs discovered from the current request and repository. Do not hardcode or inherit concrete names, pages, files, workflows, model providers, or evidence paths from a previous audit. If using a prior project as an example, label it explicitly as an example and do not make it a default requirement.

## Audit Strategy

1. Restate the user's current objective and the real acceptance boundary.
2. Identify the audit dimensions that apply. Prefer spawning independent subagents when the user requested parallel or third-party review.
3. Give each specialist a narrow scope and minimum necessary context. Do not leak the intended conclusion.
4. For each dimension, require evidence from actual implementation or behavior before accepting a finding.
5. Synthesize results into three buckets:
   - 明确缺陷: current evidence proves the implementation does not satisfy the requirement.
   - 证据缺口: current evidence is insufficient; request or run more verification before judging.
   - 可选迭代: improvement opportunity that needs user prioritization and should not silently enter the repair queue.
6. For every 明确缺陷, decide whether it is safe to dispatch an automatic repair flow. Include a `repair_schedule` with target files, verification commands, rollback risk, and required post-repair evidence.
7. For every 证据缺口, include an `evidence_plan` with missing evidence, how to collect it, whether it blocks closure, and the minimum command or entrypoint.
8. For every 可选迭代, present a `decision_package` with options, tradeoffs, and recommended next step.
9. Do not close the task until required gates are proven against the real entrypoint. For live-facing changes, publish to the user-visible runtime and verify in a browser or real API.

## Live Frontend Entry Checks

When the task claims a frontend stack, route, or rendering-mode change, treat source code presence as insufficient. The audit must fetch the actual served route, follow redirects, and compare the final URL, HTML entry, script/style assets, DOM markers, and browser/runtime behavior against the claimed stack or user-visible mode.

Fail the audit as 明确缺陷 when the repository contains the promised implementation but the live entrypoint still serves an older shell. Examples include a task claiming React, Next.js App Router, Ant Design, or another framework migration while the route still redirects to legacy static files such as `desktop.html`, `mobile.html`, handwritten CSS/JS bundles, or a pre-migration DOM. Route this through `product-capability-gap-audit`, `user-experience-audit`, `quality-gate-audit`, and `flow-integrity-audit`.

Required evidence for this class of finding:

- code evidence for the claimed implementation and the route/server mapping;
- runtime or browser evidence from the real served URL after redirects;
- asset/DOM evidence showing whether the served entry uses the claimed stack;
- a verdict that does not pass while the real entrypoint and the claimed frontend mode disagree.

## Specialist Routing

- Code maintainability and test credibility: use `code-quality-audit`.
- Runtime failure, concurrency, deployment, and observability: use `system-robustness-audit`.
- Authentication, authorization, secrets, and destructive operations: use `security-permission-audit`.
- Resource, third-party, AI, and scaling waste: use `cost-efficiency-audit`.
- Goal drift, skipped steps, and completion claims: use `flow-integrity-audit`.
- CI, local gates, test strength, and live validation: use `quality-gate-audit`.
- Whether automated fixes actually repair the defect: use `auto-repair-authenticity-audit`.
- Recovery after interruption, rollback, failed deploy, or context loss: use `recovery-capability-audit`.
- Whether iterations create real user value: use `iteration-evolution-audit`.
- Gap between product promise and actual capability: use `product-capability-gap-audit`.
- Real user journey usability and recoverability: use `user-experience-audit`.
- Durable handoff and knowledge recoverability: use `knowledge-retention-audit`.
- Independence and usefulness of multiple AI roles: use `model-collaboration-audit`.

## Output Contract

Use natural Chinese for the user-facing conclusion. Keep machine-readable fields separate and short.

For each finding include:

- `id`: stable finding id.
- `dimension`: matching specialist dimension.
- `type`: 明确缺陷, 证据缺口, or 可选迭代.
- `severity`: 致命, 高, 中, or 低.
- `impact`: what user, product, data, cost, or delivery risk this creates.
- `evidence`: one or more evidence records. Each record must include `kind` (`code`, `command`, `file`, `runtime`, `screenshot`, `log`, or `diff`), source path or command, and result summary.
- `disposition`: 立即修复, 继续取证, 用户决策, or 延后.
- `known_risk_candidate`: true when the finding is a durable 明确缺陷 that should be consumed by a project risk ledger or equivalent closeout system; the orchestrator does not write the ledger unless the user or project workflow explicitly asks it to.

Finding-specific fields:

- 明确缺陷 must include `repair_schedule`: scope, target files or modules, owner role, verification commands, post-repair evidence required, rollback or regression concern, and live/browser verification when user-visible.
- 证据缺口 must include `evidence_plan`: missing evidence, how to collect it, whether it blocks closure, and minimum command or entrypoint.
- 可选迭代 must include `decision_package`: options, tradeoffs, recommended option, estimated cost or effort, and confidence gain.

Also include `coverage_summary`:

- `required_dimensions_count`
- `covered_dimensions_count`
- `justified_not_applicable_count`
- `findings_without_evidence_count`
- `defects_without_repair_schedule_count`
- `gaps_without_evidence_plan_count`
- `optional_without_decision_package_count`

Final verdict must be one of:

- 通过: required evidence is present and no blocking defect remains.
- 带条件通过: core outcome is acceptable, with named non-blocking gaps.
- 不通过: at least one blocking defect remains or a required live/user-facing gate is unverified.
- 需补证: available evidence is insufficient to judge.
