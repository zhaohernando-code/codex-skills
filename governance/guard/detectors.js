"use strict";

const { loadWorkspaceIndex } = require("./workspace-index");
const { normalizePathText } = require("./paths-classify");

function detectExecutionContext() {
  return process.env.CODEX_AUTOMATED_WORKFLOW === "1"
    ? "automated_workflow"
    : "personal_development";
}

function detectSessionType(input, state) {
  const prompt = String(input.prompt || input.last_assistant_message || input.lastAssistantMessage || "");

  // 答疑类会话
  if (/(为什么|请问|怎么|如何|是什么|是否|能否|会不会|有没有|\?|？|\bwhy\b|\bhow\b|\bwhat\b)/i.test(prompt)) {
    return "inquiry";
  }

  // 规划类会话
  if (/(计划|设计|方案|架构|plan|design)/i.test(prompt) && !state.mutations.length) {
    return "planning";
  }

  // 开发类会话
  if (state.mutations.length > 0 || (state.lastPromptIntent && state.lastPromptIntent.hasActionIntent)) {
    return "development";
  }

  return "unknown";
}

function hasPromptActionIntent(prompt) {
  const text = String(prompt || "").trim();
  if (!text) return false;
  if (/(为什么|请问|怎么|如何|是什么|是否|能否|会不会|有没有|\?|？|\bwhy\b|\bhow\b|\bwhat\b)/i.test(text)) {
    return false;
  }
  return /(修复|修改|改掉|更改|更新|移除|删除|加固|实现|处理|提交|推送|合入|发布|保证|应用|覆盖|创建|新增|调整|fix|change|update|remove|delete|harden|implement|commit|push|merge|publish)/i.test(text);
}

function resolvePromptPathRoute(prompt) {
  const query = normalizePathText(prompt);
  if (!query) return null;
  for (const project of loadWorkspaceIndex()) {
    for (const candidatePath of [project.repoPath, project.runtimePath].filter(Boolean)) {
      const normalizedPath = normalizePathText(candidatePath);
      if (normalizedPath && query.includes(normalizedPath)) {
        return { project, score: 1000, reasons: [`path:${candidatePath}`] };
      }
    }
  }
  return null;
}

module.exports = { detectExecutionContext, detectSessionType, hasPromptActionIntent, resolvePromptPathRoute };
