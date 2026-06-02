#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import selectors
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path


DEFAULT_LAUNCHER = Path.home() / "codex" / "start-claude-deepseek-no-proxy.sh"
LAUNCHER = Path(os.environ.get("DEEPSEEK_LAUNCHER", str(DEFAULT_LAUNCHER))).expanduser()
OBSERVE_HEARTBEAT_SECONDS = 10


def normalize_focus_path(value: str, cwd: Path) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = cwd / path
    return path.resolve()


def bundle_relative_path(path: Path, cwd: Path) -> Path:
    try:
        return path.relative_to(cwd.resolve())
    except ValueError:
        return Path("_external") / path.name


def build_review_bundle(focus_files: list[str], cwd: Path) -> tuple[Path, str]:
    bundle = Path(tempfile.mkdtemp(prefix="claude-deepseek-review-"))
    files_root = bundle / "files"
    manifest_lines = [
        "# Bounded Review Files",
        "",
        "Only inspect the files listed below. Do not search the original repository.",
        ""
    ]

    for raw in focus_files:
        source = normalize_focus_path(raw, cwd)
        if not source.exists() or not source.is_file():
            raise FileNotFoundError(f"focus_file_not_found: {source}")
        relative = bundle_relative_path(source, cwd)
        target = files_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        manifest_lines.append(f"- `{target.relative_to(bundle)}` from `{source}`")

    (bundle / "REVIEW_FILES.md").write_text("\n".join(manifest_lines) + "\n", encoding="utf-8")
    return bundle, "\n".join(manifest_lines)


def bounded_prompt(original_prompt: str, manifest: str) -> str:
    return "\n".join([
        "Bounded review mode.",
        "",
        "Rules:",
        "- Use only the files copied into this temporary review bundle.",
        "- Prefer Read. Do not use Grep or Glob unless the prompt explicitly requires search.",
        "- Do not inspect node_modules, tmp, legacy, or the original repository.",
        "- Keep the answer concise and answer the user's review questions directly.",
        "",
        manifest,
        "",
        "User review request:",
        original_prompt
    ])


def process_snapshot(pid: int) -> str:
    try:
        output = subprocess.check_output(
            ["ps", "-o", "stat=,etime=,pcpu=,pmem=", "-p", str(pid)],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "process=unavailable"
    return "process=" + " ".join(output.split())


def summarize_stream_json_line(line: str, stream, counters: dict[str, int]) -> bool:
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        stream.write(line)
        stream.flush()
        return bool(line.strip())

    event_type = event.get("type")
    made_progress = False
    if event_type == "system":
        subtype = event.get("subtype")
        if subtype == "init":
            tools = ",".join(event.get("tools", []))
            stream.write(
                f"DS_OBSERVE init model={event.get('model')} cwd={event.get('cwd')} tools={tools}\n"
            )
        elif subtype == "status":
            stream.write(f"DS_OBSERVE status={event.get('status')}\n")
        else:
            stream.write(f"DS_OBSERVE system subtype={subtype}\n")
        made_progress = True
    elif event_type == "stream_event":
        payload = event.get("event", {})
        payload_type = payload.get("type")
        if payload_type == "content_block_start":
            content_type = payload.get("content_block", {}).get("type")
            stream.write(f"DS_OBSERVE block_start type={content_type}\n")
            made_progress = True
        elif payload_type == "content_block_delta":
            delta = payload.get("delta", {})
            delta_type = delta.get("type")
            if delta_type == "thinking_delta":
                delta_len = len(delta.get("thinking", ""))
                counters["thinking_chars"] = counters.get("thinking_chars", 0) + delta_len
                if counters["thinking_chars"] == len(delta.get("thinking", "")) or counters["thinking_chars"] % 200 == 0:
                    stream.write(f"DS_OBSERVE thinking chars={counters['thinking_chars']}\n")
                made_progress = delta_len > 0
            elif delta_type == "text_delta":
                delta_len = len(delta.get("text", ""))
                counters["text_chars"] = counters.get("text_chars", 0) + delta_len
                if counters["text_chars"] == len(delta.get("text", "")) or counters["text_chars"] % 200 == 0:
                    stream.write(f"DS_OBSERVE text_delta total_chars={counters['text_chars']}\n")
                made_progress = delta_len > 0
            elif delta_type == "input_json_delta":
                delta_len = len(delta.get("partial_json", ""))
                counters["tool_input_chars"] = counters.get("tool_input_chars", 0) + delta_len
                if counters["tool_input_chars"] == len(delta.get("partial_json", "")) or counters["tool_input_chars"] % 200 == 0:
                    stream.write(f"DS_OBSERVE tool_input chars={counters['tool_input_chars']}\n")
                made_progress = delta_len > 0
        elif payload_type == "content_block_stop":
            stream.write(f"DS_OBSERVE block_stop index={payload.get('index')}\n")
            made_progress = True
        elif payload_type == "message_stop":
            stream.write("DS_OBSERVE message_stop\n")
            made_progress = True
        elif payload_type == "message_delta":
            delta = payload.get("delta", {})
            stream.write(f"DS_OBSERVE message_delta stop_reason={delta.get('stop_reason')}\n")
            made_progress = True
        elif payload_type in {"message_start", "ping"}:
            return False
        else:
            stream.write(f"DS_OBSERVE stream_event type={payload_type}\n")
            made_progress = True
    elif event_type == "assistant":
        message = event.get("message", {})
        for content in message.get("content", []):
            if content.get("type") == "tool_use":
                stream.write(f"DS_OBSERVE tool_use name={content.get('name')} id={content.get('id')}\n")
                made_progress = True
            elif content.get("type") == "text":
                text = content.get("text", "")
                if text:
                    stream.write(f"DS_OBSERVE assistant_text chars={len(text)}\n")
                    made_progress = True
    elif event_type == "result":
        stream.write(
            "DS_OBSERVE result "
            f"subtype={event.get('subtype')} duration_ms={event.get('duration_ms')} "
            f"api_ms={event.get('duration_api_ms')} turns={event.get('num_turns')} "
            f"terminal_reason={event.get('terminal_reason')}\n"
        )
        result = event.get("result", "")
        if result:
            sys.stdout.write(result)
            if not result.endswith("\n"):
                sys.stdout.write("\n")
            sys.stdout.flush()
        made_progress = True
    else:
        stream.write(f"DS_OBSERVE event type={event_type}\n")
        made_progress = True
    stream.flush()
    return made_progress


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Claude Code through the user's DeepSeek launcher.")
    parser.add_argument("--prompt-file", required=True, type=Path)
    parser.add_argument("--cwd", default=".", type=Path)
    parser.add_argument("--add-dir", action="append", default=[])
    parser.add_argument("--tools", default=None)
    parser.add_argument("--timeout-seconds", type=int, default=420, help="Hard wall-clock cap; no-progress timeout is the normal timeout signal.")
    parser.add_argument("--no-progress-timeout-seconds", type=int, default=120, help="Abort only when no observable progress arrives for this many seconds.")
    parser.add_argument("--max-budget-usd", default="1")
    parser.add_argument("--model", default="")
    parser.add_argument("--effort", default="high", choices=["high", "max"])
    parser.add_argument("--bounded-review", action="store_true")
    parser.add_argument("--focus-file", action="append", default=[])
    parser.add_argument("--observe", action="store_true", help="Use stream-json and print concise runtime state. This is the default unless --no-observe is set.")
    parser.add_argument("--no-observe", action="store_true", help="Use raw text output instead of monitored stream-json observations.")
    parser.add_argument("--raw-stream-json", action="store_true", help="Print raw stream-json instead of observations.")
    args = parser.parse_args()

    if not LAUNCHER.exists():
        print(f"launcher_not_found: {LAUNCHER}", file=sys.stderr)
        return 127
    if not args.prompt_file.exists():
        print(f"prompt_file_not_found: {args.prompt_file}", file=sys.stderr)
        return 2

    requested_cwd = args.cwd.resolve()
    review_bundle = None
    prompt = args.prompt_file.read_text(encoding="utf-8")
    add_dirs = list(args.add_dir)
    cwd = requested_cwd
    bounded = args.bounded_review or len(args.focus_file) > 0
    tools = args.tools if args.tools is not None else ("Read" if bounded else "Read,Grep,Glob")

    if bounded:
        if not args.focus_file:
            print("bounded_review_requires_focus_file", file=sys.stderr)
            return 2
        try:
            review_bundle, manifest = build_review_bundle(args.focus_file, requested_cwd)
        except FileNotFoundError as error:
            print(str(error), file=sys.stderr)
            return 2
        cwd = review_bundle
        add_dirs = [str(review_bundle)]
        prompt = bounded_prompt(prompt, manifest)

    monitored = (args.observe or not args.no_observe) and not args.raw_stream_json

    cmd = [
        str(LAUNCHER),
        "--bare",
        "-p",
        "--output-format",
        "stream-json" if monitored or args.raw_stream_json else "text",
        "--no-session-persistence",
        "--max-budget-usd",
        str(args.max_budget_usd),
        "--effort",
        args.effort,
        "--tools",
        tools,
    ]
    if monitored or args.raw_stream_json:
        cmd.extend(["--include-partial-messages", "--verbose"])
    if args.model:
        cmd.extend(["--model", args.model])
    for directory in add_dirs:
        cmd.extend(["--add-dir", directory])

    env = os.environ.copy()
    # Make --bare auth robust even if the launcher changes back to AUTH_TOKEN-only.
    if "ANTHROPIC_AUTH_TOKEN" in env and "ANTHROPIC_API_KEY" not in env:
        env["ANTHROPIC_API_KEY"] = env["ANTHROPIC_AUTH_TOKEN"]

    process = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=cwd,
        env=env,
        bufsize=1,
        start_new_session=True,
    )
    assert process.stdin is not None
    assert process.stdout is not None
    assert process.stderr is not None
    process.stdin.write(prompt)
    process.stdin.close()

    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ, sys.stdout)
    selector.register(process.stderr, selectors.EVENT_READ, sys.stderr)
    deadline = time.monotonic() + args.timeout_seconds
    last_output = time.monotonic()
    last_progress = time.monotonic()
    last_heartbeat = time.monotonic()
    observe_counters: dict[str, int] = {}

    while selector.get_map():
        now = time.monotonic()
        if args.no_progress_timeout_seconds > 0 and now - last_progress >= args.no_progress_timeout_seconds:
            print(
                "CLAUDE_DEEPSEEK_NO_PROGRESS_TIMEOUT "
                f"quiet_s={int(now - last_output)} no_progress_s={int(now - last_progress)} "
                f"hard_cap_s={args.timeout_seconds} {process_snapshot(process.pid)}",
                file=sys.stderr,
            )
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            return 124
        if now >= deadline:
            print(
                "CLAUDE_DEEPSEEK_HARD_TIMEOUT "
                f"quiet_s={int(now - last_output)} no_progress_s={int(now - last_progress)} "
                f"hard_cap_s={args.timeout_seconds} {process_snapshot(process.pid)}",
                file=sys.stderr,
            )
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            return 124
        if (monitored or args.raw_stream_json) and now - last_heartbeat >= OBSERVE_HEARTBEAT_SECONDS:
            elapsed = int(now - (deadline - args.timeout_seconds))
            quiet = int(now - last_output)
            no_progress = int(now - last_progress)
            print(
                f"DS_OBSERVE heartbeat elapsed_s={elapsed} quiet_s={quiet} no_progress_s={no_progress} {process_snapshot(process.pid)}",
                file=sys.stderr,
            )
            last_heartbeat = now
        for key, _ in selector.select(timeout=0.2):
            chunk = key.fileobj.readline()
            if chunk:
                last_output = time.monotonic()
                if args.raw_stream_json or not monitored:
                    last_progress = time.monotonic()
                    key.data.write(chunk)
                    key.data.flush()
                elif key.fileobj is process.stdout:
                    if summarize_stream_json_line(chunk, sys.stderr, observe_counters):
                        last_progress = time.monotonic()
                else:
                    last_progress = time.monotonic()
                    key.data.write(chunk)
                    key.data.flush()
            else:
                selector.unregister(key.fileobj)
                key.fileobj.close()

    return process.wait()


if __name__ == "__main__":
    raise SystemExit(main())
