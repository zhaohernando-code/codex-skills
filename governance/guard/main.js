"use strict";

const { parseArgs, readStdinJson, printJson } = require("./io");
const { loadSessionState, saveSessionState } = require("./session-state");
const { isCodexRelevant } = require("./scope");
const { isBlockingResponse } = require("./response");
const { recordEvidence } = require("./evidence");
const { appendEvent } = require("./domain");
const { sessionStart, userPromptSubmit, preToolUse, postToolUse, compactGate } = require("./handlers");
const { stopGate } = require("./stop-gate");

function main() {
  const args = parseArgs(process.argv);
  const input = readStdinJson();
  const event = args.event || input.hook_event_name || input.hookEventName || "";
  const { filePath, state } = loadSessionState(input);
  appendEvent(state, event, input.cwd || process.cwd());

  let response = null;
  if (event === "SessionStart") {
    response = sessionStart(input, state, filePath);
  } else if (event === "UserPromptSubmit") {
    response = userPromptSubmit(input, state);
  } else if (!isCodexRelevant(input, state)) {
    // Outside CODEX_ROOT with no codex route this session: skip the per-tool and
    // closeout gates so unrelated agent sessions are not governed by the codex workflow.
    response = null;
  } else if (event === "PreToolUse" || event === "PermissionRequest") {
    response = preToolUse(input, state, args.agent, event);
  } else if (event === "PostToolUse" || event === "PostToolUseFailure" || event === "PostToolBatch") {
    recordEvidence(state, input);
    response = postToolUse(input, state, args.agent, event);
  } else if (event === "Stop" || event === "SubagentStop") {
    response = stopGate(input, state, args.agent, "Stop");
  } else if (event === "PreCompact") {
    response = compactGate(input, state, args.agent, event);
  }

  saveSessionState(filePath, state);
  if (response) {
    printJson(response);
    if (args.agent === "claude" && isBlockingResponse(response)) {
      process.exitCode = 2;
    }
  }
}

module.exports = { main };
