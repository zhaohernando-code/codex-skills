---
name: system-robustness-audit
description: Use this skill to audit whether a system survives realistic failure, concurrency, deployment, recovery, and observability scenarios before release or after reliability incidents.
---

# System Robustness Audit

## Core Rule

Robustness must be proven through code paths, configuration, tests, logs, or controlled experiments. Do not infer reliability from green happy-path tests or architecture descriptions.

## Project-Agnostic Boundary

Treat the target project, product, modules, entrypoints, tools, and runtime as inputs discovered from the current request and repository. Do not hardcode or inherit concrete names, pages, files, workflows, model providers, or evidence paths from a previous audit. If using a prior project as an example, label it explicitly as an example and do not make it a default requirement.

## Workflow

1. Map runtime surfaces: user entrypoints, jobs, queues, storage, cache, external services, scheduled tasks, and deployment hooks.
2. Inspect failure behavior: timeouts, retries, idempotency, rollback, partial success, duplicate messages, ordering, and degraded dependencies.
3. Inspect concurrency and consistency: transactions, locks, unique constraints, state transitions, pagination, and shared mutable state.
4. Inspect deployment resilience: migrations, feature flags, default config, health checks, rollback path, cold start, and version compatibility.
5. Inspect observability: whether logs, metrics, traces, and alerts can identify user impact and recovery state.
6. Run or design verification: integration tests, concurrent tests, failure injection, migration dry runs, or reproducible drills.
7. Classify findings and decide whether defects are safe for automatic repair.
8. Label every finding as 明确缺陷, 证据缺口, or 可选迭代. 明确缺陷 must include the smallest safe repair scope, required verification command or drill, and rollback concern. 可选迭代 must include user decision options and tradeoffs instead of silently entering the repair queue.

## Hard Fail Conditions

- Non-idempotent retry can duplicate money, data, notifications, or irreversible actions.
- Critical dependency calls have no timeout or bounded retry.
- Queue or job failure can silently lose work.
- Migration can corrupt core data or lacks rollback/compatibility evidence.
- Operators cannot tell whether the system is failing.

## Output

面向用户的内容必须使用自然中文。每个场景都要包含:

- 类型: 明确缺陷, 证据缺口, or 可选迭代.
- 场景: 触发失败、并发、扩容或部署风险的具体条件。
- 预期行为: 健壮系统应如何处理。
- 当前证据: 代码、配置、测试、日志或运行证据。
- 风险半径: 对用户、数据、收入、运营或交付的影响。
- 处置建议: 立即修复、继续取证、用户决策或延后，并给出修复调度与复验要求。
