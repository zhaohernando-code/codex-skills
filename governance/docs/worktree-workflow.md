# Worktree工作流架构

## 概述

Codex采用Git worktree实现任务隔离，确保多个任务可以并行开发而不互相干扰，同时保护canonical checkout作为集成和发布基线。

## 核心概念

### Canonical Checkout vs Task Worktree

**Canonical Checkout** (`~/codex/`)
- 主工作区，始终在main分支
- 只读基线：用于集成、验证、发布
- 禁止直接编辑（由PreToolUse hook强制）
- 所有task worktree的变更最终合并到这里

**Task Worktree** (`~/codex/worker-workspaces/<project>/<date>-<slug>-<taskid>/`)
- 隔离的工作副本，独立的分支
- 可以自由编辑、实验、提交
- 完成后合并到canonical，然后清理

### 为什么需要Worktree？

1. **并行开发**: 多个任务同时进行，不会冲突
2. **安全实验**: 可以随意修改，不影响主工作区
3. **清晰边界**: 任务完成后明确的清理点
4. **集成验证**: Canonical checkout始终是干净的集成基线

## 目录结构

```
~/codex/                                    # Canonical checkout (main)
├── .git/
├── scripts/
├── projects/
└── worker-workspaces/                      # Task worktrees根目录
    ├── codex/                              # Codex项目的worktrees
    │   ├── 20260531-doc-governance-plan/   # 文档治理任务
    │   └── 20260531-fix-branch-d-gate/     # 门禁修复任务
    ├── ai-control-platform/                # AI控制平台的worktrees
    └── dashboard-ui/                       # Dashboard的worktrees

~/.codex-system/worktrees/                  # 服务端worktrees（中台任务）
    ├── codex/
    │   └── task-<id>/
    └── ai-control-platform/
        └── task-<id>/
```

## 工作流程

### 1. 创建Task Worktree

**命令**:
```bash
cd ~/codex
git worktree add worker-workspaces/codex/20260531-task-name -b task/20260531-task-name
```

**自动化**: Hook会在检测到需要编辑时提示创建worktree

**命名约定**:
- 目录: `<yyyymmdd>-<slug>-<taskid8>`
- 分支: `task/<yyyymmdd>-<slug>-<taskid8>` 或 `worker/<yyyymmdd>-<slug>`

### 2. 在Worktree中工作

```bash
cd ~/codex/worker-workspaces/codex/20260531-task-name

# 正常开发
vim scripts/some-file.js
git add scripts/some-file.js
git commit -m "Fix something"

# 运行测试
npm test

# 运行closeout检查
npm run check:closeout
```

**注意**: 所有编辑、提交都在worktree中进行

### 3. 合并到Canonical

**手动方式**:
```bash
cd ~/codex  # 回到canonical checkout
git merge --ff-only task/20260531-task-name
git push origin main
```

**自动closeout**: Stop hook会自动执行上述步骤（如果满足条件）

### 4. 清理Worktree

**手动方式**:
```bash
cd ~/codex
git worktree remove worker-workspaces/codex/20260531-task-name
git branch -d task/20260531-task-name
```

**自动清理**: 自动closeout会在推送成功后清理worktree和分支

## Hook保护机制

### PreToolUse: 阻止修改Canonical

**检测逻辑**:
```javascript
const blocked = classifications.find((item) => 
  item.project &&           // 属于某个项目
  item.inCanonical &&       // 在canonical checkout内
  !item.inWorkerWorktree && // 不在worker worktree内
  !item.inServerWorktree    // 不在server worktree内
);
```

**阻塞消息**:
```
Workflow gate blocked mutation inside canonical checkout for <project>.
Target: <path>
Create or use an isolated task worktree under 
~/codex/worker-workspaces/<project-id>/<yyyymmdd>-<slug>-<taskid8> before editing.
```

### 路径分类

**函数**: `classifyPath(candidatePath)`

**返回**:
```javascript
{
  path: "/absolute/path",
  project: {...},              // 所属项目（如果有）
  inWorkerWorktree: boolean,   // 是否在worker-workspaces/内
  inServerWorktree: boolean,   // 是否在.codex-system/worktrees/内
  inCanonical: boolean         // 是否在项目的canonical checkout内
}
```

## 自动Closeout详解

### 触发条件

1. Stop事件
2. 检测到完成声明（"done", "完成", "implemented"等）
3. 非答疑/规划类会话
4. 验证证据满足（至少运行过测试）

### 执行步骤

**对于Task Worktrees**:
```javascript
1. commitDirtyWorktree(worktreeRoot)
   - 如果有未提交的修改，自动提交
   - Commit message: "Auto closeout task changes"

2. git merge --ff-only <worktree-HEAD>
   - 在canonical checkout中fast-forward合并
   - 拒绝non-ff（需要手动解决冲突）

3. pushBranch(repoPath, branchName)
   - 推送到origin
   - 先尝试git push origin，失败则尝试HTTPS URL

4. reapClosedOutWorktree(worktreeRoot, repoPath, branchName)
   - 检查worktree是clean的
   - 检查分支名是task/*或worker/*
   - 检查不是当前会话的cwd
   - git worktree remove <worktree>
   - git branch -d <branch>  # 安全删除，已合并才成功
```

**对于Canonical Checkouts**:
```javascript
1. 检查是否有新的ahead commits
2. pushBranch(repoPath, branchName)
   - 推送到origin
```

### 失败处理

**记录到diagnostics**:
```json
{
  "at": "2026-05-31T...",
  "type": "auto_closeout",
  "actions": [
    "committed task worktree /path/to/worktree",
    "merged task worktree into codex",
    "pushed codex main"
  ],
  "issues": [
    "auto closeout could not push ai-control-platform: network error"
  ]
}
```

**不会阻断**: 即使某个步骤失败，也会继续尝试其他项目

### Worktree清理逻辑

**函数**: `reapClosedOutWorktree()`

**安全检查**:
1. Worktree必须clean（无未提交修改）
2. 分支名必须是`task/*`或`worker/*`（生成的任务分支）
3. 不能是当前会话的cwd（避免删除正在使用的worktree）
4. `git worktree remove`不使用`--force`（拒绝删除dirty worktree）
5. `git branch -d`不使用`-D`（拒绝删除未合并分支）

**结果**:
- 成功: `reaped worktree + branch <name>`
- 保留: `kept: <reason>`（记录原因但不报错）

## 中台任务模式

### Server Worktrees

**位置**: `~/.codex-system/worktrees/<project>/task-<id>/`

**特点**:
- 由中台任务系统创建
- 生命周期由任务系统管理
- 同样受PreToolUse保护（不能修改canonical）

### 项目识别

**从Worktree路径推断项目**:
```javascript
function projectFromWorktreePath(projects, rootPath, resolvedPath) {
  // 提取第一级目录名（如"codex", "ai-control-platform"）
  const key = normalize(
    path.relative(rootPath, resolvedPath)
      .split(path.sep)
      .filter(Boolean)[0]
  );
  
  // 在WORKSPACE_INDEX.json中查找匹配的project_id
  return projects.find((project) => normalize(project.id) === key);
}
```

**支持的根目录**:
- `~/codex/worker-workspaces/`
- `~/.codex-system/worktrees/`

## 最佳实践

### 1. 任务开始前创建Worktree

```bash
# 不要直接在canonical中编辑
cd ~/codex
vim scripts/file.js  # ❌ 会被hook阻止

# 先创建worktree
git worktree add worker-workspaces/codex/20260531-fix-bug -b task/20260531-fix-bug
cd worker-workspaces/codex/20260531-fix-bug
vim scripts/file.js  # ✅ 正确
```

### 2. 保持Canonical Clean

```bash
cd ~/codex
git status  # 应该总是clean

# 如果有未提交的修改，说明流程有问题
# 检查是否误在canonical中编辑了
```

### 3. 任务完成后及时清理

```bash
# 合并后立即清理
git worktree remove worker-workspaces/codex/20260531-fix-bug
git branch -d task/20260531-fix-bug

# 或者依赖自动closeout
```

### 4. 避免长期存在的Worktree

- Worktree应该是短期的（几小时到几天）
- 长期存在的worktree容易与main分支diverge
- 定期检查并清理不再使用的worktree

### 5. 命名规范

**好的命名**:
- `20260531-fix-auth-bug`
- `20260531-add-user-api`
- `20260531-refactor-hooks`

**避免**:
- `test` (太通用)
- `tmp` (不清楚用途)
- `fix` (不清楚修复什么)

## 故障排查

### Worktree列表混乱

```bash
# 查看所有worktree
git worktree list

# 清理已删除的worktree记录
git worktree prune

# 强制删除损坏的worktree（谨慎使用）
git worktree remove --force <path>
```

### 无法删除Worktree

**原因1**: Worktree有未提交的修改
```bash
cd <worktree-path>
git status
git add -A && git commit -m "WIP"
# 或者
git restore .
```

**原因2**: 分支未合并
```bash
# 检查是否已合并
git branch --merged main | grep <branch-name>

# 如果确定要丢弃，使用-D
git branch -D <branch-name>
```

**原因3**: Worktree是当前目录
```bash
# 先切换到其他目录
cd ~/codex
git worktree remove <path>
```

### Canonical被意外修改

```bash
cd ~/codex
git status

# 如果有未提交的修改
git stash  # 暂存
# 或
git restore .  # 丢弃

# 如果有未推送的提交
git log origin/main..HEAD  # 查看
git reset --hard origin/main  # 丢弃（谨慎）
```

## 配置

### Worktree基础路径

**环境变量**: `CODEX_WORKFLOW_ROOT` / `CODEX_CONTROL_ROOT`

**默认**: `~/codex`

### 自动Closeout开关

**环境变量**: `CODEX_WORKFLOW_AUTO_CLOSEOUT=0`

**效果**: 禁用自动closeout，需要手动合并和清理

## 相关代码

**主要函数**:
- `classifyPath()`: 路径分类
- `projectFromWorktreePath()`: 从worktree路径推断项目
- `candidateTaskWorktreeRoots()`: 查找当前会话的task worktrees
- `attemptAutoCloseout()`: 自动closeout执行
- `commitDirtyWorktree()`: 提交worktree的dirty状态
- `reapClosedOutWorktree()`: 清理已完成的worktree
- `preToolUse()`: Canonical checkout保护

**位置**: `scripts/agent-workflow-guard.js`

## 相关文档

- [[hook-system]] - Hook系统架构
- [[../../PROCESS.md]] - 反回归原则
- [[../guides/development]] - 开发指南
