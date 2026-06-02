#!/usr/bin/env python3
from __future__ import annotations

import argparse
import selectors
import subprocess
import sys
import tempfile
from pathlib import Path


WRAPPER = Path(__file__).with_name("run_claude_deepseek_review.py")


def chunks(items: list[str], size: int) -> list[list[str]]:
    return [items[index:index + size] for index in range(0, len(items), size)]


def resolve_focus_file(cwd: Path, focus_file: str) -> Path:
    path = Path(focus_file).expanduser()
    if not path.is_absolute():
        path = cwd / path
    return path.resolve()


def excerpt_terms(original_prompt: str) -> list[str]:
    terms = [
        "runContextWorkPackages",
        "run_context_work_packages",
        "bounded_mock_multi_agent",
        "provider_model_routed",
        "execution_profile",
        "execution_mode",
        "executeProjectedNextAction",
        "context-work-packages-run",
        "fixed_development_mode_gate",
    ]
    for raw in original_prompt.replace("`", " ").replace("，", " ").replace("。", " ").split():
        token = raw.strip(" ?!:.()[]{}")
        if (
            8 <= len(token) <= 48
            and any(ch.isascii() and ch.isalpha() for ch in token)
            and token not in {"completed", "workflow_state", "status", "result", "package_results"}
        ):
            terms.append(token)
    deduped: list[str] = []
    for term in terms:
        if term not in deduped:
            deduped.append(term)
    return deduped


def build_excerpt_file(
    cwd: Path,
    focus_file: str,
    original_prompt: str,
    context_lines: int = 24,
    max_excerpt_lines: int = 520,
) -> Path:
    source = resolve_focus_file(cwd, focus_file)
    lines = source.read_text(encoding="utf-8", errors="replace").splitlines()
    selected: set[int] = set()
    terms = excerpt_terms(original_prompt)
    for term in terms:
        term_hits = [index for index, line in enumerate(lines) if term in line]
        if len(term_hits) > 24:
            term_hits = term_hits[:12] + term_hits[-12:]
        for index in term_hits:
            start = max(0, index - context_lines)
            end = min(len(lines), index + context_lines + 1)
            selected.update(range(start, end))
        if len(selected) >= max_excerpt_lines:
            break
    if not selected:
        selected.update(range(0, min(len(lines), context_lines * 2)))
    ordered = sorted(selected)
    if len(ordered) > max_excerpt_lines:
        ordered = ordered[:max_excerpt_lines]
    excerpt_dir = Path(tempfile.mkdtemp(prefix="ds-review-excerpt-"))
    target = excerpt_dir / (source.name + ".excerpt.md")
    rendered: list[str] = [
        f"# Excerpt of {source}",
        "",
        "Only the line windows relevant to the review prompt are included.",
        "",
    ]
    previous = None
    for index in ordered:
        if previous is not None and index != previous + 1:
            rendered.append("")
            rendered.append("...")
            rendered.append("")
        rendered.append(f"{index + 1}: {lines[index]}")
        previous = index
    target.write_text("\n".join(rendered) + "\n", encoding="utf-8")
    print(
        f"DS_SHARD excerpt_created file={focus_file} excerpt={target} lines={len(ordered)}/{len(lines)}",
        file=sys.stderr,
    )
    return target


def write_prompt(prefix: str, body: str) -> Path:
    handle = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        prefix=prefix,
        suffix=".md",
        delete=False,
    )
    with handle:
        handle.write(body)
        if not body.endswith("\n"):
            handle.write("\n")
    return Path(handle.name)


def compact_review_output(output: str, max_lines: int = 12) -> str:
    signal_words = (
        "P1",
        "必须修正",
        "风险",
        "假成功",
        "状态污染",
        "绕过",
        "证据不足",
        "PASS",
        "确认",
        "无法",
        "不足",
    )
    lines = []
    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("DS_OBSERVE"):
            continue
        if any(word in line for word in signal_words):
            lines.append(line)
        if len(lines) >= max_lines:
            break
    if not lines:
        lines = [line.strip() for line in output.splitlines() if line.strip()][:max_lines]
    return "\n".join(lines[:max_lines])


def local_synthesis(shard_results: list[tuple[list[str], str]]) -> str:
    p1_lines: list[str] = []
    evidence_gaps: list[str] = []
    for files, output in shard_results:
        compact = compact_review_output(output, max_lines=16)
        for line in compact.splitlines():
            decorated = f"[{', '.join(files)}] {line}"
            if "P1" in line or "必须修正" in line or "假成功" in line or "状态污染" in line or "绕过" in line:
                p1_lines.append(decorated)
            elif "证据不足" in line or "无法" in line or "不足" in line:
                evidence_gaps.append(decorated)
    if p1_lines:
        return "LOCAL_SYNTHESIS_P1\n" + "\n".join(f"- {line}" for line in p1_lines[:3])
    if evidence_gaps:
        return "LOCAL_SYNTHESIS_EVIDENCE_GAP\n" + "\n".join(f"- {line}" for line in evidence_gaps[:3])
    return "PASS"


def run_process(cmd: list[str], cwd: Path) -> tuple[int, str]:
    process = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    assert process.stdout is not None
    assert process.stderr is not None
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ, sys.stdout)
    selector.register(process.stderr, selectors.EVENT_READ, sys.stderr)
    stdout_parts: list[str] = []

    while selector.get_map():
        for key, _ in selector.select(timeout=0.2):
            chunk = key.fileobj.readline()
            if chunk:
                key.data.write(chunk)
                key.data.flush()
                if key.fileobj is process.stdout:
                    stdout_parts.append(chunk)
            else:
                selector.unregister(key.fileobj)
                key.fileobj.close()

    return process.wait(), "".join(stdout_parts).strip()


def run_single_review(
    *,
    cwd: Path,
    prompt_file: Path,
    focus_files: list[str],
    timeout_seconds: int,
    no_progress_timeout_seconds: int,
    effort: str,
    model: str,
    observe: bool,
) -> tuple[int, str]:
    cmd = [
        sys.executable,
        str(WRAPPER),
        "--cwd",
        str(cwd),
        "--bounded-review",
        "--timeout-seconds",
        str(timeout_seconds),
        "--no-progress-timeout-seconds",
        str(no_progress_timeout_seconds),
        "--effort",
        effort,
        "--prompt-file",
        str(prompt_file),
    ]
    if model:
        cmd.extend(["--model", model])
    if observe:
        cmd.append("--observe")
    for focus_file in focus_files:
        cmd.extend(["--focus-file", focus_file])
    return run_process(cmd, cwd)


def run_embedded_excerpt_review(
    *,
    cwd: Path,
    original_prompt: str,
    focus_file: str,
    excerpt_file: Path,
    timeout_seconds: int,
    no_progress_timeout_seconds: int,
    effort: str,
    model: str,
    observe: bool,
) -> tuple[int, str]:
    excerpt_text = excerpt_file.read_text(encoding="utf-8", errors="replace")
    if len(excerpt_text) > 28000:
        excerpt_text = excerpt_text[:28000] + "\n\n[TRUNCATED]\n"
    prompt = write_prompt(
        "ds-embedded-excerpt-",
        "\n".join([
            "这是大文件超时后的嵌入式证据包复审。",
            "不要使用工具，不要要求读取原始文件。只基于下面带行号的摘录回答。",
            "输出不超过 8 行；能确认就确认，不能确认就说明具体缺哪条证据。",
            "",
            f"Focus file: {focus_file}",
            "",
            "原始问题：",
            original_prompt,
            "",
            "摘录：",
            excerpt_text,
        ]),
    )
    cmd = [
        sys.executable,
        str(WRAPPER),
        "--cwd",
        str(cwd),
        "--tools",
        "",
        "--timeout-seconds",
        str(timeout_seconds),
        "--no-progress-timeout-seconds",
        str(no_progress_timeout_seconds),
        "--effort",
        effort,
        "--prompt-file",
        str(prompt),
    ]
    if model:
        cmd.extend(["--model", model])
    if observe:
        cmd.append("--observe")
    return run_process(cmd, cwd)


def run_shard(
    *,
    cwd: Path,
    original_prompt: str,
    focus_files: list[str],
    timeout_seconds: int,
    no_progress_timeout_seconds: int,
    effort: str,
    shard_model: str,
    excerpt_model: str,
    observe: bool,
    depth: int = 0,
) -> list[tuple[list[str], str]]:
    label = ",".join(focus_files)
    print(f"DS_SHARD start depth={depth} files={label}", file=sys.stderr)
    shard_prompt = write_prompt(
        "ds-shard-",
        "\n".join([
            "这是一个多文件复审的分片任务。",
            "只回答本分片能确认的事实和必须修正项；证据不足时说明需要最终综合判断。",
            "输出不超过 8 行。",
            "",
            original_prompt,
        ]),
    )
    code, output = run_single_review(
        cwd=cwd,
        prompt_file=shard_prompt,
        focus_files=focus_files,
        timeout_seconds=timeout_seconds,
        no_progress_timeout_seconds=no_progress_timeout_seconds,
        effort=effort,
        model=shard_model,
        observe=observe,
    )
    if code == 0:
        print(f"DS_SHARD pass depth={depth} files={label}", file=sys.stderr)
        return [(focus_files, output)]
    if code == 124 and len(focus_files) == 1:
        excerpt_file = build_excerpt_file(cwd, focus_files[0], original_prompt)
        print(f"DS_SHARD retry_excerpt_on_timeout depth={depth} files={label}", file=sys.stderr)
        excerpt_prompt = write_prompt(
            "ds-excerpt-shard-",
            "\n".join([
                "这是单个大文件超时后的代码摘录复审。",
                "摘录文件包含原始行号。只基于摘录判断；不要要求读取原始大文件。",
                "输出不超过 8 行。",
                "",
                original_prompt,
            ]),
        )
        excerpt_code, excerpt_output = run_single_review(
            cwd=cwd,
            prompt_file=excerpt_prompt,
            focus_files=[str(excerpt_file)],
            timeout_seconds=timeout_seconds,
            no_progress_timeout_seconds=no_progress_timeout_seconds,
            effort=effort,
            model=excerpt_model,
            observe=observe,
        )
        if excerpt_code == 0:
            print(f"DS_SHARD excerpt_pass depth={depth} files={label}", file=sys.stderr)
            return [(focus_files, output + "\n" + excerpt_output)]
        if excerpt_code == 124:
            print(f"DS_SHARD retry_embedded_excerpt_on_timeout depth={depth} files={label}", file=sys.stderr)
            embedded_code, embedded_output = run_embedded_excerpt_review(
                cwd=cwd,
                original_prompt=original_prompt,
                focus_file=focus_files[0],
                excerpt_file=excerpt_file,
                timeout_seconds=timeout_seconds,
                no_progress_timeout_seconds=no_progress_timeout_seconds,
                effort=effort,
                model=excerpt_model,
                observe=observe,
            )
            if embedded_code == 0:
                print(f"DS_SHARD embedded_excerpt_pass depth={depth} files={label}", file=sys.stderr)
                return [(focus_files, output + "\n" + embedded_output)]
    if code == 124 and len(focus_files) > 1:
        print(f"DS_SHARD split_on_timeout depth={depth} files={label}", file=sys.stderr)
        midpoint = max(1, len(focus_files) // 2)
        return (
            run_shard(
                cwd=cwd,
                original_prompt=original_prompt,
                focus_files=focus_files[:midpoint],
                timeout_seconds=timeout_seconds,
                no_progress_timeout_seconds=no_progress_timeout_seconds,
                effort=effort,
                shard_model=shard_model,
                excerpt_model=excerpt_model,
                observe=observe,
                depth=depth + 1,
            )
            + run_shard(
                cwd=cwd,
                original_prompt=original_prompt,
                focus_files=focus_files[midpoint:],
                timeout_seconds=timeout_seconds,
                no_progress_timeout_seconds=no_progress_timeout_seconds,
                effort=effort,
                shard_model=shard_model,
                excerpt_model=excerpt_model,
                observe=observe,
                depth=depth + 1,
            )
        )
    raise RuntimeError(f"shard_failed code={code} files={label}")


def synthesize(
    *,
    cwd: Path,
    original_prompt: str,
    shard_results: list[tuple[list[str], str]],
    timeout_seconds: int,
    no_progress_timeout_seconds: int,
    effort: str,
    model: str,
    observe: bool,
) -> tuple[int, str]:
    summaries = []
    for index, (files, output) in enumerate(shard_results, start=1):
        summaries.append(f"## Shard {index}: {', '.join(files)}\n{compact_review_output(output)}")
    prompt = write_prompt(
        "ds-synthesis-",
        "\n".join([
            "请基于以下已压缩的分片复审结果做最终综合判断。",
            "不读取文件，不新增事实。只输出：PASS 或最多 3 条 P1 必须修正项。不要解释过程。",
            "",
            "原始问题：",
            original_prompt,
            "",
            "\n\n".join(summaries),
        ]),
    )
    cmd = [
        sys.executable,
        str(WRAPPER),
        "--cwd",
        str(cwd),
        "--tools",
        "",
        "--timeout-seconds",
        str(timeout_seconds),
        "--no-progress-timeout-seconds",
        str(no_progress_timeout_seconds),
        "--effort",
        effort,
        "--prompt-file",
        str(prompt),
    ]
    if model:
        cmd.extend(["--model", model])
    if observe:
        cmd.append("--observe")
    print("DS_SHARD synthesis_start", file=sys.stderr)
    return run_process(cmd, cwd)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a sharded Claude+DeepSeek review.")
    parser.add_argument("--prompt-file", required=True, type=Path)
    parser.add_argument("--cwd", default=".", type=Path)
    parser.add_argument("--focus-file", action="append", required=True)
    parser.add_argument("--max-files-per-shard", type=int, default=2)
    parser.add_argument("--shard-timeout-seconds", type=int, default=300)
    parser.add_argument("--synthesis-timeout-seconds", type=int, default=180)
    parser.add_argument("--no-progress-timeout-seconds", type=int, default=120)
    parser.add_argument("--effort", default="high", choices=["high", "max"])
    parser.add_argument("--shard-model", default="")
    parser.add_argument("--excerpt-model", default="deepseek-v4-flash")
    parser.add_argument("--synthesis-model", default="deepseek-v4-flash")
    parser.add_argument("--observe", action="store_true", default=True)
    parser.add_argument("--no-observe", action="store_false", dest="observe")
    args = parser.parse_args()

    if args.max_files_per_shard < 1:
        print("max_files_per_shard_must_be_positive", file=sys.stderr)
        return 2
    if not args.prompt_file.exists():
        print(f"prompt_file_not_found: {args.prompt_file}", file=sys.stderr)
        return 2

    cwd = args.cwd.resolve()
    original_prompt = args.prompt_file.read_text(encoding="utf-8")
    shard_results: list[tuple[list[str], str]] = []
    try:
        for shard in chunks(args.focus_file, args.max_files_per_shard):
            shard_results.extend(
                run_shard(
                    cwd=cwd,
                    original_prompt=original_prompt,
                    focus_files=shard,
                    timeout_seconds=args.shard_timeout_seconds,
                    no_progress_timeout_seconds=args.no_progress_timeout_seconds,
                    effort=args.effort,
                    shard_model=args.shard_model,
                    excerpt_model=args.excerpt_model,
                    observe=args.observe,
                )
            )
        code, output = synthesize(
            cwd=cwd,
            original_prompt=original_prompt,
            shard_results=shard_results,
            timeout_seconds=args.synthesis_timeout_seconds,
            no_progress_timeout_seconds=args.no_progress_timeout_seconds,
            effort=args.effort,
            model=args.synthesis_model,
            observe=args.observe,
        )
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1

    if code == 124:
        print("DS_SHARD synthesis_timeout_using_local_aggregator", file=sys.stderr)
        print(local_synthesis(shard_results))
        return 0
    if output:
        print(output)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
