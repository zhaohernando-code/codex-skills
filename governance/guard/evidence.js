"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  VALIDATION_RE,
  CLOSEOUT_RE,
  LIVE_RE,
  CURRENT_STATE_DOC_RE,
  PROCESS_DOC_RE,
  LIVE_CLOSEOUT_RE,
  COMPLETION_RE,
  HANDOFF_PAUSE_RE,
} = require("./patterns");
const { runGit } = require("./git");
const { repoStatusSnapshot } = require("./git-ops");
const { classifyPath } = require("./paths-classify");
const { loadWorkspaceIndex } = require("./workspace-index");
const { toolCommand } = require("./tool-input");
const { markEvidence } = require("./domain");

function recordEvidence(state, input) {
  const command = toolCommand(input);
  const text = [
    command,
    String(input.tool_response?.stdout || ""),
    String(input.tool_response?.stderr || ""),
    JSON.stringify(input.tool_input || {}),
  ].join("\n");
  if (VALIDATION_RE.test(text)) {
    markEvidence(state, { validation: true });
  }
  if (CLOSEOUT_RE.test(text)) {
    markEvidence(state, { validation: true, closeout: true });
  }
  if (LIVE_RE.test(text)) {
    markEvidence(state, { liveVerification: true });
  }
  if (CURRENT_STATE_DOC_RE.test(text)) {
    markEvidence(state, { docsTouched: true });
  }
  if (PROCESS_DOC_RE.test(text)) {
    markEvidence(state, { processTouched: true });
  }
  if (/\bgit\s+(commit|merge)\b/i.test(text)) {
    markEvidence(state, { commitOrMerge: true });
  }
  if (/\bgit\s+push\b|pushed to (origin|remote)|remote (merge|push|sync)|origin\/(main|master|trunk)/i.test(text)) {
    markEvidence(state, { remotePush: true });
  }
  if (/\b(publish|published|rsync|launchctl|server_release_sync|local_sync)\b/i.test(text)) {
    markEvidence(state, { publish: true });
  }
}

function validationEvidenceSatisfied(state, lastMessage) {
  return Boolean(state.evidence.validation || VALIDATION_RE.test(lastMessage));
}

function closeoutEvidenceSatisfied(state, lastMessage) {
  return Boolean(state.evidence.closeout || CLOSEOUT_RE.test(lastMessage));
}

function liveVerificationSatisfied(state, lastMessage) {
  return Boolean(state.evidence.liveVerification && state.evidence.publish) || LIVE_CLOSEOUT_RE.test(lastMessage);
}

function isDocOnlyPath(filePath) {
  return /\.(md|mdx|txt)$/i.test(filePath)
    || /(^|\/)(docs|doc|documentation)\//i.test(filePath)
    || /(^|\/)(PROJECT_STATUS\.json|DECISIONS\.md|PROCESS\.md|PROJECT_RULES\.md|README\.md|WORKSPACE_PROMPT\.md|CODEX\.md|KNOWN_TRAPS\.md)$/i.test(filePath);
}

function mutationTouchesCode(mutation) {
  const targets = Array.isArray(mutation.targetPaths) ? mutation.targetPaths : [];
  return !targets.length || targets.some((target) => !isDocOnlyPath(String(target || "")));
}

function recordedCodeMutation(state) {
  return (state.mutations || []).some(mutationTouchesCode);
}

function processOnlyMutations(state) {
  return state.mutations.length > 0
    && state.mutations.every((mutation) => {
      const targets = Array.isArray(mutation.targetPaths) ? mutation.targetPaths : [];
      return targets.length > 0 && targets.every((target) => PROCESS_DOC_RE.test(String(target || "")));
    });
}

function isCompletionClaim(lastMessage) {
  return COMPLETION_RE.test(lastMessage) && !HANDOFF_PAUSE_RE.test(lastMessage);
}

function baselineRepoFor(state, repoPath) {
  const resolved = path.resolve(repoPath || "");
  return (state.baseline?.repos || []).find((repo) => path.resolve(repo.repoPath) === resolved) || null;
}

function currentRepoForProject(project) {
  return project && fs.existsSync(path.join(project.repoPath, ".git")) ? repoStatusSnapshot(project) : null;
}

function changedFilesSinceBaseline(current, baseline) {
  const files = new Set();
  const status = runGit(current.repoPath, ["status", "--porcelain"]);
  if (status.ok) {
    for (const line of status.stdout.split("\n")) {
      const value = line.slice(3).trim();
      if (value) {
        const renamed = value.split(" -> ").pop();
        files.add(renamed);
      }
    }
  }
  if (baseline?.head && current.head && baseline.head !== current.head) {
    const diff = runGit(current.repoPath, ["diff", "--name-only", `${baseline.head}..${current.head}`]);
    if (diff.ok) {
      for (const line of diff.stdout.split("\n")) {
        if (line.trim()) files.add(line.trim());
      }
    }
  }
  return [...files];
}

function repoChangedSinceBaseline(current, baseline) {
  if (!baseline) {
    return current.dirty || current.ahead > 0;
  }
  const currentStatus = (current.statusLines || []).join("\n");
  const baselineStatus = (baseline.statusLines || []).join("\n");
  return current.dirty !== baseline.dirty
    || currentStatus !== baselineStatus
    || current.ahead > baseline.ahead
    || current.head !== baseline.head;
}

function latestProjectFromState(state, input) {
  const cwdProject = classifyPath(input.cwd || process.cwd()).project;
  const mutationProjectId = [...state.mutations].reverse().find((item) => item.projectId)?.projectId || "";
  if (cwdProject) {
    return cwdProject;
  }
  if (mutationProjectId) {
    return loadWorkspaceIndex().find((project) => project.id === mutationProjectId) || null;
  }
  return null;
}

function estimateSessionTokens(state) {
  // 粗略估算：每个事件约 1000 tokens，每个 mutation 约 2000 tokens
  const eventCount = (state.events || []).length;
  const mutationCount = (state.mutations || []).length;
  return eventCount * 1000 + mutationCount * 2000;
}

module.exports = {
  recordEvidence,
  validationEvidenceSatisfied,
  closeoutEvidenceSatisfied,
  liveVerificationSatisfied,
  isDocOnlyPath,
  mutationTouchesCode,
  recordedCodeMutation,
  processOnlyMutations,
  isCompletionClaim,
  baselineRepoFor,
  currentRepoForProject,
  changedFilesSinceBaseline,
  repoChangedSinceBaseline,
  latestProjectFromState,
  estimateSessionTokens,
};
