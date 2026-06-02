---
name: maintain-background-projects
description: Use when Codex is asked to audit, list, explain, clean, repair, govern, or troubleshoot local background projects, LaunchAgents, login items, daemon-like scripts, project tunnels, scheduled jobs, stale worktrees, runtime directories, logs, ports, or public mounted routes. Use for questions like what is running, why macOS Login Items shows bash/zsh, whether background projects still matter, and how to prevent recurring service/config drift.
---

# Maintain Background Projects

## Goal

Maintain background projects as a governed system, not as one-off processes. Inventory first, classify evidence, repair root causes, then verify the actual runtime and any public routes.

## Safety Rules

- Do not kill, unload, delete, or rewrite unclear services until their label, command, owner, logs, and route impact are understood.
- Do not revert user changes or delete active development worktrees.
- Prefer fixing the generator or workflow that recreates bad config over editing only the generated plist.
- Back up LaunchAgents and valuable runtime data before destructive cleanup.
- Treat public routes, tunnels, and LaunchAgents as live-facing changes: restart/publish and verify the real served route before claiming completion.

## Inventory

Collect enough evidence to classify each item:

```bash
launchctl list | rg 'com\\.codex|com\\.hernando'
for p in ~/Library/LaunchAgents/com.codex*.plist ~/Library/LaunchAgents/com.hernando*.plist; do plutil -p "$p"; done
ps -axo pid,ppid,command | rg 'codex|project-tunnel|ssh -N|node|python|bash|zsh'
lsof -nP -iTCP -sTCP:LISTEN | rg 'node|python|ssh|mihomo|codex'
find ~/codex/projects ~/codex/runtime/projects ~/.config/codex ~/Library/Logs -maxdepth 3 -iname '*codex*' -o -iname '*project*'
git -C <repo> worktree list
```

Also inspect:

- `ProgramArguments[0]`, not only the LaunchAgent label.
- `StandardOutPath` and `StandardErrorPath`.
- env files under `~/.config/codex`.
- route ownership and project tunnels for `/projects/*`, `/chat`, `/chat-s3`, or other mounted paths.
- repo status, pushed commits, and active branches before deleting worktrees.

## Classify

For every item, assign one status:

- **Keep**: active, documented, verified, and still has a route, schedule, or local dependency.
- **Fix**: useful but has broken naming, stale plist generation, bad logs, missing retention, failed restart, or route drift.
- **Clean**: merged stale worktree, orphan runtime, dead LaunchAgent, duplicate service, obsolete backup/cache/log pile, or unowned plist.
- **Escalate**: unclear ownership, active uncommitted work, credentials, or public route risk.

Explain `lobechat` vs `lobechat-s3` style cases by checking route purpose and upstream ports instead of assuming names imply duplication.

## Common Repairs

### Login Items Show bash/zsh

Root cause is usually `ProgramArguments[0]` pointing to `/bin/bash` or `/bin/zsh`. Fix by:

1. Create a descriptive wrapper in `~/.config/codex/launch-items/bin`, for example `codex-ashare-backend`.
2. Make the wrapper executable and let it `exec` the real script.
3. Set plist `ProgramArguments` to only the wrapper path unless arguments must remain visible.
4. Reload with `launchctl bootout/bootstrap` or `launchctl kickstart -k`.
5. Verify `launchctl print ...` shows `program = <wrapper>`.
6. If a worker regenerates the plist, patch that generator and add a regression test.

### Stale Worktrees

Use `git worktree list`, branch status, and merge containment checks. Delete only worktrees whose branch is merged or whose contents are backed up and clearly abandoned. Keep active project worktrees.

### Log and Backup Growth

Find large directories with `du -sh`. Add retention scripts or LaunchAgents for recurring logs/backups instead of manually deleting once. Keep backups before removing runtime data.

### Broken Tunnels or Public Routes

Check local service, project tunnel agent, reverse SSH tunnel, edge proxy route, and browser/runtime path separately. For protected public routes, use the project's documented development-auth flow or approved local helper; do not place private auth helper implementations or bypass tokens in public skill content.

## Repair Workflow

1. Inventory and classify.
2. Stop only services that must be restarted for the repair.
3. Back up plists or data before mutation.
4. Repair the durable source: repo code, generator, LaunchAgent template, wrapper, env, retention policy, or docs.
5. Apply the generated/live config.
6. Reload services in dependency order: control service, control tunnel, project service, project tunnel, scheduled jobs.
7. Verify loaded programs, pids, exit statuses, logs, local ports, and public routes.
8. Commit and push repo changes when code or durable docs changed.
9. Remove temporary worktrees and Playwright/session artifacts.

## Verification Checklist

- `plutil -lint` passes for changed plists.
- Wrapper scripts pass shell syntax checks where applicable.
- `launchctl print gui/$(id -u)/<label>` shows the expected wrapper and running state, or a one-shot job has a successful status.
- Local health endpoints or ports respond.
- Public routes are verified with curl and browser when UI-facing.
- The recurring source of the problem is fixed, not only the current symptom.
- Final report lists kept, fixed, cleaned, and escalated items.

## Closeout

Keep the final answer short but include:

- What was cleaned or repaired.
- What was intentionally kept and why.
- What durable workflow fix prevents recurrence.
- Commands/checks that proved the services and public routes still work.
- Any remaining risk that needs user judgment.
