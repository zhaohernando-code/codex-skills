---
name: knowledge-retention-audit
description: Use this skill to audit whether project state, decisions, verification, risks, next steps, stale plans, and redundant durable records are recoverable and well-governed across people, agents, context compaction, and fresh sessions.
---

# Knowledge Retention Audit

## Core Rule

Knowledge is retained only if a fresh agent can recover it from durable project artifacts and verify it against current code or runtime. Chat-only knowledge is a risk, and redundant or obsolete durable knowledge is also a risk when it makes the current truth ambiguous.

## Project-Agnostic Boundary

Treat the target project, product, modules, entrypoints, tools, and runtime as inputs discovered from the current request and repository. Do not hardcode or inherit concrete names, pages, files, workflows, model providers, or evidence paths from a previous audit. If using a prior project as an example, label it explicitly as an example and do not make it a default requirement.

## Workflow

1. Locate durable knowledge: status files, README, process docs, ADRs, runbooks, deploy notes, test instructions, issue records, and handoff files.
2. Verify these sources against code, git state, commands, tests, deployment status, and runtime behavior.
3. Check whether they capture current phase, decisions, why choices were made, failed attempts, validation evidence, blockers, and next steps.
4. Simulate fresh-session recovery: can another agent find entrypoints, run commands, understand risks, and continue?
5. Audit knowledge governance and self-cleaning: identify outdated designs, superseded plans, stale TODOs, abandoned decision records, duplicated status stores, unnecessary multi-location state, and records with no owner or update trigger.
6. Decide the source-of-truth map: which artifact should remain authoritative, which duplicates should be removed, linked, archived, or downgraded to historical context, and what evidence proves the choice.
7. Mark stale, conflicting, missing, overly vague, redundant, or ownerless knowledge.
8. Produce a `source_authority_map` for any non-trivial project: current state, runtime state, fixture or sample data, historical evidence, decisions, plans, risks, and next steps. For each category, name the authoritative source, allowed secondary sources, freshness signal, stale-risk indicator, and cleanup or archive rule.
9. Recommend the smallest durable update needed. Do not turn optional documentation polish into a blocking defect, but do treat state duplication as blocking when it can mislead future execution or closure.
10. Classify unrecoverable current work, conflicting durable state, or misleading duplicate sources as 明确缺陷; unknown or unavailable state evidence as 证据缺口; and helpful non-blocking documentation cleanup as 可选迭代. 明确缺陷 must include durable-state 修复调度, source-of-truth cleanup, and re-check from a fresh-session perspective. 可选迭代 must include 用户决策 options and tradeoffs.

## Hard Fail Conditions

- Critical state exists only in conversation.
- Durable docs contradict current code or runtime.
- Multiple durable records claim authority for the same current state and disagree, lack precedence rules, or create unnecessary dual maintenance.
- Obsolete designs, plans, or TODOs remain presented as active guidance.
- No reliable run/test/deploy entrypoint is discoverable.
- Completion, deployment, or verification status cannot be reconstructed.
- Long-running work lacks phase, blockers, decisions, and next steps.

## Output

面向用户的内容必须使用自然中文。输出要包含类型、恢复地图、`source_authority_map`、重复或多位置状态、过期设计/计划/TODO、过期或冲突知识、对下一位接手者的影响、最小交接要求、清理或归档建议、修复或取证动作，以及是否可以安全收尾。
