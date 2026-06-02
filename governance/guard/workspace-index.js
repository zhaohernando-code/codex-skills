"use strict";

const path = require("node:path");
const { safeReadJson } = require("./io");
const { CODEX_ROOT } = require("./paths");

function loadWorkspaceIndex() {
  const index = safeReadJson(path.join(CODEX_ROOT, "WORKSPACE_INDEX.json"), { projects: [] }) || { projects: [] };
  const projects = Array.isArray(index.projects) ? index.projects.slice() : [];
  projects.push({
    project_id: "codex",
    display_name: "Codex Workspace Governance",
    repo_path: CODEX_ROOT,
    runtime_path: "",
    canonical_docs: [
      path.join(CODEX_ROOT, "PROJECT_STATUS.json"),
      path.join(CODEX_ROOT, "CODEX.md"),
      path.join(CODEX_ROOT, "PROCESS.md"),
    ],
    live_verification_required: false,
  });
  return projects
    .filter((project) => project && project.repo_path)
    .map((project) => ({
      id: String(project.project_id || "").trim(),
      name: String(project.display_name || project.project_id || "").trim(),
      repoPath: path.resolve(String(project.repo_path || "")),
      runtimePath: project.runtime_path ? path.resolve(String(project.runtime_path || "")) : "",
      canonicalDocs: Array.isArray(project.canonical_docs) ? project.canonical_docs : [],
      liveVerificationRequired: Boolean(project.live_verification_required || project.entry_routes?.user || project.entry_routes?.canonical),
      projectType: String(project.project_type || ""),
    }))
    .sort((left, right) => right.repoPath.length - left.repoPath.length);
}

module.exports = { loadWorkspaceIndex };
