"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { runGit } = require("./git");
const { commitDirtyWorktree, pushBranch, reapClosedOutWorktree } = require("./git-ops");
const { classifyPath } = require("./paths-classify");
const { loadWorkspaceIndex } = require("./workspace-index");
const { gitRootForPath } = require("./git");
const { validationEvidenceSatisfied, baselineRepoFor, currentRepoForProject } = require("./evidence");
const { appendDiagnostic, markEvidence } = require("./domain");

function autoCloseoutCandidateProjects(state, input, projectsToCheck) {
  const byId = new Map(loadWorkspaceIndex().map((item) => [item.id, item]));
  const candidates = [...projectsToCheck];
  const addProject = (project) => {
    if (project && !candidates.find((item) => item.id === project.id)) candidates.push(project);
  };
  const cwdProject = classifyPath(input.cwd || process.cwd()).project;
  addProject(cwdProject);
  if (state.lastRoute?.projectId) addProject(byId.get(state.lastRoute.projectId));
  for (const mutation of state.mutations || []) {
    if (mutation.projectId) addProject(byId.get(mutation.projectId));
  }
  return candidates.filter(Boolean);
}

function candidateTaskWorktreeRoots(state, input) {
  const roots = new Set();
  const addPath = (candidatePath) => {
    const root = gitRootForPath(candidatePath);
    if (!root) return;
    const classification = classifyPath(root);
    if ((classification.inWorkerWorktree || classification.inServerWorktree) && classification.project) {
      roots.add(root);
    }
  };
  addPath(input.cwd || process.cwd());
  for (const mutation of state.mutations || []) {
    for (const target of mutation.targetPaths || []) addPath(target);
  }
  return [...roots];
}

function attemptAutoCloseout(input, state, projectsToCheck, lastMessage) {
  if (process.env.CODEX_WORKFLOW_AUTO_CLOSEOUT === "0") {
    return { attempted: false, issues: [] };
  }
  if (!validationEvidenceSatisfied(state, lastMessage)) {
    return { attempted: false, issues: [] };
  }

  const issues = [];
  const actions = [];
  const projects = autoCloseoutCandidateProjects(state, input, projectsToCheck);
  const taskRoots = candidateTaskWorktreeRoots(state, input);
  for (const worktreeRoot of taskRoots) {
    const classification = classifyPath(worktreeRoot);
    const project = classification.project;
    if (!project?.repoPath || !fs.existsSync(path.join(project.repoPath, ".git"))) continue;

    const commit = commitDirtyWorktree(worktreeRoot, "Auto closeout task changes");
    if (!commit.ok) {
      issues.push(`auto closeout could not commit task worktree ${worktreeRoot}: ${commit.reason}`);
      continue;
    }
    if (commit.committed) actions.push(`committed task worktree ${worktreeRoot}`);

    const head = runGit(worktreeRoot, ["rev-parse", "HEAD"]);
    if (!head.ok || !head.stdout) {
      issues.push(`auto closeout could not read task worktree HEAD for ${worktreeRoot}`);
      continue;
    }
    const canonicalStatus = runGit(project.repoPath, ["status", "--porcelain"]);
    if (!canonicalStatus.ok || canonicalStatus.stdout.trim()) {
      issues.push(`auto closeout refused to merge into dirty canonical checkout ${project.repoPath}`);
      continue;
    }
    const merge = runGit(project.repoPath, ["merge", "--ff-only", head.stdout]);
    if (!merge.ok) {
      issues.push(`auto closeout could not fast-forward ${project.id} mainline from ${worktreeRoot}: ${merge.stderr || merge.stdout}`);
      continue;
    }
    actions.push(`merged task worktree into ${project.id}`);
    const branch = runGit(project.repoPath, ["branch", "--show-current"]);
    const push = pushBranch(project.repoPath, branch.stdout);
    if (!push.ok) {
      issues.push(`auto closeout could not push ${project.id}: ${push.reason}`);
      continue;
    }
    actions.push(`pushed ${project.id} ${branch.stdout}`);

    // Confirmed merged + pushed: reap the now-redundant local task worktree + branch.
    const reaped = reapClosedOutWorktree(worktreeRoot, project.repoPath, branch.stdout, input);
    if (reaped.reaped) actions.push(`reaped task worktree ${worktreeRoot} (${reaped.note})`);
  }

  for (const project of projects) {
    const current = currentRepoForProject(project);
    if (!current) continue;
    const baseline = baselineRepoFor(state, current.repoPath);
    if (current.dirty) continue;
    if ((baseline && current.ahead > baseline.ahead) || (!baseline && current.ahead > 0)) {
      const push = pushBranch(project.repoPath, current.branch);
      if (!push.ok) {
        issues.push(`auto closeout could not push ${project.id}: ${push.reason}`);
      } else {
        actions.push(`pushed ${project.id} ${current.branch}`);
      }
    }
  }

  if (actions.length) {
    markEvidence(state, { commitOrMerge: true, remotePush: issues.length === 0 });
    appendDiagnostic(state, "auto_closeout", {
      actions,
      issues,
    });
  }
  return { attempted: actions.length > 0 || issues.length > 0, actions, issues };
}

module.exports = { autoCloseoutCandidateProjects, candidateTaskWorktreeRoots, attemptAutoCloseout };
