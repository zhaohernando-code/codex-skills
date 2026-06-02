---
name: auto-repair-authenticity-audit
description: Use this skill to audit whether an automated or AI-assisted repair truly fixed a defect instead of weakening tests, hiding errors, bypassing gates, hardcoding fixtures, or claiming completion without re-verification.
---

# Auto Repair Authenticity Audit

## Core Rule

A repair is authentic only if the original defect is reproduced or precisely evidenced, the fix addresses production behavior, and the original failure path plus related regressions pass afterward.

## Project-Agnostic Boundary

Treat the target project, product, modules, entrypoints, tools, and runtime as inputs discovered from the current request and repository. Do not hardcode or inherit concrete names, pages, files, workflows, model providers, or evidence paths from a previous audit. If using a prior project as an example, label it explicitly as an example and do not make it a default requirement.

## Workflow

1. Collect the original defect: user report, failed command, log, stack trace, screenshot, reproduction, or failing test.
2. Confirm the defect signal before repair when feasible. If not feasible, state the evidence gap.
3. Inspect the repair diff. Distinguish production behavior changes from test-only or fixture-only changes.
4. Search for bypass patterns: skipped tests, deleted assertions, relaxed checks, swallowed exceptions, `|| true`, hardcoded expected values, disabled lint/typecheck, and hidden warnings.
5. Re-run the original failure path and related gates. For live-facing defects, verify the real entrypoint.
6. If the defect still exists or the fix is a bypass, dispatch a new repair flow with explicit scope and verification.
7. Classify optional cleanup separately from required repair.
8. Label every issue as 明确缺陷, 证据缺口, or 可选迭代. A fake or incomplete repair is a 明确缺陷 and must dispatch another 修复调度 cycle, not merely warn. Missing reproduction evidence is a 证据缺口. Cleanup beyond the root cause is a 可选迭代 for 用户决策.

## Hard Fail Conditions

- Original failure path was not re-run.
- Fix primarily weakens or removes verification.
- Production behavior is unchanged for a production defect.
- Error is hidden while user-visible behavior remains wrong.
- A clear defect is found but no repair task is created.

## Output

面向用户的内容必须使用自然中文。输出要包含类型、原始失败证据、修复真实性判断、可疑绕过、复验结果，以及系统是否必须在收尾前自动继续修复。
