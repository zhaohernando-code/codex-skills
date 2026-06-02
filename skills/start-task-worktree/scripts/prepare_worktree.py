#!/usr/bin/env python3
import argparse
import json
import os
import re
import secrets
import subprocess
import sys
from datetime import datetime
from pathlib import Path


HOME = Path.home()
CODEX_ROOT = HOME / "codex"
DEFAULT_INDEX = CODEX_ROOT / "WORKSPACE_INDEX.json"
DEFAULT_WORKTREE_ROOT = CODEX_ROOT / "worker-workspaces"
SERVER_WORKTREE_ROOT = CODEX_ROOT / ".codex-system" / "worktrees"


def run(cmd, cwd=None, check=False):
    proc = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if check and proc.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)}\n{proc.stderr.strip() or proc.stdout.strip()}")
    return proc


def load_projects(index_path):
    if not index_path.exists():
        return []
    with index_path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    return data.get("projects", [])


def git_root(path):
    proc = run(["git", "-C", str(path), "rev-parse", "--show-toplevel"])
    if proc.returncode != 0:
        return None
    return Path(proc.stdout.strip()).resolve()


def sanitize_slug(value):
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9._-]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-._")
    return value[:48] or "task"


def project_matches(project, project_id, repo_root):
    if project_id and project.get("project_id") == project_id:
        return True
    repo_path = project.get("repo_path")
    if repo_root and repo_path:
        return Path(repo_path).expanduser().resolve() == repo_root
    return False


def resolve_project(args, projects):
    repo_root = None
    if args.repo:
        repo_arg = Path(args.repo).expanduser().resolve()
        repo_root = git_root(repo_arg) or repo_arg
    if not repo_root and args.cwd:
        cwd_root = git_root(Path(args.cwd).expanduser().resolve())
        repo_root = cwd_root

    for project in projects:
        if project_matches(project, args.project, repo_root):
            return {
                "project_id": project["project_id"],
                "display_name": project.get("display_name") or project["project_id"],
                "repo_path": Path(project["repo_path"]).expanduser().resolve(),
                "known_project": True,
            }

    if args.project and not repo_root:
        raise RuntimeError(f"Unknown project id: {args.project}")
    if not repo_root:
        raise RuntimeError("Could not resolve a git repository. Pass --project or --repo.")

    project_id = args.project or repo_root.name
    return {
        "project_id": sanitize_slug(project_id),
        "display_name": project_id,
        "repo_path": repo_root,
        "known_project": False,
    }


def is_under(path, root):
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def current_branch(repo_path):
    proc = run(["git", "-C", str(repo_path), "branch", "--show-current"])
    return proc.stdout.strip() if proc.returncode == 0 else ""


def status_lines(repo_path):
    proc = run(["git", "-C", str(repo_path), "status", "--porcelain"])
    if proc.returncode != 0:
        raise RuntimeError(f"Could not read git status for {repo_path}: {proc.stderr.strip()}")
    return [line for line in proc.stdout.splitlines() if line.strip()]


def default_base(repo_path):
    for ref in ("origin/main", "origin/master"):
        proc = run(["git", "-C", str(repo_path), "rev-parse", "--verify", "--quiet", ref])
        if proc.returncode == 0:
            return ref
    proc = run(["git", "-C", str(repo_path), "remote", "show", "origin"])
    if proc.returncode == 0:
        for line in proc.stdout.splitlines():
            match = re.search(r"HEAD branch:\s*(\S+)", line)
            if match:
                return f"origin/{match.group(1)}"
    raise RuntimeError("Could not find origin/main, origin/master, or remote HEAD.")


def main():
    parser = argparse.ArgumentParser(description="Create an isolated task worktree from an upstream baseline.")
    parser.add_argument("--project", help="Project id from ~/codex/WORKSPACE_INDEX.json.")
    parser.add_argument("--repo", help="Absolute or relative path to a git repo.")
    parser.add_argument("--cwd", default=os.getcwd(), help="Current working directory used for auto-detection.")
    parser.add_argument("--slug", required=True, help="Short task slug used in path and branch names.")
    parser.add_argument("--branch", help="Task branch name. Defaults to task/<date>-<slug>-<id>.")
    parser.add_argument("--base", help="Remote-tracking base ref. Defaults to origin/main or origin/master.")
    parser.add_argument("--index", default=str(DEFAULT_INDEX), help="Workspace index path.")
    parser.add_argument("--worktree-root", default=str(DEFAULT_WORKTREE_ROOT), help="Root for task worktrees.")
    parser.add_argument(
        "--allow-dirty-canonical",
        action="store_true",
        help="Create the worktree even if the canonical checkout is dirty. Use only with explicit user approval.",
    )
    args = parser.parse_args()

    slug = sanitize_slug(args.slug)
    cwd = Path(args.cwd).expanduser().resolve()
    if is_under(cwd, DEFAULT_WORKTREE_ROOT) or is_under(cwd, SERVER_WORKTREE_ROOT):
        root = git_root(cwd)
        print(json.dumps({"status": "already_isolated", "worktree_path": str(root or cwd)}, indent=2))
        return 0

    projects = load_projects(Path(args.index).expanduser())
    project = resolve_project(args, projects)
    repo_path = project["repo_path"]
    if not (repo_path / ".git").exists() and git_root(repo_path) != repo_path:
        raise RuntimeError(f"Not a git repository: {repo_path}")

    dirty = status_lines(repo_path)
    if dirty and not args.allow_dirty_canonical:
        print(
            json.dumps(
                {
                    "status": "blocked_dirty_canonical",
                    "repo_path": str(repo_path),
                    "dirty_count": len(dirty),
                    "dirty_preview": dirty[:20],
                    "next_step": "Reconcile or migrate the canonical checkout before starting new implementation.",
                },
                indent=2,
            ),
            file=sys.stderr,
        )
        return 2

    fetch = run(["git", "-C", str(repo_path), "fetch", "--prune", "origin"])
    if fetch.returncode != 0:
        raise RuntimeError(f"Fetch failed for {repo_path}: {fetch.stderr.strip() or fetch.stdout.strip()}")

    base = args.base or default_base(repo_path)
    verify_base = run(["git", "-C", str(repo_path), "rev-parse", "--verify", "--quiet", base])
    if verify_base.returncode != 0:
        raise RuntimeError(f"Base ref does not exist after fetch: {base}")

    task_id = secrets.token_hex(3)
    date = datetime.now().strftime("%Y%m%d")
    branch = args.branch or f"task/{date}-{slug}-{task_id}"
    worktree_path = Path(args.worktree_root).expanduser().resolve() / project["project_id"] / f"{date}-{slug}-{task_id}"

    if worktree_path.exists():
        raise RuntimeError(f"Worktree path already exists: {worktree_path}")
    branch_exists = run(["git", "-C", str(repo_path), "rev-parse", "--verify", "--quiet", branch])
    if branch_exists.returncode == 0:
        raise RuntimeError(f"Branch already exists: {branch}")

    worktree_path.parent.mkdir(parents=True, exist_ok=True)
    add = run(["git", "-C", str(repo_path), "worktree", "add", "-b", branch, str(worktree_path), base])
    if add.returncode != 0:
        raise RuntimeError(f"git worktree add failed: {add.stderr.strip() or add.stdout.strip()}")

    result = {
        "status": "created",
        "project_id": project["project_id"],
        "known_project": project["known_project"],
        "repo_path": str(repo_path),
        "worktree_path": str(worktree_path),
        "branch": branch,
        "base": base,
        "canonical_branch": current_branch(repo_path),
        "canonical_dirty_allowed": bool(dirty),
        "next_commands": [
            f"cd {worktree_path}",
            "git status --short --branch",
        ],
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, indent=2), file=sys.stderr)
        raise SystemExit(1)
