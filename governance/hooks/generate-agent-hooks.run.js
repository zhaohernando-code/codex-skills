"use strict";

// Write/check driver for generate-agent-hooks.js. Split out so the core (loadManifest,
// renderHooks) stays importable by the parity checker without running CLI side effects.

const fs = require("node:fs");
const path = require("node:path");
const { loadManifest, renderHooks, expandPath } = require("./generate-agent-hooks.js");

const STABLE = 2; // JSON indent, matches existing hand-written configs

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// Produce the full desired file content (as an object) for a target, given the rendered
// hooks block. claude-settings preserves every non-hook field already on disk; codex-hooks
// owns the whole file ({ hooks }).
function desiredContent(target, renderedHooks) {
  const filePath = expandPath(target.path);
  if (target.kind === "claude-settings") {
    const existing = readJsonIfExists(filePath) || {};
    return { ...existing, hooks: renderedHooks };
  }
  if (target.kind === "codex-hooks") {
    return { hooks: renderedHooks };
  }
  throw new Error(`unknown target kind: ${target.kind}`);
}

function serialize(obj) {
  return `${JSON.stringify(obj, null, STABLE)}\n`;
}

function eachTarget(manifest, fn) {
  for (const [surfaceKey, surface] of Object.entries(manifest.surfaces)) {
    const renderedHooks = renderHooks(manifest, surfaceKey);
    for (const target of surface.targets) {
      fn({ surfaceKey, target, renderedHooks, filePath: expandPath(target.path) });
    }
  }
}

function runWrite(manifest, { liveOnly, templateOnly }) {
  const written = [];
  eachTarget(manifest, ({ target, renderedHooks, filePath }) => {
    if (liveOnly && !target.live) return;
    if (templateOnly && target.live) return;
    const content = serialize(desiredContent(target, renderedHooks));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    written.push(filePath);
  });
  return written;
}

function runCheck(manifest, { liveOnly, templateOnly }) {
  const drift = [];
  eachTarget(manifest, ({ target, renderedHooks, filePath }) => {
    if (liveOnly && !target.live) return;
    if (templateOnly && target.live) return;
    if (!fs.existsSync(filePath)) {
      drift.push(`${filePath}: missing (run --write)`);
      return;
    }
    const actual = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const expectedHooks = desiredContent(target, renderedHooks).hooks;
    if (JSON.stringify(actual.hooks) !== JSON.stringify(expectedHooks)) {
      drift.push(`${filePath}: hooks block differs from manifest render`);
    }
  });
  return drift;
}

function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--write") ? "write" : "check";
  const opts = {
    liveOnly: args.includes("--live-only"),
    templateOnly: args.includes("--template-only"),
  };
  const manifest = loadManifest();

  if (mode === "write") {
    const written = runWrite(manifest, opts);
    process.stdout.write(`[generate-agent-hooks] wrote ${written.length} target(s):\n`);
    for (const f of written) process.stdout.write(`  - ${f}\n`);
    return;
  }

  const drift = runCheck(manifest, opts);
  if (drift.length) {
    process.stderr.write(`[generate-agent-hooks] hook drift detected:\n- ${drift.join("\n- ")}\n`);
    process.stderr.write("Run: node scripts/generate-agent-hooks.js --write\n");
    process.exitCode = 1;
  } else {
    process.stdout.write("[generate-agent-hooks] all targets match manifest\n");
  }
}

module.exports = { desiredContent, serialize, runCheck, runWrite, readJsonIfExists, main };

if (require.main === module) main();
