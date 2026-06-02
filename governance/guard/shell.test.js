"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { shellWords, isCommandSeparator, looksLikePathArgument, commandPathCandidates } = require("./shell");

test("shellWords tokenizes quotes, escapes, and separators", () => {
  assert.deepEqual(shellWords("echo hello world"), ["echo", "hello", "world"]);
  assert.deepEqual(shellWords("echo 'a b' \"c d\""), ["echo", "a b", "c d"]);
  assert.deepEqual(shellWords("a && b"), ["a", "&", "b"]);
  assert.deepEqual(shellWords("a | b"), ["a", "|", "b"]);
  assert.deepEqual(shellWords("a ; b"), ["a", ";", "b"]);
  // backslash escape outside quotes
  assert.deepEqual(shellWords("a\\ b"), ["a b"]);
});

test("isCommandSeparator / looksLikePathArgument", () => {
  assert.equal(isCommandSeparator(";"), true);
  assert.equal(isCommandSeparator("|"), true);
  assert.equal(isCommandSeparator("&"), true);
  assert.equal(isCommandSeparator("rm"), false);
  assert.equal(looksLikePathArgument("foo"), true);
  assert.equal(looksLikePathArgument("-rf"), false);
  assert.equal(looksLikePathArgument("--"), false);
  assert.equal(looksLikePathArgument(""), false);
});

test("commandPathCandidates extracts mkdir/rm/touch targets, skipping flags", () => {
  const cwd = "/tmp/x";
  assert.deepEqual(commandPathCandidates("mkdir -p foo/bar", cwd), [path.resolve(cwd, "foo/bar")]);
  assert.deepEqual(commandPathCandidates("rm -rf a b", cwd), [path.resolve(cwd, "a"), path.resolve(cwd, "b")]);
  assert.deepEqual(commandPathCandidates("touch file.txt", cwd), [path.resolve(cwd, "file.txt")]);
});

test("commandPathCandidates resolves the worktree-add target, skipping -b/-c/-C and options", () => {
  const cwd = "/tmp/x";
  const got = commandPathCandidates("git -C /repo -c user.name=x worktree add -b task/foo /tmp/x/wt origin/main", cwd);
  assert.deepEqual(got, ["/tmp/x/wt"]);
  // no worktree add => no candidate
  assert.deepEqual(commandPathCandidates("git status", cwd), []);
});
