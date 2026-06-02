---
name: iteration-evolution-audit
description: Use this skill to audit whether multiple iterations created real user value, reduced known gaps, and formed releaseable improvement packages instead of producing code churn or narrative-only progress.
---

# Iteration Evolution Audit

## Core Rule

An iteration only counts as progress when current code or behavior shows a user, operator, or maintainer benefit. Roadmaps and summaries are not proof.

## Project-Agnostic Boundary

Treat the target project, product, modules, entrypoints, tools, and runtime as inputs discovered from the current request and repository. Do not hardcode or inherit concrete names, pages, files, workflows, model providers, or evidence paths from a previous audit. If using a prior project as an example, label it explicitly as an example and do not make it a default requirement.

## Workflow

1. Build an iteration timeline from commits, diffs, issues, task notes, tests, and runtime entrypoints.
2. Classify each change by user-visible capability, experience improvement, reliability gain, performance/cost improvement, security improvement, or internal-only maintenance.
3. Verify representative outcomes through tests, CLI, browser, API, logs, or screenshots.
4. Detect churn: repeated rework, unfinished TODO, regressions, cosmetic changes presented as capability, or root causes left open.
5. Convert valid progress into releaseable improvement packages with user value and acceptance evidence.
6. Convert uncertain items into evidence gaps, not success claims.
7. Convert strategic options into user decision packages with alternatives and tradeoffs.
8. Classify proven regressions or misleading progress as 明确缺陷, missing verification as 证据缺口, and future improvement direction as 可选迭代. Every 明确缺陷 must enter 修复调度 with scope, verification, and rollback planning when rollback is relevant. 可选迭代 must remain a 用户决策 package with options, tradeoffs, and recommended next step.

## Hard Fail Conditions

- Iteration value is supported only by summaries or roadmap text.
- Claimed user improvement has no runnable or inspectable behavior.
- Changes increase capability promise without implementation.
- Repeated fixes never close the root cause or regression loop.

## Output

面向用户的内容必须使用自然中文。输出要包含类型、迭代时间线、实际用户可见变化、证据、退化或无效返工、发布就绪度、修复调度、必要回滚动作，以及可决策的改进包。
