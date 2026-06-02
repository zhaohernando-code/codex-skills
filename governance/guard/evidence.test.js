"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isDocOnlyPath, processOnlyMutations, isCompletionClaim } = require("./evidence");

test("isDocOnlyPath: markdown/docs/state files are doc-only; code is not", () => {
  assert.equal(isDocOnlyPath("README.md"), true);
  assert.equal(isDocOnlyPath("notes.txt"), true);
  assert.equal(isDocOnlyPath("docs/architecture/x.json"), true);
  assert.equal(isDocOnlyPath("PROJECT_STATUS.json"), true);
  assert.equal(isDocOnlyPath("PROCESS.md"), true);
  assert.equal(isDocOnlyPath("scripts/guard/mutation.js"), false);
  assert.equal(isDocOnlyPath("src/index.ts"), false);
  // data JSON that is not a known state doc is code-affecting
  assert.equal(isDocOnlyPath("config/app.json"), false);
});

test("processOnlyMutations: true only when every mutation touches PROCESS.md alone", () => {
  assert.equal(processOnlyMutations({ mutations: [] }), false);
  assert.equal(processOnlyMutations({ mutations: [{ targetPaths: ["PROCESS.md"] }] }), true);
  assert.equal(processOnlyMutations({ mutations: [{ targetPaths: ["a/PROCESS.md"] }, { targetPaths: ["PROCESS.md"] }] }), true);
  assert.equal(processOnlyMutations({ mutations: [{ targetPaths: ["PROCESS.md"] }, { targetPaths: ["src/x.js"] }] }), false);
  assert.equal(processOnlyMutations({ mutations: [{ targetPaths: [] }] }), false);
});

test("isCompletionClaim: completion words count unless a handoff/pause phrase is present", () => {
  assert.equal(isCompletionClaim("task complete"), true);
  assert.equal(isCompletionClaim("已完成"), true);
  assert.equal(isCompletionClaim("fixed the bug"), true);
  // handoff/pause suppresses the claim
  assert.equal(isCompletionClaim("not complete yet"), false);
  assert.equal(isCompletionClaim("完成了一部分，但未完成"), false);
  assert.equal(isCompletionClaim("pausing here, handoff to next session"), false);
  assert.equal(isCompletionClaim("still investigating"), false);
});
