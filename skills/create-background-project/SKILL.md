---
name: create-background-project
description: "Use when Codex is asked to create, add, scaffold, expose, install, or register a new local background project, daemon, worker, LaunchAgent, tunnel-backed service, scheduled job, or long-running local runtime. Before creating anything, require an explicit capability-fit check: confirm no existing project, LaunchAgent, route, worker, script, or skill already covers the need, and confirm the need should not be integrated into an existing capability."
---

# Create Background Project

## Goal

Create a new background project only when it is justified, discoverable, maintainable, and verifiable. Prefer extending an existing governed project over adding another daemon.

## Admission Gate

Do not create a new background project until all checks pass:

1. Search existing capabilities first: skills, repos under `~/codex/projects`, runtime trees under `~/codex/runtime/projects`, LaunchAgents, scripts, ports, routes, and docs.
2. Decide whether the request belongs inside an existing project. Integrate instead of creating when the same lifecycle, route, data, logs, or owner already exists.
3. State the evidence for creating a new project: missing capability, expected owner, runtime boundary, route or schedule, logs, and cleanup responsibility.
4. If evidence is weak, pause and recommend extending the closest existing capability.

Use `rg`, `launchctl list`, `~/Library/LaunchAgents`, `~/.config/codex`, `~/Library/Logs`, and `~/codex/projects` before deciding.

## Naming

Use stable, descriptive slugs:

- Project id: lowercase hyphen-case, product/domain first, role second, for example `ashare-dashboard`, `ai-control-platform`, `local-control-server`.
- LaunchAgent label: `com.codex.<project>.<component>` for project services or `com.codex.project-tunnel.<project>` for route tunnels.
- Wrapper executable: `~/.config/codex/launch-items/bin/codex-<project>-<component>` or `codex-tunnel-<project>`.
- Log files: `~/Library/Logs/codex-<project>-<component>.log` and `.err.log`.
- Public route: `/projects/<project>/` unless a durable product route already exists.

Never leave macOS Login Items showing generic `bash`, `zsh`, `python3`, or `ssh`. `ProgramArguments[0]` must be a descriptive wrapper executable, even if the wrapper internally calls a shell script.

## Runtime Shape

Prefer this structure:

- Canonical repo: `~/codex/projects/<project>`.
- Live runtime copy when needed: `~/codex/runtime/projects/<project>`.
- Local config/env: `~/.config/codex/<project>.env` or `~/.config/codex/project-tunnel.<project>.env`.
- LaunchAgent plist: `~/Library/LaunchAgents/<label>.plist`.
- Wrapper: `~/.config/codex/launch-items/bin/<name>`.
- Logs: `~/Library/Logs/codex-*.log`.

Separate editable source from live runtime when background services must remain stable during development.

## Implementation Workflow

1. Inventory current state and document why a new project is justified.
2. Create code in the canonical repo or an isolated worktree according to the local repo rules.
3. Add a start script with a shebang, `set -euo pipefail` where appropriate, and explicit env-file loading.
4. Add a descriptive wrapper and point the LaunchAgent at the wrapper path as `ProgramArguments[0]`.
5. Add log paths, `RunAtLoad`, and `KeepAlive` or `StartInterval` only when the service really needs them.
6. Add log retention or cleanup at creation time for high-volume logs, databases, backups, caches, screenshots, and generated artifacts.
7. If public access is needed, register the project tunnel or edge route and document the local port and route owner.
8. Add tests or deterministic checks for generated plist/wrapper behavior when the project has code that will regenerate runtime config.

## Verification

Before final response:

- Run syntax checks for scripts and plist validation with `plutil -lint`.
- Bootstrap or kickstart the LaunchAgent and inspect `launchctl print gui/$(id -u)/<label>`.
- Confirm loaded `program =` points at the descriptive wrapper.
- Probe local health endpoints or ports.
- For public routes, use the project's documented development-auth flow or approved local helper and verify the real served route with curl and, when UI-facing, a browser. Do not publish private auth helper implementations or bypass tokens in reusable skill content.
- Push/merge repo changes when the workflow requires closeout.

## Closeout

Report:

- Why a new background project was necessary.
- Created labels, wrappers, routes, ports, logs, and retention.
- What was verified locally and publicly.
- Any remaining operational risk or manual dependency.
