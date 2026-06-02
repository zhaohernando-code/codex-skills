---
name: user-experience-audit
description: Use this skill to audit real user journeys, visual hierarchy, information density, interaction feedback, error recovery, accessibility basics, responsive behavior, and perceived/runtime performance through actual browser or runtime evidence.
---

# User Experience Audit

## Core Rule

Do not judge experience by component existence or by whether information is merely present. Execute real user paths in the actual app or closest runnable environment and capture evidence about task completion, comprehension, visual hierarchy, information density, interaction quality, and performance.

## Project-Agnostic Boundary

Treat the target project, product, modules, entrypoints, tools, and runtime as inputs discovered from the current request and repository. Do not hardcode or inherit concrete names, pages, files, workflows, model providers, or evidence paths from a previous audit. If using a prior project as an example, label it explicitly as an example and do not make it a default requirement.

## Workflow

1. Select 3-5 core journeys: first entry, main task, empty state, error input, recovery/retry, permission or loading state.
2. Run the product in a real browser or runtime when feasible. Capture screenshots, console errors, network failures, and viewport differences.
3. Check whether the user can understand the next step, complete the task, see success/failure, recover from mistakes, and avoid data loss.
4. Audit visual organization: hierarchy, grouping, scan order, information density, page length, progressive disclosure, repeated panels, noisy counters, weak headings, and whether important decisions are visually distinguishable from diagnostics.
5. Check layout stability: overlapping text, hidden controls, broken mobile views, unreadable states, inaccessible interactions, oversized sections, uncontrolled scrolling, and content that expands without a clear structure.
6. Check interaction and performance experience: excessive or repeated requests, oversized payloads, blocking loading states, slow first useful render, janky updates, duplicate submissions, and lack of feedback during long operations.
7. Translate issues into user-decision packages: reduce steps, improve feedback, repair state, change information architecture, introduce progressive disclosure, reduce density, improve hierarchy, add safeguards, or set performance budgets.
8. Separate blocking usability defects from non-blocking design quality issues and polish suggestions.
9. Classify blocked core journeys, false success, unrecoverable user states, severe visual overload that blocks task completion, or performance behavior that makes a core path impractical as 明确缺陷. Classify missing browser/runtime/performance evidence as 证据缺口. Classify non-blocking hierarchy, density, copy, or workflow alternatives as 可选迭代 with user decision options.

## Hard Fail Conditions

- Core task cannot be completed.
- Primary action is ineffective or gives false success.
- Failure and success states are indistinguishable.
- Critical content or controls overlap or disappear in normal viewports.
- Information is technically present but so dense, long, repetitive, or poorly grouped that the core task cannot be confidently completed.
- A core user action triggers unbounded, excessive, repeated, or oversized requests that make the experience slow, fragile, or costly.
- Loading, saving, retry, or long-running states provide no usable feedback or recovery path.
- User-facing change was not tested in a real browser or real runtime.

## Output

面向用户的内容必须使用自然中文。每条用户路径都要包含类型、步骤、结果、证据、摩擦点、视觉层级、信息密度、页面长度或导航深度、反馈与恢复质量、性能或请求体验、阻断问题、明确缺陷的修复调度，以及可选迭代的 UX 决策包。
