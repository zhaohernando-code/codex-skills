---
name: cost-efficiency-audit
description: Use this skill to audit code, architecture, infrastructure, third-party APIs, AI calls, CI, logs, and storage for avoidable cost, scaling waste, or missing budget controls.
---

# Cost Efficiency Audit

## Core Rule

Cost risk must be tied to a real scaling trigger: frequency, data size, retries, concurrency, model tokens, storage growth, log volume, or paid API calls.

## Project-Agnostic Boundary

Treat the target project, product, modules, entrypoints, tools, and runtime as inputs discovered from the current request and repository. Do not hardcode or inherit concrete names, pages, files, workflows, model providers, or evidence paths from a previous audit. If using a prior project as an example, label it explicitly as an example and do not make it a default requirement.

## Workflow

1. Map cost surfaces: compute, database, cache, storage, logs, queues, CI, third-party APIs, AI models, and observability.
2. Find high-frequency paths: user requests, scheduled jobs, batch imports, search, reports, retries, and background loops.
3. Inspect amplification: N+1 queries, unbounded pagination, repeated API calls, no caching, full scans, verbose logs, hot keys, and runaway retries.
4. Inspect lifecycle: temporary files, storage retention, job cleanup, index growth, connection pools, container sizing, and autoscaling.
5. Inspect AI usage: model selection, prompt size, repeated inference, cacheability, batching, fallback, and budget controls.
6. Quantify impact with available evidence: code path frequency, query plan, rough unit cost, logs, metrics, benchmark, or usage sample.
7. Split findings into blocking cost risks, evidence gaps, and optional optimization packages.
8. Map blocking cost risks to 明确缺陷 when current evidence proves an unsafe cost trigger. Every 明确缺陷 must enter 修复调度 with owner scope, guardrail or code change, verification or measurement plan, and rollback or budget-protection concern. Map unknown usage or missing measurement to 证据缺口. Map non-blocking optimization to 可选迭代 and provide 用户决策 options with estimated impact and tradeoffs.

## Hard Fail Conditions

- User action can trigger unbounded paid API or AI calls.
- Retry or queue behavior can create cost storms.
- Logs or storage grow without retention or cleanup in high-volume paths.
- Core query scales linearly or worse with expected data growth and has no mitigation.
- No budget, rate, or concurrency guard exists for expensive operations.

## Output

面向用户的内容必须使用自然中文。输出要包含类型、成本驱动、规模触发条件、证据、数量级估算、置信度、修复调度、保护建议、复验或测量方法，以及下一步是自动修复、继续测量还是用户排序决策。
