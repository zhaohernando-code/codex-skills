"use strict";

const path = require("node:path");
const { runGit } = require("./git");
const { isPathInside } = require("./paths-classify");

function githubHttpsUrlFrom(remoteUrl = "") {
  const value = String(remoteUrl || "").trim();
  const sshMatch = value.match(/^git@github\.com:([^/]+\/[^.]+?)(?:\.git)?$/);
  if (sshMatch) return `https://github.com/${sshMatch[1]}.git`;
  const httpsMatch = value.match(/^https:\/\/github\.com\/([^/]+\/[^.]+?)(?:\.git)?$/);
  if (httpsMatch) return `https://github.com/${httpsMatch[1]}.git`;
  return "";
}

function pushBranch(repoPath, branchName) {
  const branch = String(branchName || "").trim();
  if (!branch) {
    return { ok: false, reason: "cannot push without a current branch" };
  }
  const direct = runGit(repoPath, ["push", "origin", `${branch}:${branch}`]);
  if (direct.ok) return { ok: true, method: "git_push_origin", stdout: direct.stdout };

  const remoteUrl = runGit(repoPath, ["remote", "get-url", "origin"]);
  const httpsUrl = githubHttpsUrlFrom(remoteUrl.stdout);
  if (!httpsUrl) {
    return { ok: false, reason: direct.stderr || direct.stdout || "git push failed" };
  }
  const fallback = runGit(repoPath, ["push", httpsUrl, `${branch}:${branch}`]);
  if (fallback.ok) return { ok: true, method: "git_push_https", stdout: fallback.stdout };
  return { ok: false, reason: fallback.stderr || fallback.stdout || direct.stderr || "git push failed" };
}

function commitDirtyWorktree(repoPath, message) {
  const status = runGit(repoPath, ["status", "--porcelain"]);
  if (!status.ok) return { ok: false, reason: status.stderr || "unable to read git status" };
  if (!status.stdout.trim()) return { ok: true, committed: false };
  const add = runGit(repoPath, ["add", "-A"]);
  if (!add.ok) return { ok: false, reason: add.stderr || "git add failed" };
  const commit = runGit(repoPath, [
    "-c", "user.name=Codex Workflow Guard",
    "-c", "user.email=codex-workflow-guard@local",
    "commit",
    "-m",
    message,
  ]);
  if (!commit.ok) return { ok: false, reason: commit.stderr || commit.stdout || "git commit failed" };
  return { ok: true, committed: true, output: commit.stdout };
}

function repoStatusSnapshot(project) {
  const repoPath = project.repoPath;
  const status = runGit(repoPath, ["status", "--short", "--branch"]);
  const head = runGit(repoPath, ["rev-parse", "HEAD"]);
  const branch = runGit(repoPath, ["branch", "--show-current"]);
  const upstream = runGit(repoPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  const worktrees = runGit(repoPath, ["worktree", "list", "--porcelain"]);
  let ahead = 0;
  let behind = 0;
  if (upstream.ok && upstream.stdout) {
    const counts = runGit(repoPath, ["rev-list", "--left-right", "--count", `${upstream.stdout.trim()}...HEAD`]);
    const [behindRaw, aheadRaw] = counts.stdout.trim().split(/\s+/);
    behind = Number(behindRaw || 0);
    ahead = Number(aheadRaw || 0);
    if (!counts.ok || Number.isNaN(behind) || Number.isNaN(ahead)) {
      behind = 0;
      ahead = 0;
    }
  }
  const statusLines = status.stdout.split("\n").filter((line) => line && !line.startsWith("##"));
  const worktreeCount = worktrees.ok
    ? worktrees.stdout.split("\n").filter((line) => line.startsWith("worktree ")).length
    : 0;
  return {
    id: project.id,
    name: project.name,
    repoPath,
    liveVerificationRequired: project.liveVerificationRequired,
    branch: branch.stdout || "",
    head: head.stdout || "",
    upstream: upstream.stdout || "",
    ahead,
    behind,
    dirty: statusLines.length > 0,
    statusLines,
    worktreeCount,
  };
}

// Shift-left cleanup: once a task worktree's HEAD is merged into canonical AND
// confirmed pushed to origin, the worktree + its task branch are pure debt. Reap
// them at that exact moment (ground-truth published), so state never accumulates.
// Fail-closed: only when the worktree is clean, not the current session's cwd, the
// branch is a generated task/worker name, and every git step succeeds. Never --force.
function reapClosedOutWorktree(worktreeRoot, repoPath, branchName, input) {
  const result = { reaped: false, note: "" };
  const sessionCwd = path.resolve(input.cwd || process.cwd());
  const wt = path.resolve(worktreeRoot);
  if (sessionCwd === wt || isPathInside(wt, sessionCwd)) {
    result.note = "kept: session is running inside this worktree";
    return result;
  }
  if (!/^(task|worker)\//.test(branchName || "")) {
    result.note = "kept: branch is not a generated task/worker branch";
    return result;
  }
  const status = runGit(worktreeRoot, ["status", "--porcelain", "--ignore-submodules=none"]);
  if (!status.ok || status.stdout) {
    result.note = "kept: worktree not clean";
    return result;
  }
  const remove = runGit(repoPath, ["worktree", "remove", worktreeRoot]); // never --force
  if (!remove.ok) {
    result.note = `kept: worktree remove refused (${remove.stderr || remove.stdout})`;
    return result;
  }
  // -d only: refuses if the branch is not fully merged or still checked out elsewhere.
  const del = runGit(repoPath, ["branch", "-d", branchName]);
  result.reaped = true;
  result.note = del.ok ? `reaped worktree + branch ${branchName}` : `reaped worktree; branch ${branchName} kept (${del.stderr})`;
  return result;
}

module.exports = { githubHttpsUrlFrom, pushBranch, commitDirtyWorktree, repoStatusSnapshot, reapClosedOutWorktree };
