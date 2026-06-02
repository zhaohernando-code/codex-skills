"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isMutation, isRemovalCommand } = require("./mutation");

function bash(command) {
  return { tool_name: "Bash", tool_input: { command } };
}

test("isMutation: edit/write tools are always mutations", () => {
  assert.equal(isMutation({ tool_name: "Write" }), true);
  assert.equal(isMutation({ tool_name: "Edit" }), true);
  assert.equal(isMutation({ tool_name: "apply_patch" }), true);
  assert.equal(isMutation({ tool_name: "Read" }), false);
});

test("isMutation: git branch -d allowed (safe), -D blocked (force) — case sensitive", () => {
  assert.equal(isMutation(bash("git branch -d task/foo")), false);
  assert.equal(isMutation(bash("git branch -D task/foo")), true);
});

test("isMutation: git worktree remove/prune are metadata (not mutations); add is", () => {
  assert.equal(isMutation(bash("git worktree remove /tmp/wt")), false);
  assert.equal(isMutation(bash("git worktree prune")), false);
  assert.equal(isMutation(bash("git worktree add -b b /tmp/wt origin/main")), true);
});

test("isMutation: dangerous file/git/npm ops and redirects", () => {
  assert.equal(isMutation(bash("rm -rf foo")), true);
  assert.equal(isMutation(bash("git commit -m x")), true);
  assert.equal(isMutation(bash("git add .")), true);
  assert.equal(isMutation(bash("npm run build")), true);
  assert.equal(isMutation(bash("npm install")), true);
  assert.equal(isMutation(bash("echo x > file")), true);
  assert.equal(isMutation(bash("ls -la")), false);
  assert.equal(isMutation(bash("git status")), false);
});

test("isRemovalCommand matches a standalone rm/rmdir token", () => {
  assert.equal(isRemovalCommand("rm -rf x"), true);
  assert.equal(isRemovalCommand("rmdir x"), true);
  assert.equal(isRemovalCommand("ls && rm x"), true);
  assert.equal(isRemovalCommand("npm run build"), false);
  // Note: "git rm" also matches the rm token. That is acceptable for the
  // harmless-removal exemption because every blocked target must still
  // independently pass isGitignoredEmptyDir (empty + gitignored dir), which a
  // tracked file removed by `git rm` cannot satisfy.
  assert.equal(isRemovalCommand("git rm x"), true);
});
