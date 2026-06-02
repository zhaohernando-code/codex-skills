#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path

INDEX_PATH = Path(os.environ.get("CODEX_WORKFLOW_ROOT", str(Path.home() / "codex"))) / "WORKSPACE_INDEX.json"

RUNTIME_HINTS = {
    "runtime",
    "live",
    "deploy",
    "deployment",
    "publish",
    "launchagent",
    "launchd",
    "tunnel",
    "health",
    "线上",
    "发布",
    "部署",
    "运行",
    "隧道",
}

STATE_HINTS = {
    "queue",
    "worker",
    "workers",
    "approval",
    "approvals",
    "log",
    "logs",
    "state",
    "队列",
    "审批",
    "日志",
    "状态",
}

TOKEN_STOPWORDS = {
    "a",
    "an",
    "and",
    "after",
    "as",
    "at",
    "by",
    "for",
    "from",
    "in",
    "into",
    "is",
    "it",
    "main",
    "of",
    "on",
    "only",
    "or",
    "the",
    "to",
    "with",
}


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9_/-]+", normalize(text))


def meaningful_tokens(text: str) -> list[str]:
    return [
        token
        for token in tokenize(text)
        if len(token) >= 3 and token not in TOKEN_STOPWORDS
    ]


def cjk_ngrams(text: str) -> set[str]:
    grams: set[str] = set()
    for chunk in re.findall(r"[\u4e00-\u9fff]+", text):
        normalized_chunk = normalize(chunk)
        if len(normalized_chunk) < 2:
            continue
        grams.add(normalized_chunk)
        for size in range(2, min(5, len(normalized_chunk)) + 1):
            for start in range(0, len(normalized_chunk) - size + 1):
                grams.add(normalized_chunk[start : start + size])
    return grams


def score_project(query: str, project: dict) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    query_norm = normalize(query)
    query_tokens = set(meaningful_tokens(query))
    query_cjk = cjk_ngrams(query)

    aliases = [normalize(item) for item in project.get("aliases", [])]
    keywords = [normalize(item) for item in project.get("keywords", [])]
    display_name = normalize(project.get("display_name", ""))
    project_id = normalize(project.get("project_id", ""))
    routes = " ".join(str(v) for v in project.get("entry_routes", {}).values()).lower()

    exact_aliases = [alias for alias in aliases if query_norm == alias]
    if exact_aliases:
        score += 120
        reasons.append(f"exact alias match: {exact_aliases[0]}")

    partial_aliases = [alias for alias in aliases if alias in query_norm or query_norm in alias]
    if partial_aliases and not exact_aliases:
        score += 80
        reasons.append(f"partial alias match: {partial_aliases[0]}")

    if query_norm == project_id or query_norm == display_name:
        score += 70
        reasons.append("exact project id/display name match")
    elif project_id in query_norm or display_name in query_norm:
        score += 40
        reasons.append("project id/display name included in query")

    keyword_hits = [kw for kw in keywords if kw in query_norm]
    if keyword_hits:
        score += min(45, 15 * len(keyword_hits))
        reasons.append(f"keyword match: {', '.join(keyword_hits[:3])}")

    token_text = " ".join(aliases + keywords + [display_name, project_id, project.get("project_type", "")])
    overlapping_tokens = [tok for tok in query_tokens if tok and tok in token_text]
    if overlapping_tokens:
        score += min(30, 10 * len(overlapping_tokens))
        reasons.append(f"token overlap: {', '.join(overlapping_tokens[:3])}")

    alias_cjk = set().union(*(cjk_ngrams(item) for item in aliases)) if aliases else set()
    keyword_cjk = set().union(*(cjk_ngrams(item) for item in keywords)) if keywords else set()
    cjk_hits = sorted(query_cjk.intersection(alias_cjk.union(keyword_cjk)))
    if cjk_hits:
        score += min(36, 12 * len(cjk_hits))
        reasons.append(f"CJK overlap: {', '.join(cjk_hits[:3])}")

    route_tokens = set(meaningful_tokens(routes))
    route_hits = [piece for piece in query_tokens if piece in route_tokens]
    if route_hits:
        score += 10
        reasons.append(f"route overlap: {', '.join(route_hits[:3])}")

    return score, reasons


def needs_runtime(query: str, project: dict) -> bool:
    query_norm = normalize(query)
    return project.get("runtime_path") is not None and any(hint in query_norm for hint in RUNTIME_HINTS)


def needs_state(query: str) -> bool:
    query_norm = normalize(query)
    return any(hint in query_norm for hint in STATE_HINTS)


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: resolve_project.py <query>", file=sys.stderr)
        return 2

    query = " ".join(sys.argv[1:]).strip()
    index = json.loads(INDEX_PATH.read_text())
    ranked = []

    for project in index.get("projects", []):
        score, reasons = score_project(query, project)
        ranked.append((score, project, reasons))

    ranked.sort(key=lambda item: item[0], reverse=True)
    best_score, best_project, best_reasons = ranked[0]
    best_confidence = round(min(0.99, best_score / 140 if best_score > 0 else 0.05), 2)
    fallback = best_score < 80

    result = {
        "query": query,
        "index_path": str(INDEX_PATH),
        "best_match": {
            "project_id": best_project["project_id"],
            "display_name": best_project["display_name"],
            "repo_path": best_project["repo_path"],
            "runtime_path": best_project["runtime_path"],
            "confidence": best_confidence,
            "reasons": best_reasons or ["fallback to top-scoring project"],
            "canonical_docs": best_project["canonical_docs"],
            "should_check_runtime": needs_runtime(query, best_project),
            "should_check_codex_system": needs_state(query),
            "needs_fallback_search": fallback,
        },
        "ranked_matches": [
            {
                "project_id": project["project_id"],
                "display_name": project["display_name"],
                "score": score,
                "reasons": reasons,
            }
            for score, project, reasons in ranked
        ],
    }

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
