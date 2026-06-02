"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { SESSION_DIR } = require("./paths");
const { ensureDir, safeReadJson, sanitizeFileSegment } = require("./io");
const { normalizeSessionState } = require("./domain");

function statePathFor(input) {
  const sessionId = input.session_id || input.sessionId || "local";
  return path.join(SESSION_DIR, `${sanitizeFileSegment(sessionId)}.json`);
}

function loadSessionState(input) {
  ensureDir(SESSION_DIR);
  const filePath = statePathFor(input);
  const state = normalizeSessionState(safeReadJson(filePath, {}) || {}, input);
  return { filePath, state };
}

function saveSessionState(filePath, state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

module.exports = { statePathFor, loadSessionState, saveSessionState };
