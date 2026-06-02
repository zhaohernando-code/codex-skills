#!/usr/bin/env node
"use strict";

// Entry shim for the codex workflow guard.
//
// The implementation lives in ./guard/* (split out of a former 1,300-line monolith).
// This file MUST stay at this path: it is hardcoded in scripts/hooks.manifest.json,
// scripts/check-model-hook-parity.js, ~/.claude/settings.json, and
// scripts/codex-hooks.low-noise.json. It MUST keep re-exporting the six symbols below,
// which sibling test files import via require("./agent-workflow-guard.js").

const { CODEX_ROOT } = require("./guard/paths");
const { isPathInside } = require("./guard/paths-classify");
const { runGit } = require("./guard/git");
const { reapClosedOutWorktree } = require("./guard/git-ops");
const { selfDeployCanonicalGuard } = require("./guard/self-deploy");
const { isCodexRelevant } = require("./guard/scope");
const { main } = require("./guard/main");

if (require.main === module) {
  main();
}

module.exports = { isCodexRelevant, isPathInside, CODEX_ROOT, reapClosedOutWorktree, selfDeployCanonicalGuard, runGit };
