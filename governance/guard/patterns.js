"use strict";

// Shared detection regexes used across detectors, evidence, and event handlers.
const COMPLETION_RE = /\b(done|complete|completed|implemented|fixed|verified|published|merged)\b|完成|已完成|实现|已实现|修复|已修复|验证|已验证|发布|已发布|合入|已合入/i;
const HANDOFF_PAUSE_RE = /\b(pause|paused|handoff|stop here|do not continue|no further tasks|not complete|not completed|not marking (this )?complete|not published|not merged|not live|defer|deferred)\b|暂停|停止|停下|交接|移交|不要继续|不再继续|不要再|新会话|未完成|不能算完成|不算完成|不标记完成|未发布|未合入|未上线|不发布|不合并|不推送/i;
const VALIDATION_RE = /\b(npm\s+test|npm\s+run\s+(build|check|test)|node\s+--test|pytest|ruff|tsc\b|vite\s+build|curl\b|playwright|safari|browser|health)\b/i;
const CLOSEOUT_RE = /\b(npm\s+run\s+(check:closeout|closeout)|node\s+scripts\/check-workflow-closeout\.js|check-workflow-closeout|check-mainline-release-readiness|mainline-release-readiness|check:closeout)\b/i;
const LIVE_RE = /hernando-zhao\.cn|\/middle\b|\/stocks\b|\/chat\b|\/projects\/|\/tools\/|safari|browser/i;
const CURRENT_STATE_DOC_RE = /\b(PROJECT_STATUS\.json|DECISIONS\.md|PROJECT_RULES\.md|README\.md|CODEX\.md|CLAUDE\.md|WORKSPACE_PROMPT\.md|KNOWN_TRAPS\.md|AGENTS\.md|HANDOFF\.md)\b/;
const PROCESS_DOC_RE = /\bPROCESS\.md\b/;
const LIVE_APPLY_RE = /publish|published|deployed|synced|rsync|restart(?:ed)?|kickstart(?:ed)?|reloaded?|launchctl|发布|已发布|部署|已部署|同步|已同步|重启|已重启|重载|已重载|重新加载/i;
const LIVE_VERIFY_RE = /verified|validated|browser|safari|chrome|served|live|canonical|public route|public endpoint|验收|验证|浏览器|真实入口|真实路由|公网|公网路由|线上/i;
const LIVE_CLOSEOUT_RE = new RegExp(
  `(${LIVE_APPLY_RE.source}).{0,120}(${LIVE_VERIFY_RE.source})|(${LIVE_VERIFY_RE.source}).{0,120}(${LIVE_APPLY_RE.source})`,
  "i",
);

module.exports = {
  COMPLETION_RE,
  HANDOFF_PAUSE_RE,
  VALIDATION_RE,
  CLOSEOUT_RE,
  LIVE_RE,
  CURRENT_STATE_DOC_RE,
  PROCESS_DOC_RE,
  LIVE_APPLY_RE,
  LIVE_VERIFY_RE,
  LIVE_CLOSEOUT_RE,
};
