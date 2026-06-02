"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { CODEX_ROOT } = require("./paths");
const { runGit } = require("./git");
const { isPathInside } = require("./paths-classify");

// Self-deploy: the guard runs from the canonical checkout's scripts/, but guard fixes are
// pushed to origin/main from isolated worktrees and never reach the canonical working tree
// (the canonical-mutation block stops agents from `git merge`-ing there by hand). So the
// guard updates ITSELF: on SessionStart inside the workspace, fast-forward the canonical
// checkout to origin/<default> when it is strictly behind. STRICT and fail-safe:
//   - only the canonical governance repo (CODEX_ROOT), only on its default branch
//   - only a clean working tree (never clobber uncommitted work)
//   - only a pure fast-forward; if the checkout has local commits ahead, skip (no reset)
//   - any error is swallowed; never blocks SessionStart
// This is the only manual step required once: deploy the FIRST build carrying this logic,
// after which every later guard/governance change auto-deploys. Kill switch:
// CODEX_GUARD_NO_SELF_DEPLOY=1. Timing: this SessionStart process already loaded the old
// script and keeps running it; the fast-forward takes effect on the NEXT hook event (each
// event spawns a fresh `node guard.js`), so no restart is needed but there is a one-event
// lag. TRUST NOTE: this fast-forwards from origin/<default> with no signature/pin check —
// it executes whatever is on the remote default branch, so the remote must be trusted.
function selfDeployCanonicalGuard(input = {}, options = {}) {
  const result = { deployed: false };
  const root = options.root || CODEX_ROOT;
  try {
    if (process.env.CODEX_GUARD_NO_SELF_DEPLOY === "1") return { deployed: false, reason: "disabled" };
    // Only when the session is actually working inside the codex workspace (avoid adding a
    // network fetch to unrelated sessions on this machine).
    const cwd = path.resolve(input.cwd || process.cwd());
    if (!isPathInside(root, cwd)) return { deployed: false, reason: "outside-workspace" };
    if (!fs.existsSync(path.join(root, ".git"))) return { deployed: false, reason: "not-a-repo" };
    const branch = runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const current = branch.ok ? branch.stdout.trim() : "";
    if (!["main", "master"].includes(current)) return { deployed: false, reason: "not-default-branch" };
    const status = runGit(root, ["status", "--porcelain"]);
    if (!status.ok || status.stdout.trim()) return { deployed: false, reason: "dirty" };
    const fetched = runGit(root, ["fetch", "origin", "--quiet"], { timeout: 10000 });
    if (!fetched.ok) return { deployed: false, reason: fetched.timed_out ? "fetch-timeout" : "fetch-failed" };
    const upstream = `origin/${current}`;
    const before = runGit(root, ["rev-parse", "--short", "HEAD"]).stdout;
    const counts = runGit(root, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`]);
    const [behindRaw, aheadRaw] = (counts.stdout || "").trim().split(/\s+/);
    const behind = Number(behindRaw || 0);
    const ahead = Number(aheadRaw || 0);
    if (!counts.ok || Number.isNaN(behind) || behind === 0) return { deployed: false, reason: "up-to-date" };
    if (ahead > 0) return { deployed: false, reason: "diverged-ahead" }; // cannot ff; never reset
    const ff = runGit(root, ["merge", "--ff-only", upstream]);
    if (!ff.ok) return { deployed: false, reason: ff.stderr || "ff-failed" };
    const after = runGit(root, ["rev-parse", "--short", "HEAD"]).stdout;
    return { deployed: true, from: before, to: after };
  } catch {
    return { deployed: false, reason: "exception" };
  }
}

module.exports = { selfDeployCanonicalGuard };
