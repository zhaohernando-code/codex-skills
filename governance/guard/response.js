"use strict";

function blockResponse(agent, event, reason) {
  if (event === "Stop" || event === "PreCompact" || event === "UserPromptSubmit") {
    return {
      decision: "block",
      reason,
    };
  }
  if (event === "PermissionRequest") {
    return {
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "deny", message: reason },
      },
    };
  }
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

function softPromptResponse(event, message) {
  // 对于Stop/PreCompact等后置hook，使用decision: "allow_with_message"
  // 这样可以在不阻断的情况下显示提示信息
  if (event === "Stop" || event === "PreCompact") {
    return {
      decision: "allow_with_message",
      reason: message,
    };
  }
  // 对于其他hook，使用additionalContext
  return {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: message,
    },
  };
}

function isBlockingResponse(response) {
  if (!response) {
    return false;
  }
  if (response.decision === "block") {
    return true;
  }
  const hookOutput = response.hookSpecificOutput || {};
  return hookOutput.permissionDecision === "deny"
    || hookOutput.decision?.behavior === "deny";
}

module.exports = { blockResponse, softPromptResponse, isBlockingResponse };
