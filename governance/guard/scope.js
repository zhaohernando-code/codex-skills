"use strict";

const path = require("node:path");
const { CODEX_ROOT } = require("./paths");
const { isPathInside } = require("./paths-classify");

// Scope recovery: this guard is registered globally (Claude's hook discovery does not
// walk up to a project-level settings file, so a project-scoped registration would miss
// the worktrees/subdirectories where real codex work happens). To avoid imposing the
// codex workflow on unrelated sessions, the high-frequency per-tool and closeout gates
// early-exit when the session is demonstrably outside codex: cwd is not inside CODEX_ROOT
// AND nothing in this session has ever routed to a codex project. The cheap router
// (UserPromptSubmit) and baseline (SessionStart) always run, so a later codex-routed
// prompt re-arms the gates within the same session.
function isCodexRelevant(input, state) {
  const cwd = path.resolve(input.cwd || process.cwd());
  if (isPathInside(CODEX_ROOT, cwd)) return true;
  if (state && (state.routes?.length || state.lastRoute || state.mutations?.length)) return true;
  return false;
}

module.exports = { isCodexRelevant };
