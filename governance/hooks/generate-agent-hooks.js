#!/usr/bin/env node
"use strict";

// Renders scripts/hooks.manifest.json (the single source of truth) into every agent
// surface's hook configuration. Edit the manifest, never the rendered files.
//   --write   deploy rendered hooks into every target (preserving unrelated fields)
//   --check   re-render and diff against each target; exit non-zero on drift (CI/closeout)
// With no flag, defaults to --check.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(ROOT, "scripts", "hooks.manifest.json");

function expandPath(p) {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  if (!path.isAbsolute(p)) return path.join(ROOT, p);
  return p;
}

function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
}

// Build the `hooks` object for one surface: { EventName: [ { matcher?, hooks:[{type,command,timeout}] } ] }
function renderHooks(manifest, surfaceKey) {
  const surface = manifest.surfaces[surfaceKey];
  const out = {};
  for (const eventName of surface.events) {
    const eventDef = manifest.events[eventName];
    if (!eventDef) {
      throw new Error(`manifest: surface ${surfaceKey} references unknown event ${eventName}`);
    }
    const entry = {};
    if (eventDef.matcher) entry.matcher = eventDef.matcher;
    entry.hooks = [
      {
        type: "command",
        command: `node ${manifest.guardScript} --agent ${surface.agent} --event ${eventName}`,
        timeout: manifest.timeout,
      },
    ];
    out[eventName] = [entry];
  }
  return out;
}

module.exports = { loadManifest, renderHooks, expandPath, ROOT, MANIFEST };

if (require.main === module) {
  require("./generate-agent-hooks.run.js").main();
}
