"use strict";

const { CURRENT_STATE_DOC_RE, PROCESS_DOC_RE } = require("./patterns");
const { classifyPath } = require("./paths-classify");
const { resolvePromptPathRoute, hasPromptActionIntent, detectSessionType } = require("./detectors");
const { isMutation, isHarmlessGitignoredEmptyDirRemoval } = require("./mutation");
const { toolTargetPaths } = require("./tool-input");
const { blockResponse, softPromptResponse } = require("./response");
const { processOnlyMutations } = require("./evidence");
const { appendDiagnostic, appendMutation, appendRoute, markEvidence } = require("./domain");
const { workspaceSnapshot, formatWorkspaceHealth } = require("./workspace-health");
const { selfDeployCanonicalGuard } = require("./self-deploy");

function sessionStart(input, state, filePath) {
  const deploy = selfDeployCanonicalGuard(input);
  if (deploy.deployed) {
    appendDiagnostic(state, "guard_self_deploy", { from: deploy.from, to: deploy.to });
  } else if (deploy.reason && !["up-to-date", "disabled", "outside-workspace", "not-a-repo"].includes(deploy.reason)) {
    // A non-benign skip (dirty, diverged-ahead, fetch-timeout/-failed, ff-failed, exception)
    // means the canonical guard may be running stale. Surface it instead of silently
    // swallowing — the operator needs to know the auto-deploy isn't taking effect.
    appendDiagnostic(state, "guard_self_deploy_skipped", { reason: deploy.reason });
  }
  const snapshot = workspaceSnapshot();
  state.baseline = snapshot;
  state.lastGitSnapshotAt = snapshot.at;
  state.lastGitSnapshot = snapshot;
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: formatWorkspaceHealth(snapshot, filePath),
    },
  };
}

function userPromptSubmit(input, state) {
  const cwdClassification = classifyPath(input.cwd || process.cwd());
  const prompt = input.prompt || "";
  const promptRoute = resolvePromptPathRoute(prompt);
  const hasActionIntent = Boolean(promptRoute || hasPromptActionIntent(prompt));
  const worktreeRoute = cwdClassification.project && (cwdClassification.inWorkerWorktree || cwdClassification.inServerWorktree)
    ? { project: cwdClassification.project, score: 1000, reasons: ["cwd:worktree"] }
    : null;
  const route = worktreeRoute || promptRoute;
  state.lastPromptIntent = {
    at: new Date().toISOString(),
    isReadOnlyQuestion: !hasActionIntent,
    hasActionIntent,
    routeEvidence: route ? route.reasons : [],
  };
  if (route) {
    const record = appendRoute(state, {
      projectId: route.project.id,
      projectName: route.project.name,
      repoPath: route.project.repoPath,
      score: route.score,
      reasons: route.reasons,
      canonicalDocs: route.project.canonicalDocs,
    });
    return {
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: [
          `Workspace route resolved to ${record.projectId} (${record.projectName}).`,
          `Repo: ${record.repoPath}`,
          record.canonicalDocs.length ? `Canonical docs:\n${record.canonicalDocs.map((item) => `- ${item}`).join("\n")}` : "",
        ].filter(Boolean).join("\n"),
      },
    };
  }
  return null;
}

function preToolUse(input, state, agent, event) {
  if (!isMutation(input)) {
    return null;
  }
  const targets = toolTargetPaths(input);
  const classifications = targets.map(classifyPath);
  const blockedTargets = classifications.filter((item) => item.project && item.inCanonical && !item.inWorkerWorktree && !item.inServerWorktree);
  const blocked = blockedTargets[0] || null;
  if (blocked && !isHarmlessGitignoredEmptyDirRemoval(input, blockedTargets)) {
    return blockResponse(
      agent,
      event,
      [
        `Workflow gate blocked mutation inside canonical checkout for ${blocked.project.id}.`,
        `Target: ${blocked.path}`,
        "Create or use an isolated task worktree under ~/codex/worker-workspaces/<project-id>/<yyyymmdd>-<slug>-<taskid8> before editing.",
      ].join("\n"),
    );
  }
  const firstProject = classifications.find((item) => item.project)?.project || null;
  appendMutation(state, {
    event,
    toolName: input.tool_name || input.toolName || "",
    projectId: firstProject?.id || "",
    targetPaths: targets,
  });
  if (targets.some((target) => CURRENT_STATE_DOC_RE.test(target))) {
    markEvidence(state, { docsTouched: true });
  }
  if (targets.some((target) => PROCESS_DOC_RE.test(target))) {
    markEvidence(state, { processTouched: true });
  }
  return null;
}

function postToolUse(input, state, agent, event) {
  // Token预警已禁用 (2026-05-31)
  //
  // 原因：软提示机制在自动化任务模式中存在风险
  // 1. Hook能输出提示，agent能看到，但CLI不会自动compact
  // 2. Agent可能忽略提示或响应太晚，导致超过token上限时任务直接断掉
  // 3. 这对中台自动化任务来说是不可接受的风险
  //
  // 替代方案：
  // - 个人开发：用户可以主动执行 /compact
  // - 中台任务：在任务编排层实现token监控和会话管理
  //   - 在任务阶段之间主动compact
  //   - 或在接近上限时开启新会话
  //
  // 如需重新启用，需要先解决CLI层面的自动compact机制
  //
  // const estimatedTokens = estimateSessionTokens(state);
  // if (estimatedTokens > 150000) {
  //   return softPromptResponse(event, [
  //     "## ⚠️ 对话长度预警",
  //     "",
  //     `当前会话已使用约 ${Math.round(estimatedTokens / 1000)}k tokens，接近上限。`,
  //     "",
  //     "**建议**：",
  //     "- 如果即将完成任务，先完成收尾工作",
  //     "- 然后主动执行 \`/compact\` 压缩对话",
  //     "- 或者在合适的断点结束当前会话，新开会话继续",
  //   ].join("\n"));
  // }
  return null;
}

function compactGate(input, state, agent, event) {
  // 检测会话类型，跳过非开发会话
  const sessionType = detectSessionType(input, state);
  if (sessionType === "inquiry" || sessionType === "planning") {
    return null;
  }

  if (!state.mutations.length || state.evidence.docsTouched || processOnlyMutations(state)) return null;

  // 改为软提示
  const reminder = [
    "## 📝 文档更新提醒",
    "",
    "本次会话修改了代码文件，但尚未更新项目文档。",
    "",
    "**建议在压缩前**：",
    "- 更新 PROJECT_STATUS.json 记录当前进度",
    "- 或在 DECISIONS.md 中记录关键决策",
    "- 或写一个简短的 handoff 说明当前状态",
    "",
    "**注意**：PROCESS.md 用于记录可复用的经验教训，不是任务日志。",
    "",
    "如果当前修改不需要文档更新（如临时调试、实验性代码），可以继续压缩。",
  ].join("\n");

  return softPromptResponse(event, reminder);
}

module.exports = { sessionStart, userPromptSubmit, preToolUse, postToolUse, compactGate };
