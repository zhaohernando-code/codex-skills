"use strict";

const { classifyPath } = require("./paths-classify");
const { loadWorkspaceIndex } = require("./workspace-index");
const { detectSessionType } = require("./detectors");
const { softPromptResponse } = require("./response");
const { attemptAutoCloseout } = require("./auto-closeout");
const {
  isCompletionClaim,
  latestProjectFromState,
  recordedCodeMutation,
  closeoutEvidenceSatisfied,
  processOnlyMutations,
  baselineRepoFor,
  currentRepoForProject,
  repoChangedSinceBaseline,
  isDocOnlyPath,
  changedFilesSinceBaseline,
  liveVerificationSatisfied,
} = require("./evidence");
const { gitRemoteSyncState, hasDirtyGit, mainlineContainmentGaps } = require("../git-remote-state");

function stopGate(input, state, agent, event) {
  const lastMessage = String(input.last_assistant_message || input.lastAssistantMessage || "");

  // 检测会话类型，跳过非开发会话
  const sessionType = detectSessionType(input, state);
  if (sessionType === "inquiry" || sessionType === "planning") {
    return null;
  }

  if (state.lastPromptIntent && !state.lastPromptIntent.hasActionIntent && !state.mutations.length) return null;
  if (!isCompletionClaim(lastMessage)) return null;
  const hasRecordedMutations = state.mutations.length > 0;
  const project = latestProjectFromState(state, input);
  const byId = new Map(loadWorkspaceIndex().map((item) => [item.id, item]));
  const projectsToCheck = [...new Set(state.mutations.map((item) => item.projectId).filter(Boolean))].map((id) => byId.get(id)).filter(Boolean);
  if (!projectsToCheck.length && project) projectsToCheck.push(project);
  attemptAutoCloseout(input, state, projectsToCheck, lastMessage);
  const missing = [];
  if (hasRecordedMutations && !state.evidence.validation) missing.push("run and record a relevant validation command");
  if (hasRecordedMutations && recordedCodeMutation(state) && !closeoutEvidenceSatisfied(state, lastMessage)) {
    missing.push("run and record the project closeout gate, such as npm run check:closeout, npm run closeout, or check-mainline-release-readiness");
  }
  if (hasRecordedMutations && project?.liveVerificationRequired && !state.evidence.liveVerification) {
    missing.push("verify the real served route in a browser or with live route evidence");
  }
  if (hasRecordedMutations && !state.evidence.docsTouched && !processOnlyMutations(state)) {
    missing.push("update current-state docs/status or write a handoff before closing; PROCESS.md is for reusable principles, not task handoff");
  }
  const git = hasDirtyGit(input.cwd || process.cwd());
  const gitBaseline = baselineRepoFor(state, git.repo);
  if (git.dirty && (!gitBaseline || !gitBaseline.dirty)) {
    missing.push(`commit or intentionally resolve new dirty git state in ${git.repo}`);
  }
  if (hasRecordedMutations && !projectsToCheck.length) {
    const remote = gitRemoteSyncState(git.repo || input.cwd || process.cwd());
    if (remote.checked && !remote.synced) {
      missing.push(`push/merge the canonical branch to its upstream remote (${remote.reason})`);
    } else if (!remote.checked && state.evidence.commitOrMerge && !state.evidence.remotePush) {
      missing.push("record upstream remote push/merge evidence for the canonical branch");
    }
  }
  for (const item of hasRecordedMutations ? projectsToCheck : []) {
    const remote = gitRemoteSyncState(item.repoPath);
    if (remote.checked && !remote.synced) {
      missing.push(`push/merge the canonical branch for ${item.id} to its upstream remote (${remote.reason})`);
    } else if (!remote.checked && state.evidence.commitOrMerge && !state.evidence.remotePush) {
      missing.push(`record upstream remote push/merge evidence for ${item.id}`);
    }
    missing.push(...mainlineContainmentGaps(item.repoPath, state.mutations.filter((mutation) => mutation.projectId === item.id), { checkRelease: Boolean(state.evidence.publish || item.liveVerificationRequired) }));
  }
  const baselineProjects = new Map(loadWorkspaceIndex().map((item) => [item.id, item]));
  const baselineCheckProjects = [...projectsToCheck];
  const addBaselineCheckProject = (item) => {
    if (item && !baselineCheckProjects.find((existing) => existing.id === item.id)) {
      baselineCheckProjects.push(item);
    }
  };
  const lastRouteProject = state.lastRoute?.projectId ? baselineProjects.get(state.lastRoute.projectId) : null;
  if (lastRouteProject
    && (hasRecordedMutations || baselineRepoFor(state, lastRouteProject.repoPath))
    && !baselineCheckProjects.find((item) => item.id === lastRouteProject.id)) {
    addBaselineCheckProject(lastRouteProject);
  }
  const cwdProject = classifyPath(input.cwd || process.cwd()).project;
  if (cwdProject) {
    addBaselineCheckProject(cwdProject);
  }
  for (const item of baselineCheckProjects) {
    const current = currentRepoForProject(item);
    if (!current) continue;
    const baseline = baselineRepoFor(state, current.repoPath);
    const changed = repoChangedSinceBaseline(current, baseline);
    if (!changed) continue;
    if (!baseline && current.dirty) {
      missing.push(`commit or intentionally resolve dirty git state in ${current.repoPath}`);
    } else if (baseline && !baseline.dirty && current.dirty) {
      missing.push(`commit or intentionally resolve new dirty git state for ${item.id}`);
    } else if (baseline && baseline.dirty && current.dirty && (current.statusLines || []).join("\n") !== (baseline.statusLines || []).join("\n")) {
      missing.push(`commit or intentionally resolve changed dirty git state for ${item.id}`);
    }
    if (baseline && current.ahead > baseline.ahead) {
      missing.push(`push/merge new local commits for ${item.id} to ${current.upstream || "its upstream remote"}`);
    } else if (!baseline && current.ahead > 0) {
      missing.push(`push/merge local commits for ${item.id} to ${current.upstream || "its upstream remote"}`);
    }
    const changedFiles = changedFilesSinceBaseline(current, baseline);
    const codeAffecting = changedFiles.length > 0 && changedFiles.some((file) => !isDocOnlyPath(file));
    if (codeAffecting && !closeoutEvidenceSatisfied(state, lastMessage)) {
      missing.push(`run the project closeout gate for code changes in ${item.id}`);
    }
    if (item.liveVerificationRequired && codeAffecting && !liveVerificationSatisfied(state, lastMessage)) {
      missing.push(`publish and verify the real served route for live-facing changes in ${item.id}`);
    }
  }
  if (!missing.length) return null;

  // 改为软提示而不是阻断
  const checklist = [
    "## 🔍 收尾检查清单",
    "",
    "你声明任务完成，但以下事项可能需要确认：",
    "",
    ...missing.map(item => `- [ ] ${item}`),
    "",
    "**建议**：",
    "- 如果这些事项确实需要完成，请继续处理",
    "- 如果这些事项不适用于当前任务，可以说明原因并结束",
    "- 如果不确定，可以逐项检查并确认",
  ].join("\n");

  return softPromptResponse(event, checklist);
}

module.exports = { stopGate };
