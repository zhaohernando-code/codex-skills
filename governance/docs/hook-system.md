# Hook系统架构

## 概述

Codex 工作流守卫是一个跨 Codex Desktop、Codex CLI 和 Claude Code 的 hook 治理系统。`scripts/agent-workflow-guard.js` 保留为稳定入口，真实实现位于 `scripts/guard/` 模块树，通过关键事件点注入检查和提示，确保 worktree 隔离、代码质量和发布流程完整性。

## 架构设计

### 核心理念

**软提示优先**：使用`additionalContext`提供建议而非硬阻塞，让Agent自主判断，仅在关键安全边界使用硬阻塞。

### Hook事件流

```
SessionStart
    ↓
    ├─ 自部署检查（fast-forward canonical guard）
    ├─ 工作区健康快照
    └─ 输出工作区状态

UserPromptSubmit
    ↓
    ├─ 项目路由解析
    ├─ 意图检测（答疑/规划/开发）
    └─ 注入项目上下文

PreToolUse (Edit/Write/Bash)
    ↓
    ├─ 路径分类（canonical/worktree）
    ├─ Mutation检测
    └─ 硬阻塞：禁止直接修改canonical checkout

PostToolUse
    ↓
    ├─ 证据收集（validation/closeout/live/docs）
    └─ （已禁用）Token预警

Stop
    ↓
    ├─ 会话类型检测（跳过inquiry/planning）
    ├─ 完成声明检测
    ├─ 自动closeout尝试
    │   ├─ 提交task worktree
    │   ├─ 合并到canonical
    │   ├─ 推送到remote
    │   └─ 清理worktree和分支
    └─ 软提示：收尾检查清单

PreCompact
    ↓
    └─ 软提示：文档更新提醒
```

## 关键组件

### 1. 会话状态管理

**位置**: `.codex-system/workflow-sessions/<session-id>.json`

**结构**:
```json
{
  "sessionId": "local",
  "startedAt": "2026-05-31T...",
  "events": [...],
  "mutations": [...],
  "routes": [...],
  "evidence": {
    "validation": false,
    "liveVerification": false,
    "docsTouched": false,
    "processTouched": false,
    "commitOrMerge": false,
    "publish": false,
    "remotePush": false,
    "closeout": false
  },
  "baseline": {...},
  "diagnostics": [...]
}
```

### 2. 项目路由系统

**功能**: 从用户prompt或cwd推断目标项目

**数据源**: `WORKSPACE_INDEX.json`

**路由策略**:
1. 隔离 task worktree 路径匹配（优先级最高）
2. Prompt 中的显式项目路径字符串匹配
3. Stop/closeout 阶段用 cwd 项目归属补充检查范围

Canonical checkout 的 cwd 不作为 UserPromptSubmit 的正向路由证据；这可以避免只读提问因为 shell 当前目录而被误注入项目上下文。

### 3. Mutation检测

**目的**: 识别会修改文件系统或git状态的操作

**检测规则**:
```javascript
- Tool名称: Edit/Write/MultiEdit/NotebookEdit
- 命令模式:
  - 文件操作: touch/mv/cp/rm/mkdir/rmdir
  - Git操作: add/commit/merge/rebase/branch -D
  - Git worktree: worktree add
  - 构建: npm run build/check, npm install/ci
  - 重定向: >/>>
```

**注意**: `git branch -d`（安全删除）不被视为mutation，允许清理已合并分支。

### 4. 证据收集系统

**目的**: 跟踪任务完成的关键步骤

**证据类型**:
- `validation`: 运行测试/检查命令
- `closeout`: 执行closeout门禁
- `liveVerification`: 验证真实服务路由
- `docsTouched`: 更新项目文档
- `processTouched`: 更新流程文档
- `commitOrMerge`: Git提交或合并
- `remotePush`: 推送到远程
- `publish`: 发布/部署操作

**触发方式**: 在PostToolUse中通过正则匹配命令和输出

### 5. 自动Closeout机制

**触发条件**:
- Stop事件
- 检测到完成声明（done/完成/implemented等）
- 非答疑/规划类会话
- 验证证据满足

**执行流程**:
1. 提交task worktree的dirty状态
2. Fast-forward合并到canonical checkout
3. 推送到origin
4. 清理worktree和分支（如果clean且已合并）

**失败安全**: 任何步骤失败都记录到diagnostics，不影响后续步骤

### 6. 自部署机制

**触发**: SessionStart事件，且cwd在CODEX_ROOT内

**条件**:
- Canonical checkout在default branch（main/master）
- 工作树clean
- 本地落后于origin/<default>
- 可以fast-forward

**操作**: `git merge --ff-only origin/<default>`

**意义**: Guard脚本自动更新自己，无需手动部署

### 7. 领域状态模型

**位置**: `scripts/guard/domain.js`

该模块定义并归一化 guard 持久状态的核心记录：

- `EvidenceFlags`: validation、closeout、liveVerification、docsTouched、processTouched、commitOrMerge、publish、remotePush
- `EventRecord`: 每个 hook 事件的时间、事件名、cwd
- `RouteRecord`: 路由到的项目、repo、score、证据原因、canonical docs
- `MutationRecord`: 触发 mutation 的事件、工具、项目、目标路径
- `DiagnosticRecord`: 自部署、自动 closeout 等运行诊断

`session-state.js` 只负责读写 JSON 文件，读入后立即调用 `normalizeSessionState()`；事件处理模块通过 `appendEvent()`、`appendRoute()`、`appendMutation()`、`appendDiagnostic()` 和 `markEvidence()` 修改状态，避免各模块自行拼装半隐式对象。

## 作用域控制

### 全局注册，按需激活

**问题**: Hook在`~/.claude/settings.json`全局注册，但只应作用于codex项目

**解决**: `isCodexRelevant()`函数
- SessionStart/UserPromptSubmit: 总是运行（轻量级）
- PreToolUse/PostToolUse/Stop: 仅当cwd在CODEX_ROOT内或已路由到codex项目时运行

**效果**: 非codex会话不受影响

## 软提示机制

### 设计原则

1. **信任Agent判断**: 提供信息，让Agent决定是否响应
2. **避免死循环**: 不要求Agent必须完成某事才能继续
3. **明确替代方案**: 说明"如果不适用，可以..."

### 已知限制

**Stop/PreCompact hook的输出不可见**:
- 原因: 这些hook在turn结束后触发，`additionalContext`无法注入到当前turn
- 影响: Agent看不到收尾检查清单和文档更新提醒
- 状态: 已知CLI层面问题，等待修复

**PostToolUse hook正常工作**:
- 在turn中间触发，`additionalContext`能正常注入
- Token预警曾在此实现，但因CLI无自动compact能力已禁用

## 配置

### Hook注册

**位置**: `~/.claude/settings.json`

**关键配置**:
```json
{
  "hooks": {
    "SessionStart": [...],
    "UserPromptSubmit": [...],
    "PreToolUse": [{"matcher": "Bash|Edit|Write|MultiEdit|NotebookEdit", ...}],
    "PostToolUse": [{"matcher": "Bash|Edit|Write|MultiEdit|NotebookEdit", ...}],
    "Stop": [...],
    "PreCompact": [...],
    "PostCompact": [...]
  }
}
```

### 环境变量

- `CODEX_WORKFLOW_ROOT` / `CODEX_CONTROL_ROOT`: 覆盖默认的codex根目录
- `CODEX_AUTOMATED_WORKFLOW=1`: 标记为自动化工作流模式
- `CODEX_WORKFLOW_AUTO_CLOSEOUT=0`: 禁用自动closeout
- `CODEX_GUARD_NO_SELF_DEPLOY=1`: 禁用自部署

## 代码位置

**稳定入口**: `scripts/agent-workflow-guard.js`（thin shim，保留 hook 路径和历史导出契约）

**实现目录**: `scripts/guard/`

| 功能 | 位置 |
| --- | --- |
| CLI 分发 | `scripts/guard/main.js` |
| SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / PreCompact | `scripts/guard/handlers.js` |
| Stop closeout 检查 | `scripts/guard/stop-gate.js` |
| 状态领域模型 | `scripts/guard/domain.js` |
| Session JSON 读写 | `scripts/guard/session-state.js` |
| Evidence 识别 | `scripts/guard/evidence.js` 和 `scripts/guard/patterns.js` |
| Mutation 识别 | `scripts/guard/mutation.js` |
| 工具输入与 shell 路径解析 | `scripts/guard/tool-input.js` 和 `scripts/guard/shell.js` |
| 路径分类 | `scripts/guard/paths-classify.js` |
| 自动 closeout | `scripts/guard/auto-closeout.js` |
| Git 操作 | `scripts/guard/git.js` 和 `scripts/guard/git-ops.js` |
| 自部署 | `scripts/guard/self-deploy.js` |
| 作用域判断 | `scripts/guard/scope.js` |

**辅助模块**:
- `scripts/git-remote-state.js`: Git 远程同步和 mainline containment 检查
- `scripts/check-workflow-closeout.js`: 根级 closeout 门禁
- `docs/architecture/code-map.json`: 当前代码地图

## 设计权衡

### 为什么是软提示而非硬阻塞？

**硬阻塞的问题**:
1. Agent可能陷入死循环，不知道如何满足条件
2. 误判场景（答疑会话被要求提交代码）
3. 用户体验差，感觉被"卡住"

**软提示的优势**:
1. Agent有判断空间，可以解释为什么不适用
2. 用户可以看到提示，手动介入
3. 不会阻断正常工作流

**保留硬阻塞的场景**:
- PreToolUse阻止修改canonical checkout（安全边界）
- 这是明确的架构约束，没有例外

### 为什么禁用Token预警？

**原因**: 软提示依赖Agent响应，但CLI不会自动compact
- Agent看到预警但可能忽略或响应太晚
- 在自动化任务模式中，超过token上限会导致任务直接断掉
- 这是不可接受的风险

**替代方案**:
- 个人开发: 用户主动`/compact`
- 中台任务: 在编排层监控token并主动compact或开新会话

## 未来改进

1. **CLI层面修复Stop/PreCompact hook输出注入**
2. **实现token监控和自动compact机制**
3. **增强会话类型检测准确性**
4. **支持更细粒度的项目级配置**
5. **提供hook执行的可观测性（日志/指标）**

## 相关文档

- [[worktree-workflow]] - Worktree工作流详解
- [[../decisions/hook-token-management]] - Hook与Token管理决策
- [[../../PROCESS.md]] - 反回归原则
- [[code-map.json]] - 当前代码地图
- [[../../scripts/agent-workflow-guard.js]] - 稳定入口 shim
