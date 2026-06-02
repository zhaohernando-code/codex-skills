"use strict";

const EVIDENCE_FLAGS = [
  "validation",
  "liveVerification",
  "docsTouched",
  "processTouched",
  "commitOrMerge",
  "publish",
  "remotePush",
  "closeout",
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createEvidence(overrides = {}) {
  const evidence = {};
  for (const flag of EVIDENCE_FLAGS) {
    evidence[flag] = Boolean(overrides[flag]);
  }
  return evidence;
}

function normalizeSessionState(rawState, input = {}) {
  const state = rawState && typeof rawState === "object" ? rawState : {};
  state.sessionId ||= String(input.session_id || input.sessionId || "local");
  state.startedAt ||= new Date().toISOString();
  state.events = asArray(state.events);
  state.mutations = asArray(state.mutations);
  state.routes = asArray(state.routes);
  state.diagnostics = asArray(state.diagnostics);
  state.evidence = createEvidence(state.evidence || {});
  return state;
}

function appendEvent(state, event, cwd, at = new Date().toISOString()) {
  state.events.push({ at, event, cwd });
  return state;
}

function appendDiagnostic(state, type, details = {}, at = new Date().toISOString()) {
  state.diagnostics.push({ at, type, ...details });
  return state;
}

function appendRoute(state, route, at = new Date().toISOString()) {
  const record = {
    at,
    projectId: route.projectId,
    projectName: route.projectName,
    repoPath: route.repoPath,
    score: route.score,
    reasons: asArray(route.reasons),
    canonicalDocs: asArray(route.canonicalDocs),
  };
  state.routes.push(record);
  state.lastRoute = record;
  return record;
}

function appendMutation(state, mutation, at = new Date().toISOString()) {
  const record = {
    at,
    event: mutation.event || "",
    toolName: mutation.toolName || "",
    projectId: mutation.projectId || "",
    targetPaths: asArray(mutation.targetPaths),
  };
  state.mutations.push(record);
  return record;
}

function markEvidence(state, flags) {
  for (const flag of EVIDENCE_FLAGS) {
    if (flags && Object.prototype.hasOwnProperty.call(flags, flag)) {
      state.evidence[flag] = Boolean(flags[flag]);
    }
  }
  return state.evidence;
}

module.exports = {
  EVIDENCE_FLAGS,
  createEvidence,
  normalizeSessionState,
  appendEvent,
  appendDiagnostic,
  appendRoute,
  appendMutation,
  markEvidence,
};
