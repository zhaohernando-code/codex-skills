# Skill 中文索引

更新时间: 2026-06-02

用途: 记录个人自建 Codex skills 的 `skill -> 中文名 -> 作用` 对应关系，方便快速回忆该用哪个 skill。

维护规则:

- 新增、修改、删除 `skills/*/SKILL.md` 时，同步更新本文件。
- skill 源头是 `codex-skills` 仓库；不要把 `$CODEX_HOME/skills` 当作 source of truth。
- 变更流程: 修改仓库内容 -> 运行 `scripts/validate-skills.sh` 和 `scripts/check-public-safety.sh` -> commit/push -> 运行 `scripts/install.sh` 同步到本机 Codex skills 和 Claude Code bridge。
- 如果临时直接改了本机 `$CODEX_HOME/skills`，必须在同一任务内 backport 到本仓并 push，否则不能宣称 skill 变更完成。

## 重点入口

`governance-audit-orchestrator` 是 13 个治理审计 skill 的总编排入口。想做“治理审计 / watchdog / 多维项目审计 / 验证开发流程能否发现、修复、升级问题”时，优先找它，而不是逐个想单项审计 skill。

它会按审计维度路由到这些治理 specialist skills:

- `code-quality-audit`
- `system-robustness-audit`
- `security-permission-audit`
- `cost-efficiency-audit`
- `flow-integrity-audit`
- `quality-gate-audit`
- `auto-repair-authenticity-audit`
- `recovery-capability-audit`
- `iteration-evolution-audit`
- `product-capability-gap-audit`
- `user-experience-audit`
- `knowledge-retention-audit`
- `model-collaboration-audit`

| Skill | 中文名 | 作用 |
| --- | --- | --- |
| `ai-governed-risk-closeout` | AI 风险闭环治理 | 根据已知风险台账执行 AI 主导的关闭、修复、调度、验证和回滚证据流程；新增执行合同、修复自评、最小 reviewer prompt、worker/orchestrator 分层收口约束。 |
| `auto-repair-authenticity-audit` | 自动修复真实性审计 | 审计自动或 AI 辅助修复是否真正修复缺陷，而不是削弱测试、隐藏错误、绕过检查或硬编码结果。 |
| `claude-deepseek-review` | Claude DeepSeek 独立评审 | 通过用户的 DeepSeek 兼容 Claude Code 启动脚本执行只读独立评审；默认监测 stream-json 进展，使用无进展超时而非完整回复超时，并在严重超时时切分内容重审。 |
| `code-quality-audit` | 代码质量审计 | 从第三方视角审计代码质量、可维护性、结构设计、评审覆盖、测试可信度和变更风险；强调真实行为覆盖，拒绝 mock 回声、常量断言或同名测试文件作为单独证据。 |
| `codex-compact-recovery` | Codex 压缩失败恢复 | 从本地 Codex 线程状态中恢复远程上下文压缩失败后的可继续工作信息，并生成新会话交接。 |
| `cost-efficiency-audit` | 成本效率审计 | 审计代码、架构、基础设施、第三方 API、AI 调用、CI、日志和存储中的成本浪费或预算缺口。 |
| `create-background-project` | 创建后台项目 | 在创建本地后台项目、守护进程、LaunchAgent、隧道服务或定时任务前执行能力适配检查并规范创建。 |
| `flow-integrity-audit` | 流程完整性审计 | 审计任务或开发流程是否始终对齐用户目标，避免漂移，并通过真实代码或行为证明完成。 |
| `frontend-skill` | 前端视觉体验构建 | 用于高质量落地页、网站、应用、原型、演示或游戏 UI，强调视觉层级、素材、动效和克制设计。 |
| `governance-audit-orchestrator` | 治理审计总编排 | 13 个治理审计 skill 的总入口；编排多维治理审计，并要求结构化 finding、evidence、repair_schedule、evidence_plan、decision_package、coverage_summary 和 known_risk_candidate 标记。 |
| `hatch-pet` | Codex 宠物孵化 | 创建、修复、验证、视觉 QA 并打包 Codex 兼容的动画宠物和 8x9 精灵图。 |
| `init` | 项目快捷初始化 | 根据 `~/codex` 下的模糊项目提示快速定位项目、读取关键文档，并避免全局盲搜。 |
| `iteration-evolution-audit` | 迭代演进审计 | 审计多轮迭代是否产生真实用户价值、缩小已知差距，并形成可发布改进包。 |
| `knowledge-retention-audit` | 知识留存审计 | 审计项目状态、决策、验证、风险和下一步是否可恢复；新增 `source_authority_map`，区分当前状态、运行态、fixture、历史证据、决策、计划、风险和下一步的权威来源。 |
| `maintain-background-projects` | 后台项目维护 | 审计、解释、清理、修复和排查本地后台项目、LaunchAgents、隧道、运行目录、日志、端口和公开路由。 |
| `model-collaboration-audit` | 多模型协作审计 | 审计多个 AI 角色、子代理或外部模型评审是否独立、互补、基于证据且被正确仲裁。 |
| `pdf` | PDF 处理 | 读取、创建或审阅 PDF，尤其在渲染和版式重要时使用可视化检查和 PDF 工具链。 |
| `playwright` | Playwright 浏览器自动化 | 通过终端 Playwright CLI 或封装脚本执行真实浏览器导航、表单、截图、数据提取和 UI 调试。 |
| `product-capability-gap-audit` | 产品能力差距审计 | 审计产品承诺、UI 入口、文档、API 描述和用户实际可用能力之间的差距。 |
| `quality-gate-audit` | 质量门禁审计 | 审计测试、构建、lint、类型检查、集成检查和真实入口验证是否真正覆盖并能阻断缺陷；拒绝仅靠 mock、快照变动、常量断言或同名测试存在证明门禁可信。 |
| `recovery-capability-audit` | 恢复能力审计 | 审计工作、部署、数据和用户可见变更在中断、失败、回滚、上下文丢失或部分修复后是否可恢复。 |
| `security-permission-audit` | 安全权限审计 | 基于真实代码和运行时行为审计认证、授权、租户边界、密钥处理、敏感数据暴露和危险操作。 |
| `start-task-worktree` | 任务工作树准备 | 在共享 Hernando 工作区做实现、修复、重构或依赖变更前准备隔离 git worktree。 |
| `system-robustness-audit` | 系统健壮性审计 | 审计系统在失败、并发、部署、恢复和可观测性场景下是否可靠。 |
| `user-experience-audit` | 用户体验审计 | 通过真实浏览器或运行时证据审计用户旅程、视觉层级、信息密度、反馈、错误恢复、可访问性、响应式和性能体验。 |
