---
name: recovery-capability-audit
description: Use this skill to audit whether work, deployments, data, and user-facing changes can recover after interruption, failed tests, failed deploys, rollback, context loss, or partial repair.
---

# Recovery Capability Audit

## Core Rule

Recovery cannot depend on chat memory or an agent's private context. A fresh session must be able to determine state, resume safely, verify, and close or rollback.

## Project-Agnostic Boundary

Treat the target project, product, modules, entrypoints, tools, and runtime as inputs discovered from the current request and repository. Do not hardcode or inherit concrete names, pages, files, workflows, model providers, or evidence paths from a previous audit. If using a prior project as an example, label it explicitly as an example and do not make it a default requirement.

## Workflow

1. Identify what must recover: code changes, task state, deployment state, data state, runtime services, and user-visible pages.
2. Find durable sources: status files, handoff docs, commits, branches, logs, migration records, deploy logs, runbooks, and issue trackers.
3. Compare durable sources with real code, git state, tests, and runtime behavior. Mark stale or conflicting records.
4. Simulate a fresh resume path: what command or file tells the next agent current phase, blockers, decisions, and next steps?
5. Verify rollback or continuation for failed tests, partial fixes, failed deploys, and interrupted long tasks.
6. Require post-recovery quality gates and real entrypoint validation when applicable.
7. Classify recovery problems as 明确缺陷 when current work cannot safely resume, rollback, verify, or publish; 证据缺口 when recovery state cannot be proven; and 可选迭代 when a handoff improvement would help but not block closure. 明确缺陷 must include 修复调度 and post-repair verification. 可选迭代 must include 用户决策 options and tradeoffs.

## Hard Fail Conditions

- Current state is only recoverable from conversation memory.
- Durable status contradicts code, git, deploy, or runtime evidence.
- No clear next step exists after interruption.
- Failed deploy or migration has no rollback or repair path.
- Live-facing recovery is not verified on the real entrypoint.

## Output

面向用户的内容必须使用自然中文。输出要包含类型、当前阶段、持久化来源、过期或冲突来源、恢复演练结果、缺失交接项、修复或取证动作，以及收尾前的阻断缺口。
