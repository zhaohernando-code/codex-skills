"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { CODEX_ROOT } = require("./paths");
const { loadWorkspaceIndex } = require("./workspace-index");

function normalizeForContainment(value) {
  const resolved = path.resolve(value || "");
  let existing = resolved;
  while (existing && !fs.existsSync(existing) && existing !== path.dirname(existing)) {
    existing = path.dirname(existing);
  }
  try {
    const realExisting = fs.realpathSync(existing);
    return path.join(realExisting, path.relative(existing, resolved));
  } catch {
    return resolved;
  }
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(normalizeForContainment(parentPath), normalizeForContainment(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizePathText(value) {
  return String(value || "").trim().toLowerCase();
}

function projectFromWorktreePath(projects, rootPath, resolvedPath) {
  if (!isPathInside(rootPath, resolvedPath)) return null;
  const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9一-鿿]+/g, "");
  const key = normalize(path.relative(normalizeForContainment(rootPath), normalizeForContainment(resolvedPath)).split(path.sep).filter(Boolean)[0]);
  return projects.find((project) => normalize(project.id) === key) || null;
}

function classifyPath(candidatePath) {
  const resolved = path.resolve(candidatePath || CODEX_ROOT);
  const projects = loadWorkspaceIndex();
  const workerRoot = path.join(CODEX_ROOT, "worker-workspaces");
  const serverWorktreeRoot = path.join(CODEX_ROOT, ".codex-system", "worktrees");
  const worktreeProject = projectFromWorktreePath(projects, workerRoot, resolved) || projectFromWorktreePath(projects, serverWorktreeRoot, resolved);
  const repoProject = projects.find((item) => isPathInside(item.repoPath, resolved)) || null;
  return {
    path: resolved,
    project: worktreeProject || repoProject,
    inWorkerWorktree: isPathInside(workerRoot, resolved),
    inServerWorktree: isPathInside(serverWorktreeRoot, resolved),
    inCanonical: Boolean(repoProject && isPathInside(repoProject.repoPath, resolved)),
  };
}

module.exports = { normalizeForContainment, isPathInside, normalizePathText, projectFromWorktreePath, classifyPath };
