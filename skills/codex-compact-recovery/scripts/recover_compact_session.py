#!/usr/bin/env python3

from __future__ import annotations

import argparse
import datetime as dt
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

COMPACT_ERROR = (
    "Error running remote compact task: stream disconnected before completion: "
    "error sending request for url (https://chatgpt.com/backend-api/codex/responses/compact)"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Find Codex Desktop sessions affected by compact failures and generate "
            "a handoff prompt for a new session."
        )
    )
    parser.add_argument(
        "--codex-home",
        default="~/.codex",
        help="Path to the Codex home directory. Defaults to ~/.codex.",
    )
    parser.add_argument(
        "--thread-id",
        help="Target a specific thread id instead of auto-selecting the latest stalled candidate.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=30,
        help="Maximum number of recent threads to inspect. Defaults to 30.",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List candidate threads instead of printing a handoff prompt.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON instead of Markdown.",
    )
    parser.add_argument(
        "--include-archived",
        action="store_true",
        help="Include archived threads in the search.",
    )
    parser.add_argument(
        "--max-output-chars",
        type=int,
        default=600,
        help="Maximum number of characters kept for each command output excerpt.",
    )
    parser.add_argument(
        "--command-limit",
        type=int,
        default=3,
        help="Number of recent command results to include in the handoff. Defaults to 3.",
    )
    return parser.parse_args()


def resolve_codex_home(raw_path: str) -> Path:
    path = Path(raw_path).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"Codex home does not exist: {path}")
    return path


def find_latest_state_db(codex_home: Path) -> Path:
    candidates = sorted(codex_home.glob("state_*.sqlite"))
    if not candidates:
        raise FileNotFoundError(f"No state_*.sqlite found under {codex_home}")
    return max(candidates, key=lambda item: (item.stat().st_mtime_ns, item.name))


def fetch_threads(
    state_db: Path,
    limit: int,
    include_archived: bool,
    thread_id: str | None,
) -> list[dict[str, Any]]:
    query = [
        "select id, rollout_path, created_at, updated_at, cwd, title, archived, first_user_message",
        "from threads",
    ]
    params: list[Any] = []
    where: list[str] = []

    if not include_archived:
        where.append("archived = 0")
    if thread_id:
        where.append("id = ?")
        params.append(thread_id)

    if where:
        query.append("where " + " and ".join(where))

    query.append("order by updated_at desc")
    if not thread_id:
        query.append("limit ?")
        params.append(limit)

    sql = " ".join(query)

    with sqlite3.connect(state_db) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    return [dict(row) for row in rows]


def read_rollout_events(path: Path) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            try:
                events.append(json.loads(raw_line))
            except json.JSONDecodeError:
                continue
    return events


def flatten_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = [flatten_text(item) for item in value]
        return "\n".join(part for part in parts if part).strip()
    if isinstance(value, dict):
        if "text" in value and isinstance(value["text"], str):
            return value["text"].strip()
        parts = [flatten_text(item) for item in value.values()]
        return "\n".join(part for part in parts if part).strip()
    return ""


def message_text(payload: dict[str, Any]) -> str:
    text = flatten_text(payload.get("content"))
    if text:
        return text
    return flatten_text(payload)


def summarize_text(text: str, max_chars: int) -> str:
    text = " ".join(text.split())
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."


def format_ts(raw_ts: str | None) -> str:
    if not raw_ts:
        return "unknown"
    try:
        parsed = dt.datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
    except ValueError:
        return raw_ts
    return parsed.astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")


def unix_to_local(raw_ts: int | None) -> str:
    if raw_ts is None:
        return "unknown"
    return dt.datetime.fromtimestamp(raw_ts).astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")


def find_last_user_message(events: list[dict[str, Any]], before_idx: int | None) -> str:
    stop = before_idx if before_idx is not None else len(events)
    for event in reversed(events[:stop]):
        if event.get("type") != "response_item":
            continue
        payload = event.get("payload") or {}
        if payload.get("type") == "message" and payload.get("role") == "user":
            text = message_text(payload)
            if text:
                return text
    return ""


def find_last_assistant_message(events: list[dict[str, Any]], before_idx: int | None) -> str:
    stop = before_idx if before_idx is not None else len(events)
    for event in reversed(events[:stop]):
        if event.get("type") != "response_item":
            continue
        payload = event.get("payload") or {}
        if payload.get("type") == "message" and payload.get("role") == "assistant":
            text = message_text(payload)
            if text:
                return text
    return ""


def collect_recent_commands(
    events: list[dict[str, Any]],
    before_idx: int,
    limit: int,
    max_output_chars: int,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for event in reversed(events[:before_idx]):
        if event.get("type") != "event_msg":
            continue
        payload = event.get("payload") or {}
        if payload.get("type") != "exec_command_end":
            continue
        command = payload.get("command") or []
        if isinstance(command, list):
            rendered_command = " ".join(str(part) for part in command if part)
        else:
            rendered_command = str(command)
        results.append(
            {
                "timestamp": format_ts(event.get("timestamp")),
                "command": rendered_command,
                "exit_code": payload.get("exit_code"),
                "status": payload.get("status"),
                "output_excerpt": summarize_text(payload.get("aggregated_output") or "", max_output_chars),
            }
        )
        if len(results) >= limit:
            break
    return list(reversed(results))


def analyze_thread(
    thread: dict[str, Any],
    command_limit: int,
    max_output_chars: int,
) -> dict[str, Any] | None:
    rollout_path = Path(thread["rollout_path"])
    if not rollout_path.exists():
        return None

    events = read_rollout_events(rollout_path)
    if not events:
        return None

    failure_indices: list[int] = []
    compacted_indices: list[int] = []
    for idx, event in enumerate(events):
        if event.get("type") != "event_msg":
            continue
        payload = event.get("payload") or {}
        event_type = payload.get("type")
        if event_type == "error":
            message = str(payload.get("message") or "")
            if COMPACT_ERROR in message:
                failure_indices.append(idx)
        elif event_type == "context_compacted":
            compacted_indices.append(idx)

    if not failure_indices:
        return None

    failure_idx = failure_indices[-1]
    failure_event = events[failure_idx]

    interruption_idx = failure_idx
    interruption_kind = "compact_error"
    if compacted_indices and compacted_indices[-1] > interruption_idx:
        interruption_idx = compacted_indices[-1]
        interruption_kind = "context_compacted"

    interruption_event = events[interruption_idx]
    later_events = events[interruption_idx + 1 :]

    later_assistant_messages = 0
    later_context_compacted = 0
    later_task_started = 0

    for event in later_events:
        if event.get("type") == "response_item":
            payload = event.get("payload") or {}
            if payload.get("type") == "message" and payload.get("role") == "assistant":
                later_assistant_messages += 1
        elif event.get("type") == "event_msg":
            payload = event.get("payload") or {}
            if payload.get("type") == "context_compacted":
                later_context_compacted += 1
            if payload.get("type") == "task_started":
                later_task_started += 1

    recent_commands = collect_recent_commands(events, interruption_idx, command_limit, max_output_chars)
    latest_user_message = find_last_user_message(events, interruption_idx)
    latest_assistant_message = find_last_assistant_message(events, interruption_idx)

    return {
        "thread_id": thread["id"],
        "title": thread.get("title") or "",
        "cwd": thread.get("cwd") or "",
        "rollout_path": str(rollout_path),
        "archived": bool(thread.get("archived")),
        "updated_at_epoch": thread.get("updated_at"),
        "created_at_epoch": thread.get("created_at"),
        "updated_local": unix_to_local(thread.get("updated_at")),
        "created_local": unix_to_local(thread.get("created_at")),
        "first_user_message": thread.get("first_user_message") or "",
        "latest_user_message": latest_user_message,
        "latest_assistant_message": latest_assistant_message,
        "failure_timestamp": format_ts(failure_event.get("timestamp")),
        "failure_message": (failure_event.get("payload") or {}).get("message") or "",
        "latest_interruption_at": format_ts(interruption_event.get("timestamp")),
        "latest_interruption_kind": interruption_kind,
        "later_assistant_message_count": later_assistant_messages,
        "later_context_compacted_count": later_context_compacted,
        "later_task_started_count": later_task_started,
        "status": "stalled" if later_assistant_messages == 0 else "recovered",
        "recent_commands": recent_commands,
    }


def sort_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        candidates,
        key=lambda item: (
            0 if item["status"] == "stalled" else 1,
            -(item["updated_at_epoch"] or 0),
        ),
    )


def pick_candidate(candidates: list[dict[str, Any]], requested_thread_id: str | None) -> dict[str, Any] | None:
    if requested_thread_id:
        for candidate in candidates:
            if candidate["thread_id"] == requested_thread_id:
                return candidate
        return None

    stalled = [item for item in candidates if item["status"] == "stalled"]
    if stalled:
        return stalled[0]
    if candidates:
        return candidates[0]
    return None


def format_list(candidates: list[dict[str, Any]]) -> str:
    lines = [
        "| Status | Updated | Thread ID | Title | CWD |",
        "| --- | --- | --- | --- | --- |",
    ]
    for item in candidates:
        lines.append(
            "| {status} | {updated} | `{thread_id}` | {title} | `{cwd}` |".format(
                status=item["status"],
                updated=item["updated_local"],
                thread_id=item["thread_id"],
                title=item["title"].replace("|", "/"),
                cwd=item["cwd"],
            )
        )
    return "\n".join(lines)


def format_commands(commands: list[dict[str, Any]]) -> str:
    if not commands:
        return "- No recent exec_command results were captured before the failure."
    lines: list[str] = []
    for idx, command in enumerate(commands, start=1):
        lines.append(
            "{idx}. `{command}`".format(
                idx=idx,
                command=command["command"],
            )
        )
        lines.append(
            "   Result: status={status}, exit_code={exit_code}, timestamp={timestamp}".format(
                status=command["status"],
                exit_code=command["exit_code"],
                timestamp=command["timestamp"],
            )
        )
        if command["output_excerpt"]:
            lines.append(f"   Output: {command['output_excerpt']}")
    return "\n".join(lines)


def format_resume_prompt(candidate: dict[str, Any]) -> str:
    original_request = candidate["first_user_message"] or "(missing)"
    latest_request = candidate["latest_user_message"] or original_request
    latest_assistant = candidate["latest_assistant_message"] or "(no assistant message captured before failure)"

    return f"""Previous Codex Desktop work became unusable after a compact failure. Continue from the inherited local context below instead of starting from scratch.

Risk warning:
- This is a best-effort reconstruction from local Codex artifacts only.
- Hidden reasoning, remote compact state, and any server-only context are not recoverable.
- The last visible assistant message may reflect intent or partial progress rather than completed work.
- Verify critical facts against the current workspace before acting on this handoff.

Source thread:
- thread_id: `{candidate["thread_id"]}`
- title: {candidate["title"] or "(untitled)"}
- cwd: `{candidate["cwd"]}`
- rollout_path: `{candidate["rollout_path"]}`
- last_updated_local: {candidate["updated_local"]}
- compact_failure_at: {candidate["failure_timestamp"]}
- latest_compaction_interruption_at: {candidate["latest_interruption_at"]}
- latest_compaction_interruption_kind: `{candidate["latest_interruption_kind"]}`
- classification: `{candidate["status"]}`

Known failure:
`{candidate["failure_message"]}`

Visible task context to inherit:
- Original user request: {original_request}
- Latest visible user request before failure: {latest_request}
- Last assistant message before failure: {latest_assistant}

Recent command results before failure:
{format_commands(candidate["recent_commands"])}

Recovery instructions:
1. Treat the previous thread as interrupted by infrastructure failure, not task completion.
2. Continue from the same cwd and current workspace state.
3. Treat this handoff as partial reconstruction, not authoritative memory.
4. Reuse the visible context above, but verify any critical facts against files on disk before editing.
5. Do not ask for a recap unless the missing information is not recoverable from the repo or the captured thread context.
6. Resume from the last unfinished step and keep moving.
"""


def main() -> int:
    args = parse_args()

    try:
        codex_home = resolve_codex_home(args.codex_home)
        state_db = find_latest_state_db(codex_home)
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    threads = fetch_threads(
        state_db=state_db,
        limit=args.limit,
        include_archived=args.include_archived,
        thread_id=args.thread_id,
    )

    candidates: list[dict[str, Any]] = []
    for thread in threads:
        analyzed = analyze_thread(
            thread=thread,
            command_limit=args.command_limit,
            max_output_chars=args.max_output_chars,
        )
        if analyzed:
            candidates.append(analyzed)

    candidates = sort_candidates(candidates)

    if args.list:
        if args.json:
            print(json.dumps(candidates, ensure_ascii=False, indent=2))
        else:
            if not candidates:
                print("No compact-failure candidates found.")
            else:
                print(format_list(candidates))
        return 0

    chosen = pick_candidate(candidates, args.thread_id)
    if not chosen:
        if args.thread_id:
            print(f"No compact-failure candidate found for thread id {args.thread_id}.", file=sys.stderr)
        else:
            print("No compact-failure candidate found.", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(chosen, ensure_ascii=False, indent=2))
    else:
        print(format_resume_prompt(chosen))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
