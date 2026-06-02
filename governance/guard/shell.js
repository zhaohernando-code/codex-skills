"use strict";

const path = require("node:path");

function shellWords(command) {
  const words = [];
  let current = "";
  let quote = "";
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) {
        quote = "";
      } else if (char === "\\" && quote === "\"" && index + 1 < command.length) {
        index += 1;
        current += command[index];
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    if (";|&".includes(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      if ((char === "|" || char === "&") && command[index + 1] === char) index += 1;
      words.push(char);
      continue;
    }
    if (char === "\\" && index + 1 < command.length) {
      index += 1;
      current += command[index];
      continue;
    }
    current += char;
  }
  if (current) words.push(current);
  return words;
}

function isCommandSeparator(word) {
  return word === ";" || word === "|" || word === "&";
}

function looksLikePathArgument(word) {
  return Boolean(word && !word.startsWith("-") && word !== "--");
}

function pathFromShellWord(word, cwd) {
  const value = String(word || "").trim();
  if (!value) return "";
  const expanded = value.replace(/^~(?=\/|$)/, process.env.HOME || "~");
  return path.isAbsolute(expanded) ? expanded : path.resolve(cwd || process.cwd(), expanded);
}

function commandPathCandidates(command, cwd) {
  const words = shellWords(command);
  const candidates = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (isCommandSeparator(word)) continue;

    if (["mkdir", "rmdir", "touch"].includes(word)) {
      for (let cursor = index + 1; cursor < words.length && !isCommandSeparator(words[cursor]); cursor += 1) {
        const arg = words[cursor];
        if (arg === "--") continue;
        if (arg.startsWith("-")) continue;
        if (looksLikePathArgument(arg)) candidates.push(pathFromShellWord(arg, cwd));
      }
      continue;
    }

    if (["rm", "cp", "mv"].includes(word)) {
      for (let cursor = index + 1; cursor < words.length && !isCommandSeparator(words[cursor]); cursor += 1) {
        const arg = words[cursor];
        if (arg === "--") continue;
        if (arg.startsWith("-")) continue;
        if (looksLikePathArgument(arg)) candidates.push(pathFromShellWord(arg, cwd));
      }
      continue;
    }

    if (word === "git") {
      let cursor = index + 1;
      while (cursor < words.length && !isCommandSeparator(words[cursor])) {
        if (words[cursor] === "-C") {
          cursor += 2;
          continue;
        }
        if (words[cursor].startsWith("-c")) {
          cursor += words[cursor] === "-c" ? 2 : 1;
          continue;
        }
        break;
      }
      if (words[cursor] !== "worktree" || words[cursor + 1] !== "add") continue;
      const args = words.slice(cursor + 2);
      let nextIsOptionValue = false;
      const positional = [];
      for (const arg of args) {
        if (isCommandSeparator(arg)) break;
        if (nextIsOptionValue) {
          nextIsOptionValue = false;
          continue;
        }
        if (["-b", "-B", "--detach", "--lock", "--orphan"].includes(arg)) {
          nextIsOptionValue = arg === "-b" || arg === "-B" || arg === "--lock" || arg === "--orphan";
          continue;
        }
        if (arg.startsWith("--reason=")) continue;
        if (arg === "--reason") {
          nextIsOptionValue = true;
          continue;
        }
        if (arg.startsWith("-")) continue;
        positional.push(arg);
      }
      if (positional.length) candidates.push(pathFromShellWord(positional[0], cwd));
    }
  }
  return candidates;
}

module.exports = { shellWords, isCommandSeparator, looksLikePathArgument, pathFromShellWord, commandPathCandidates };
