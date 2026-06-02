---
name: model-collaboration-audit
description: Use this skill to audit whether multiple AI roles, subagents, or external model reviewers were independent, complementary, evidence-driven, and properly arbitrated instead of creating false consensus.
---

# Model Collaboration Audit

## Core Rule

Multiple agents agreeing is not evidence. Collaboration is useful only when roles are isolated enough to reduce shared bias and conclusions are arbitrated against code, tests, runtime behavior, or user evidence.

## Project-Agnostic Boundary

Treat the target project, product, modules, entrypoints, tools, and runtime as inputs discovered from the current request and repository. Do not hardcode or inherit concrete names, pages, files, workflows, model providers, or evidence paths from a previous audit. If using a prior project as an example, label it explicitly as an example and do not make it a default requirement.

## Workflow

1. Identify roles: main agent, implementation agent, explorer, reviewer, external model, auditor, and user decision point.
2. Check task isolation: whether each role had a clear scope, minimum necessary context, and no leaked expected answer.
3. Compare outputs: unique evidence, distinct failure modes, disagreements, uncertainty, and missing dimensions.
4. Check arbitration: conflicts must be resolved by code, runtime, tests, logs, screenshots, or explicit user decision.
5. Evaluate whether collaboration improved coverage or only repeated the same assumptions.
6. Feed unresolved conflicts back into the orchestrator as evidence gaps or user decisions.
7. Classify false consensus, leaked expected conclusions, ignored conflicts, or evidence-free arbitration as 明确缺陷. Classify unresolved disagreements as 证据缺口 unless code or runtime evidence proves one side. Classify role-design improvements as 可选迭代 with 用户决策 options. 明确缺陷 must include 修复调度 or re-audit requirements.

## Hard Fail Conditions

- The result relies on consensus instead of evidence.
- Review agents received the intended conclusion and only confirmed it.
- Conflicting findings were ignored.
- No one verified claims against code or behavior.
- User decision points were hidden behind agent judgment.

## Output

面向用户的内容必须使用自然中文。输出要包含类型、角色、独立性判断、独特贡献、协作风险、冲突仲裁、修复或取证动作，以及建议追加的角色或用户决策点。
