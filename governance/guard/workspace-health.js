"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadWorkspaceIndex } = require("./workspace-index");
const { repoStatusSnapshot } = require("./git-ops");

function workspaceSnapshot() {
  return {
    at: new Date().toISOString(),
    repos: loadWorkspaceIndex()
      .filter((project) => fs.existsSync(path.join(project.repoPath, ".git")))
      .map(repoStatusSnapshot),
  };
}

function formatWorkspaceHealth(snapshot, filePath) {
  const repos = snapshot.repos || [];
  const dirty = repos.filter((repo) => repo.dirty);
  const ahead = repos.filter((repo) => repo.ahead > 0);
  const behind = repos.filter((repo) => repo.behind > 0);
  const noUpstream = repos.filter((repo) => !repo.upstream);
  const unusual = repos
    .filter((repo) => repo.dirty || repo.ahead > 0 || repo.behind > 0 || !repo.upstream)
    .slice(0, 8)
    .map((repo) => {
      const flags = [
        repo.dirty ? `dirty:${repo.statusLines.length}` : "",
        repo.ahead > 0 ? `ahead:${repo.ahead}` : "",
        repo.behind > 0 ? `behind:${repo.behind}` : "",
        !repo.upstream ? "no-upstream" : "",
      ].filter(Boolean).join(", ");
      return `- ${repo.id}: ${repo.branch || "(detached)"}${flags ? ` (${flags})` : ""}`;
    });
  return [
    "Workflow guard is active. Use isolated task worktrees for edits; canonical checkouts are read/integration/publish baselines.",
    `Workspace health: ${repos.length} repos checked; ${dirty.length} dirty; ${ahead.length} ahead; ${behind.length} behind; ${noUpstream.length} without upstream.`,
    unusual.length ? `Attention summary:\n${unusual.join("\n")}` : "Attention summary: no dirty/ahead/behind repos detected.",
    `Full workflow snapshot: ${filePath}`,
  ].join("\n");
}

module.exports = { workspaceSnapshot, formatWorkspaceHealth };
