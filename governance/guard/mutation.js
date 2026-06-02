"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { runGit, gitRootForPath } = require("./git");
const { toolCommand } = require("./tool-input");

function isMutation(input) {
  const toolName = String(input.tool_name || input.toolName || "").toLowerCase();
  if (/apply_patch|edit|write|multiedit|notebookedit/.test(toolName)) {
    return true;
  }
  const command = toolCommand(input);
  if (!command) {
    return false;
  }

  // Git metadata operations that don't mutate working tree files
  // Check these FIRST before dangerous operations
  // Note: These patterns are case-sensitive to distinguish -d from -D
  const gitMetadataOps = [
    /(^|\s)git\s+branch\s+-d\s/,           // Safe branch delete (merged only) - lowercase d
    /(^|\s)git\s+worktree\s+remove\b/i,    // Remove worktree
    /(^|\s)git\s+worktree\s+prune\b/i,     // Prune worktree metadata
  ];
  if (gitMetadataOps.some((pattern) => pattern.test(command))) {
    return false;
  }

  // Check dangerous operations (these ARE mutations)
  const dangerousOps = [
    /(^|\s)(apply_patch|tee|touch|mv|cp|rm|mkdir|rmdir)\b/i,
    /(^|\s)git\s+(add|commit|merge|rebase)\b/i,
    /(^|\s)git\s+branch\s+-D\s/,  // Force delete is dangerous - uppercase D (case-sensitive)
    /(^|\s)git\b[\s\S]*\bworktree\s+add\b/i,
    /(^|\s)npm\s+run\s+(build|check)\b/i,
    /(^|\s)npm\s+(install|ci)\b/i,
    /(^|\s)python3?\b.*\b(write|open\(|Path\()/i,
    /(^|\s)(>|>>)/,
  ];

  if (dangerousOps.some((pattern) => pattern.test(command))) {
    return true;
  }

  return false;
}

function isRemovalCommand(command) {
  // Only rm / rmdir invocations qualify for the harmless-removal exemption.
  return /(^|\s|;|&|\|)(rm|rmdir)(\s|$)/.test(String(command || ""));
}

function isGitignoredEmptyDir(targetPath) {
  // Harmless when ALL hold: path exists, is a directory, contains no files at
  // any depth, and git ignores it. Used to allow cleanup of runtime artifacts
  // (e.g. nested worker-workspaces bug dirs) without opening a general rm hole.
  const resolved = path.resolve(targetPath || "");
  if (!resolved || !fs.existsSync(resolved)) {
    return false;
  }
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return false;
  }
  if (!stat.isDirectory()) {
    return false;
  }
  // Reject if any regular file exists anywhere under the directory tree.
  const stack = [resolved];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(child);
      } else {
        return false; // any non-directory entry => not empty => not harmless
      }
    }
  }
  // Must be git-ignored (check-ignore exits 0 when ignored).
  const repoRoot = gitRootForPath(resolved);
  if (!repoRoot) {
    return false;
  }
  const ignored = runGit(repoRoot, ["check-ignore", "-q", resolved]);
  return ignored.ok;
}

function isHarmlessGitignoredEmptyDirRemoval(input, blockedTargets) {
  const command = toolCommand(input);
  if (!isRemovalCommand(command)) {
    return false;
  }
  if (!blockedTargets.length) {
    return false;
  }
  // Every blocked target must independently be a gitignored empty directory.
  return blockedTargets.every((item) => isGitignoredEmptyDir(item.path));
}

module.exports = { isMutation, isRemovalCommand, isGitignoredEmptyDir, isHarmlessGitignoredEmptyDirRemoval };
