"use strict";

const path = require("node:path");
const { commandPathCandidates } = require("./shell");

function toolCommand(input) {
  const toolInput = input.tool_input || input.toolInput || {};
  return String(toolInput.command || toolInput.cmd || toolInput.patch || "");
}

function toolTargetPaths(input) {
  const toolInput = input.tool_input || input.toolInput || {};
  const candidates = [
    toolInput.file_path,
    toolInput.path,
    toolInput.cwd,
    toolInput.workdir,
  ].filter(Boolean);
  const command = toolCommand(input);
  const fileMatches = command.matchAll(/^\*{3}\s+(?:Add|Update|Delete) File:\s+(.+)$/gm);
  for (const match of fileMatches) {
    candidates.push(match[1]);
  }
  const redirectMatch = command.match(/>>?\s*((?:\/|~\/)[^\s;|&]+)/);
  if (redirectMatch) {
    const redir = redirectMatch[1].replace(/^~\//, (process.env.HOME || "~") + "/");
    candidates.push(path.resolve(redir));
  }
  candidates.push(...commandPathCandidates(command, input.cwd || process.cwd()));
  if (!candidates.length) {
    candidates.push(input.cwd || process.cwd());
  }
  return candidates.map((candidate) => {
    const value = String(candidate || "").trim();
    return path.isAbsolute(value) ? value : path.resolve(input.cwd || process.cwd(), value);
  });
}

module.exports = { toolCommand, toolTargetPaths };
