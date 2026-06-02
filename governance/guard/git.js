"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function runGit(repoPath, args, opts = {}) {
  // Always bound git calls: a hook runs synchronously, so a hung git (unreachable remote,
  // held index.lock, auth prompt) would block the whole event. Default cap 30s; callers
  // doing network I/O (fetch) pass a tighter one. On timeout spawnSync sets error + null
  // status, so `ok` is correctly false and callers fail closed.
  const result = spawnSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    timeout: Number(opts.timeout || 30000),
    // Never let git block on an interactive credential/passphrase prompt inside a hook.
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return {
    ok: result.status === 0,
    status: result.status,
    timed_out: result.error?.code === "ETIMEDOUT",
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || result.error?.message || "").trim(),
  };
}

function gitRootForPath(pathname) {
  let current = path.resolve(pathname || process.cwd());
  if (fs.existsSync(current) && !fs.statSync(current).isDirectory()) {
    current = path.dirname(current);
  }
  const root = runGit(current, ["rev-parse", "--show-toplevel"]);
  return root.ok && root.stdout ? path.resolve(root.stdout) : "";
}

module.exports = { runGit, gitRootForPath };
