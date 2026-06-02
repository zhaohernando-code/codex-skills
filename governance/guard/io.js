"use strict";

const fs = require("node:fs");

function parseArgs(argv) {
  const args = { agent: "codex", event: "" };
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1] || "";
    if (key === "--agent") {
      args.agent = value || args.agent;
      index += 1;
    } else if (key === "--event") {
      args.event = value || args.event;
      index += 1;
    }
  }
  return args;
}

function readStdinJson() {
  const input = fs.readFileSync(0, "utf8").trim();
  if (!input) {
    return {};
  }
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

function safeReadJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeFileSegment(value) {
  return String(value || "session")
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .slice(0, 120) || "session";
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

module.exports = { parseArgs, readStdinJson, safeReadJson, ensureDir, sanitizeFileSegment, printJson };
