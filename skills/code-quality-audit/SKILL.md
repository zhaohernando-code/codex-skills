---
name: code-quality-audit
description: Use this skill to audit real code quality, maintainability, structural design, review coverage, test credibility, and change risk from a third-party perspective before merge, release, refactor acceptance, or defect closure.
---

# Code Quality Audit

## Core Rule

Do not accept architecture notes, README claims, or previous review summaries as proof. Start from current code, touched files, call paths, tests, and command output. Code that "works" can still fail this audit when structure, locality, size, duplication, or missing abstraction creates future change risk.

## Project-Agnostic Boundary

Treat the target project, product, modules, entrypoints, tools, and runtime as inputs discovered from the current request and repository. Do not hardcode or inherit concrete names, pages, files, workflows, model providers, or evidence paths from a previous audit. If using a prior project as an example, label it explicitly as an example and do not make it a default requirement.

## Workflow

1. Identify the scope: entrypoints, public APIs, core user paths, recent diffs, shared modules, data boundaries, and external dependencies.
2. Build a coverage plan before judging quality. List the code areas included, excluded, and why. Cover at least changed files, direct callers/callees, shared utilities touched by the change, public contracts, tests, generated/runtime glue, and any high-churn or high-size files near the change.
3. For large projects, split review into bounded shards by ownership boundary, feature area, runtime layer, or dependency direction. Each shard must have input files, entrypoints, risk focus, evidence collected, and a pass/fail/needs-evidence result. Do not let one broad review claim full coverage without shard evidence.
4. If the target platform provides `check:code-review-coverage` or a `code-review-coverage-dispatch` capability, produce or consume a `code-review-coverage.v1` artifact for the review. Any missing, failed, pending, retry, rerun, needs-rerun, blocked, incomplete, or needs-evidence shard is not a closed audit; it must enter the scheduler as a supplement/rerun package before a final pass can be claimed.
5. Trace representative paths from entrypoint to side effect. Prefer user-visible, data-changing, security-sensitive, expensive, or shared-library paths. For large projects, trace at least one path per high-risk shard instead of only 2-3 global paths.
6. Check maintainability: duplicated logic, hidden coupling, misleading names, dead code, mixed responsibilities, fragile abstractions, inconsistent error handling, and configuration drift.
7. Check structural quality: single-file growth, oversized functions/classes/modules, feature logic piled into entrypoints, repeated local helpers instead of shared capability, scattered implementations of the same policy, circular dependencies, layer violations, and missing seams for testing or extension.
8. Check abstraction discipline. A missing abstraction is a defect when the same behavior, policy, validation, parsing, formatting, permission check, error handling, or external-call pattern appears in multiple places and is likely to drift. An abstraction is also a defect when it hides simple logic, increases coupling, or has no stable contract.
9. Check test credibility: whether tests assert real behavior, cover failure paths, avoid over-mocking, and protect public contracts.
10. Run relevant gates when feasible: lint, typecheck, unit tests, integration tests, build. Record exact commands and outcomes.
11. Classify each finding as 明确缺陷, 证据缺口, or 可选迭代.
12. For 明确缺陷, include the smallest repair scope, verification command, and rollback or regression concern. For 可选迭代, provide user decision options and tradeoffs.

## Coverage And Sharding

- Start with an inventory: changed files, largest files, most-called shared modules, public entrypoints, core tests, and dependency edges touched by the change.
- Use search and code metrics when feasible: file length, function length, duplicate symbols, repeated literals, repeated validation branches, import fan-in/fan-out, and churn from git history.
- If the scope is too large for one pass, create review shards such as UI/client, API/server, domain logic, persistence, background jobs, infrastructure, tests, and shared utilities. Adapt these categories to the project instead of forcing them.
- Each shard must report what it actually inspected. Missing shards are 证据缺口, not implicit pass.
- Coverage is not line coverage only. It must cover behavioral paths, structural hotspots, shared abstractions, and tests around the changed risk.
- Third-party dependencies, VCS metadata, build outputs, coverage outputs, caches, logs, temporary files, generated files, vendored code, minified bundles, source maps, and local environments must not enter the review coverage denominator. Record them as excluded paths with reasons instead.
- When the scheduler/checker reports a coverage gap, run or schedule the returned supplement/rerun packages before giving the final audit conclusion. Do not downgrade missing coverage to a note when the platform can dispatch it.
- Do not treat same-name test files, mock-only tests, snapshot churn, or assertions of constants as credible coverage by themselves. Prefer tests that execute production paths, failure paths, shared contracts, and user-visible behavior.

## Structural Quality Checks

- Single-file bloat: flag files that accumulate unrelated responsibilities, large inline workflows, many local helper functions, mixed UI/API/domain/persistence concerns, or repeated append-only edits. Treat this as 明确缺陷 when it makes future changes risky or hides behavior from tests.
- Function/class bloat: flag long functions that combine orchestration, validation, side effects, formatting, and error handling without clear boundaries.
- Capability scattering: flag repeated implementations of the same capability across modules instead of one shared contract or helper.
- Policy scattering: flag permission, validation, retry, timeout, logging, cost, formatting, serialization, or status-mapping rules repeated in multiple places.
- Entry-point dumping: flag code added directly to CLI handlers, route handlers, page components, or job runners when reusable domain behavior should live behind a testable boundary.
- Abstraction absence: require a shared abstraction when duplication is meaningful and likely to drift; do not require abstraction for one-off simple code.
- Abstraction misuse: flag generic wrappers, indirection layers, or managers that obscure ownership without reducing real complexity.

## Evidence To Prefer

- File and line references for code paths.
- Command output and exit status.
- Diff showing production behavior changed or not changed.
- Test assertions and missing coverage around affected paths.
- Runtime logs or reproductions when code reading is insufficient.

## Hard Fail Conditions

- Build, typecheck, or required tests fail.
- A core path has no credible verification after risky changes.
- Public API behavior cannot be confirmed.
- Error handling can cause data loss, false success, or unrecoverable user failure.
- The only evidence is a summary, comment, or generated report.
- A large or risky change has no explicit coverage plan or shard evidence.
- `check:code-review-coverage` or `code-review-coverage-dispatch` returns `needs_dispatch` or `fail`, and no supplement/rerun work package was executed or scheduled.
- A file or function grows into an append-only mixed-responsibility blob that makes behavior hard to review or test.
- The same capability or policy is implemented in multiple places with no shared contract and no reason for divergence.
- New code is mostly piled into an entrypoint to finish the task while bypassing existing architecture boundaries.
- A review accepts mock echo tests, deleted assertions, or same-name test presence as coverage for a risky behavior without proving the production path.

## Output

Write a concise Chinese audit result. Include:

- 总体结论: 通过、带条件通过、不通过或需补证。
- 主要发现: grouped by 明确缺陷, 证据缺口, 可选迭代.
- 证据: 文件行号、命令、测试、日志或复现步骤。
- 覆盖说明: 审过哪些文件、路径、热点和 shard；哪些没审到以及原因。
- 覆盖调度: scheduler/checker status、补跑/重跑 package ids、excluded paths and reasons，以及是否已执行或进入调度。
- 结构质量: 单文件膨胀、职责边界、重复能力、抽象缺失或抽象滥用的判断。
- 修复调度: 对明确缺陷给出最小修复范围和必要验证。
- 用户决策: 对可选迭代给出选项和取舍，不要静默修复。
