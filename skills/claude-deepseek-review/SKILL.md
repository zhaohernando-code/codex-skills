---
name: claude-deepseek-review
description: Run Claude Code through the user's DeepSeek Anthropic-compatible script for independent reviews, audits, or second-opinion analysis. Use when the user asks to call Claude+DeepSeek, Claude Code running DeepSeek, ds/v4 pro as an external reviewer, or when a task needs an isolated read-only review without changing the project.
---

# Claude DeepSeek Review

Use this skill to run a bounded, non-interactive Claude Code session backed by DeepSeek. The launcher is configured with:

```bash
DEEPSEEK_LAUNCHER=${DEEPSEEK_LAUNCHER:-$HOME/codex/start-claude-deepseek-no-proxy.sh}
```

Do not edit that launcher unless the user explicitly asks. This skill's wrapper sets only process-local options for Codex calls.

## Default Workflow

1. Write a concise prompt file under `/tmp`.
2. Prefer read-only reviews. State explicitly: no edits, no refreshes, no servers, no destructive commands.
3. Prefer monitored bounded review for reliability. Run `scripts/run_claude_deepseek_review.py` with:
   - `--cwd <project-dir>`
   - `--prompt-file <prompt-file>`
   - `--bounded-review`
   - one `--focus-file <path>` per file under review
   - `--tools Read` unless repository-wide search is explicitly required
   - `--timeout-seconds 420` as a hard wall-clock cap for focused reviews
   - `--no-progress-timeout-seconds 120` as the normal timeout signal
   - `--effort high` by default; reserve `--effort max` for high-risk architectural/security reviews
   - monitored stream-json observations are on by default; use `--no-observe` only when raw text output is explicitly needed
4. Treat timeout as "no observable progress," not "the model has not finished." If `DS_OBSERVE` shows thinking, text deltas, tool use, or result progress, keep waiting until the hard cap or no-progress timeout.
5. If a review hits no-progress timeout, treat it as inconclusive. Kill/verify no leftover `claude` process before continuing.
6. If timeout is severe or repeated, split the review by file, topic, or question and rerun with the sharded wrapper instead of retrying the same broad prompt.
7. Summarize what the external review said and whether any recommendation should change the plan.

## Prompt Shape

Keep one call small enough to show progress within 120 seconds and usually finish within 5-7 minutes:

- Prompt body: usually under 500 Chinese characters.
- Files to inspect: 1-3 for normal review, 3-5 maximum for medium review.
- Questions: 1-3 concrete questions per call.
- For large audits, split into phases: structure/diff review, data review, then final synthesis.
- Avoid `Grep,Glob` in review worktrees that contain `tmp/`, `node_modules/`, or generated artifacts. Use bounded review bundles instead.
- Progress beats completion for timeout decisions: `thinking_delta`, `text_delta`, `tool_use`, `message_stop`, and `result` are progress; quiet pings alone are not enough.
- Use the sharded wrapper after repeated no-progress timeout, more than 3 focused files, one large file, or a prompt that asks multiple unrelated questions.
- For sharded review, treat shard-level DS success as the hard requirement. Final synthesis first receives mechanically compacted shard signals; if synthesis still times out, use the wrapper's deterministic local aggregator instead of marking the whole review inconclusive.
- If a single large file shard times out, the sharded wrapper creates a line-numbered excerpt around prompt-relevant terms and retries that excerpt before failing. This prevents large server files from forcing whole-file review.
- If the excerpt still loops on `Read`, the wrapper embeds the excerpt directly in a no-tools prompt so DeepSeek reviews the evidence packet without another file-access loop.
- Use sharded review for more than 3 focused files:

```bash
python3 $CODEX_HOME/skills/claude-deepseek-review/scripts/run_claude_deepseek_sharded_review.py \
  --cwd /path/to/project \
  --focus-file src/workflow/example.js \
  --focus-file test/example.test.js \
  --max-files-per-shard 2 \
  --shard-timeout-seconds 300 \
  --synthesis-timeout-seconds 180 \
  --no-progress-timeout-seconds 120 \
  --excerpt-model deepseek-v4-flash \
  --synthesis-model deepseek-v4-flash \
  --effort high \
  --observe \
  --prompt-file /tmp/review-prompt.md
```

## Command

```bash
python3 $CODEX_HOME/skills/claude-deepseek-review/scripts/run_claude_deepseek_review.py \
  --cwd /path/to/project \
  --bounded-review \
  --focus-file src/workflow/example.js \
  --focus-file test/example.test.js \
  --tools Read \
  --timeout-seconds 420 \
  --no-progress-timeout-seconds 120 \
  --prompt-file /tmp/review-prompt.md
```

For a smoke test:

```bash
printf '只回答 DS_SMOKE_OK。' >/tmp/ds-smoke.md
python3 $CODEX_HOME/skills/claude-deepseek-review/scripts/run_claude_deepseek_review.py \
  --cwd "$HOME" \
  --tools '' \
  --timeout-seconds 90 \
  --no-progress-timeout-seconds 45 \
  --prompt-file /tmp/ds-smoke.md
```

Expected output contains `DS_SMOKE_OK`.

## Guardrails

- Use `--bare -p --no-session-persistence` via the wrapper to avoid plugin sync, keychain, OAuth, and background startup paths; the wrapper chooses monitored `stream-json` by default and raw `text` only with `--no-observe`.
- The wrapper uses monitored `stream-json` output by default while Claude Code runs. No final answer for a while is acceptable when observations show progress.
- The wrapper summarizes runtime states such as requesting, thinking, tool use, text deltas, result, heartbeat, quiet time, and no-progress time without dumping full thinking text.
- `--timeout-seconds` is a hard cap. `--no-progress-timeout-seconds` is the normal failure condition. Do not treat an unfinished but progressing review as timed out.
- Pass `--tools ""` for pure reasoning; pass a small read-only tool set for code review.
- The user's launcher may set max effort for interactive Claude Code. This wrapper overrides Codex reviews to `--effort high` unless explicitly requested, because DeepSeek maps lower Anthropic efforts to high and higher efforts to max; max can spend too long thinking on broad reviews.
- Use DS v4 pro for normal code shards by default, but route excerpt fallback and synthesis to `deepseek-v4-flash` unless high-risk policy explicitly requires pro. This keeps the independent review reliable under plan/time pressure.
- Do not use `Bash`, `Edit`, or write-capable tools unless the user explicitly asks for external execution that needs them.
- Keep prompts small enough to return within the timeout; split large audits into focused questions.
- If a broad review times out but smoke and single-file Read pass, rerun as sharded bounded review with explicit focus files before treating DeepSeek as unhealthy.
- If the sharded wrapper reports `split_on_timeout`, accept that as the intended recovery path; review the shard outputs and synthesis/local aggregation instead of retrying the original broad prompt.
- If the wrapper fails, report stdout/stderr and the exit status. Do not assume DeepSeek is down until a smoke test fails too.
