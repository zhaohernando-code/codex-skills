---
name: security-permission-audit
description: Use this skill to audit authentication, authorization, tenant boundaries, secret handling, sensitive data exposure, and dangerous operations against real code and runtime behavior.
---

# Security Permission Audit

## Core Rule

Security claims must be verified at the server, data, and runtime boundary. Frontend hiding, comments, route names, or policy documents are not proof.

## Project-Agnostic Boundary

Treat the target project, product, modules, entrypoints, tools, and runtime as inputs discovered from the current request and repository. Do not hardcode or inherit concrete names, pages, files, workflows, model providers, or evidence paths from a previous audit. If using a prior project as an example, label it explicitly as an example and do not make it a default requirement.

## Workflow

1. Build the actor and asset model: roles, tenants, admins, service accounts, sensitive data, external callbacks, and destructive operations.
2. Trace entrypoints: routes, APIs, jobs, webhooks, file upload, exports, admin actions, and command execution.
3. Verify authentication and authorization: object-level checks, tenant filters, role checks, policy enforcement, and bypass paths.
4. Check data exposure: response fields, logs, errors, cache, search index, frontend state, exported files, and debug endpoints.
5. Check secrets and supply chain: hardcoded keys, env handling, token lifetime, dependency risk, webhook signatures, and credential scope.
6. Reproduce when possible with browser, API request, tests, or local commands.
7. Classify issues as 明确缺陷, 证据缺口, or 可选迭代.
8. For 明确缺陷, include 修复调度: whether repair can be automatically dispatched, the likely files or permission boundaries, required verification, and rollback concern. For 可选迭代, provide 用户决策 options with risk and scope.

## Hard Fail Conditions

- Reproducible horizontal or vertical privilege escalation.
- Sensitive data exposed without authorization.
- Production secret committed or logged.
- Server-side authorization missing for admin or destructive actions.
- Webhook or callback can mutate assets without verification.
- File upload, path handling, or command execution enables arbitrary access.

## Output

面向用户的内容必须使用自然中文。每项发现要包含类型、攻击路径、受影响用户或数据、证据、可利用性、修复调度、建议修复边界、复验步骤，以及下一步是立即修复、继续取证、用户决策还是延后。不要公布超出安全复现所需的攻击细节。
