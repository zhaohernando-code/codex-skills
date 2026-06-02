"use strict";

// Env-derived workspace constants. Evaluated once at import time; do NOT mutate
// process.env after requiring this module and expect these to change.
const path = require("node:path");

const DEFAULT_ROOT = path.resolve(__dirname, "..", "..");
const CODEX_ROOT = path.resolve(process.env.CODEX_WORKFLOW_ROOT || process.env.CODEX_CONTROL_ROOT || DEFAULT_ROOT);
const SESSION_DIR = path.join(CODEX_ROOT, ".codex-system", "workflow-sessions");

module.exports = { DEFAULT_ROOT, CODEX_ROOT, SESSION_DIR };
