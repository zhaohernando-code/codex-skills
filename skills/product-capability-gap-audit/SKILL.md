---
name: product-capability-gap-audit
description: Use this skill to audit gaps between product promises, UI entries, documentation, API descriptions, and the actual implemented capability available to users.
---

# Product Capability Gap Audit

## Core Rule

Audit from the user's job, not from module names. A capability exists only when the user can complete the task through real entrypoints with correct feedback and data behavior.

## Project-Agnostic Boundary

Treat the target project, product, modules, entrypoints, tools, and runtime as inputs discovered from the current request and repository. Do not hardcode or inherit concrete names, pages, files, workflows, model providers, or evidence paths from a previous audit. If using a prior project as an example, label it explicitly as an example and do not make it a default requirement.

## Workflow

1. Extract product promises: UI labels, navigation, README, API docs, settings, demo text, release notes, and visible affordances.
2. Model user jobs: what the user tries to accomplish, required inputs, expected output, failure modes, and success signal.
3. Trace implementation: route, handler, permission, data model, persistence, background job, state update, and error handling.
4. Verify each capability as complete, partial, stub, missing, or misleading.
5. Identify whether to build capability, downgrade promise, hide entry, improve feedback, or add acceptance tests.
6. For optional improvements, present decision packages with scope and user impact.
7. Classify misleading or missing promised capability as 明确缺陷, unverified capability as 证据缺口, and expansion beyond the promise as 可选迭代. Every 明确缺陷 must enter 修复调度, even when the repair is product-facing rather than code-only. The schedule must state whether to build the missing capability, downgrade the promise, hide the entry, repair feedback, or add acceptance tests, plus owner scope, verification, and rollback or release-risk concern.

## Hard Fail Conditions

- User-visible entry exists but has no real implementation.
- Critical path depends on mock, stub, static fixture, or unreachable code.
- UI or API reports success while the task did not complete.
- Documentation promises a capability that current code cannot provide.

## Output

面向用户的内容必须使用自然中文。输出要包含类型、能力矩阵、用户任务、承诺来源、实现状态、证据、用户影响、修复调度、建议方案，以及存在多种合理产品方向时的用户决策选项和取舍。
