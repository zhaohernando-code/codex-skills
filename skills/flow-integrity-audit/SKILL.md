---
name: flow-integrity-audit
description: Use this skill to audit whether a task or development flow stayed aligned with the user's goal, avoided drift, repaired discovered defects, and proved completion through real code or behavior.
---

# Flow Integrity Audit

## Core Rule

Completion claims are not evidence. A flow is complete only when the original user requirement maps to implemented behavior, verification evidence, and the real user-visible result when applicable.

## Project-Agnostic Boundary

Treat the target project, product, modules, entrypoints, tools, and runtime as inputs discovered from the current request and repository. Do not hardcode or inherit concrete names, pages, files, workflows, model providers, or evidence paths from a previous audit. If using a prior project as an example, label it explicitly as an example and do not make it a default requirement.

## Workflow

1. Extract the latest user objective and any changed requirements. Newer instructions override older ones.
2. Build a trace: user requirement -> required behavior -> changed files -> tests/runtime evidence -> user-visible result.
3. Inspect code and diffs directly. Treat status files, summaries, and subagent outputs as leads.
4. Detect drift: irrelevant refactors, missing key paths, skipped steps, stale assumptions, or unverified claims.
5. Check whether every discovered 明确缺陷 entered a repair flow with patch, verification, and re-audit.
6. For live-facing work, verify publish/deploy and real served page or API behavior.
7. Decide if the task can close, must repair, needs more evidence, or needs user decision.
8. Label every issue as 明确缺陷, 证据缺口, or 可选迭代. A 明确缺陷 must include 修复调度 and re-audit requirements. A 可选迭代 must include 用户决策 choices and tradeoffs.

## Hard Fail Conditions

- A core user requirement has no code or runtime evidence.
- A user-visible claim is unverified on the real entrypoint.
- A discovered explicit defect did not enter repair and re-verification.
- The final answer relies on agent summaries instead of evidence.
- Work shifted to a different project, branch, or target without user approval.

## Output

面向用户的内容必须使用自然中文。输出要包含:

- 目标追踪表: 用户要求、证据和状态。
- 偏移点: 偏离用户目标的具体位置。
- 阻断项: 阻止收尾的缺陷或缺失门禁。
- 修复调度: 完成前必须执行的修复流程、验证命令、真实入口检查和复审要求。
- 结论: 通过、带条件通过、不通过或需补证。
