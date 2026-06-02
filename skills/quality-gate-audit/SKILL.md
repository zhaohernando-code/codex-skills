---
name: quality-gate-audit
description: Use this skill to audit whether project quality gates truly ran, matched the change risk, and could block defects through tests, build, lint, typecheck, integration checks, and real entrypoint validation.
---

# Quality Gate Audit

## Core Rule

Green status is not enough. A gate is credible only if it ran the right scope, asserted real behavior, produced a trustworthy exit status, and was not bypassed.

## Project-Agnostic Boundary

Treat the target project, product, modules, entrypoints, tools, and runtime as inputs discovered from the current request and repository. Do not hardcode or inherit concrete names, pages, files, workflows, model providers, or evidence paths from a previous audit. If using a prior project as an example, label it explicitly as an example and do not make it a default requirement.

## Workflow

1. Enumerate declared gates: package scripts, CI workflows, Makefile, pre-commit, test configs, deploy checks, browser checks, and runbooks.
2. Determine required gates from the change surface and user-facing risk.
3. Inspect actual execution: command, exit code, timestamp, affected path, logs, and environment.
4. Check test integrity: assertions, mocks, fixtures, skipped tests, snapshots, xfail, TODO, weak coverage, and missing failure paths.
5. Search for bypasses: `|| true`, ignored exit codes, disabled lint/typecheck, conditional skip, swallowed errors, and known failures treated as success.
6. For UI/live-facing work, require real browser or API validation after publish.
7. For coverage-sensitive changes, verify what behavior was covered rather than accepting test-file presence, test count, or snapshot updates. Mock echo tests, constant assertions, and tests that avoid the production path do not make a gate credible.
8. Output missing gates and whether they block closure.
9. Classify gate problems as 明确缺陷 when a required gate is missing, failed, bypassed, irrelevant to the change, or backed only by non-credible tests; 证据缺口 when execution evidence is unavailable; and 可选迭代 when an additional non-blocking gate would improve confidence. 明确缺陷 must include the rerun, test repair, or gate fix that should enter 修复调度 automatically. 可选迭代 must include a 用户决策 package with options, confidence gain, time cost, and recommended next step.

## Hard Fail Conditions

- Required gate was not run.
- Failing command was masked as success.
- Test only verifies mocks while the production path is untested.
- Live-facing change was not verified on the real served entrypoint.
- Build or deployment cannot be reproduced.
- Coverage or test evidence is based on mock echo, assertion removal, snapshot-only churn, or same-name test existence instead of relevant behavior.

## Output

面向用户的内容必须使用自然中文。输出要包含类型、必需门禁、实际结果、证据、覆盖缺口、阻断项、修复调度、最小补跑或新增测试，以及可选迭代的用户决策选项和取舍。
