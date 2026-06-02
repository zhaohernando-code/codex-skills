"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  EVIDENCE_FLAGS,
  appendDiagnostic,
  appendEvent,
  appendMutation,
  appendRoute,
  createEvidence,
  markEvidence,
  normalizeSessionState,
} = require("./domain");

test("createEvidence normalizes every evidence flag to a boolean", () => {
  assert.deepEqual(createEvidence({ validation: true, remotePush: 1, unknown: true }), {
    validation: true,
    liveVerification: false,
    docsTouched: false,
    processTouched: false,
    commitOrMerge: false,
    publish: false,
    remotePush: true,
    closeout: false,
  });
  assert.equal(EVIDENCE_FLAGS.length, Object.keys(createEvidence()).length);
});

test("normalizeSessionState preserves legacy state and backfills missing arrays", () => {
  const state = normalizeSessionState({
    evidence: { validation: true },
    events: "bad",
    mutations: [{ projectId: "codex" }],
  }, { session_id: "s1" });

  assert.equal(state.sessionId, "s1");
  assert.deepEqual(state.events, []);
  assert.deepEqual(state.routes, []);
  assert.deepEqual(state.diagnostics, []);
  assert.deepEqual(state.mutations, [{ projectId: "codex" }]);
  assert.equal(state.evidence.validation, true);
  assert.equal(state.evidence.closeout, false);
});

test("append helpers produce the session-state contract shape", () => {
  const state = normalizeSessionState({}, { session_id: "s2" });

  appendEvent(state, "SessionStart", "/tmp/cwd", "2026-06-01T00:00:00.000Z");
  const route = appendRoute(state, {
    projectId: "codex",
    projectName: "Codex Workspace Governance",
    repoPath: "/repo",
    score: 1000,
    reasons: ["cwd:worktree"],
    canonicalDocs: ["PROJECT_STATUS.json"],
  }, "2026-06-01T00:00:01.000Z");
  appendMutation(state, {
    event: "PreToolUse",
    toolName: "apply_patch",
    projectId: "codex",
    targetPaths: ["scripts/guard/domain.js"],
  }, "2026-06-01T00:00:02.000Z");
  appendDiagnostic(state, "test_diagnostic", { reason: "ok" }, "2026-06-01T00:00:03.000Z");
  markEvidence(state, { validation: true, docsTouched: true, unknown: true });

  assert.equal(state.events[0].event, "SessionStart");
  assert.equal(state.lastRoute, route);
  assert.equal(state.mutations[0].toolName, "apply_patch");
  assert.deepEqual(state.diagnostics[0], {
    at: "2026-06-01T00:00:03.000Z",
    type: "test_diagnostic",
    reason: "ok",
  });
  assert.equal(state.evidence.validation, true);
  assert.equal(state.evidence.docsTouched, true);
  assert.equal(state.evidence.unknown, undefined);
});
