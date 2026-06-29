# Customizing your agent crew

This document explains the five main customization points: role `CLAUDE.md` files, `gotchas` and `sources_of_truth`, `quality_standard`, optional roles, and the engine/role/config layering.

---

## 1. Editing a role's `CLAUDE.md`

Each enabled role gets its own `CLAUDE.md` under `.agent-crew/agents/<role>/CLAUDE.md`. This is the role's primary instruction set — it governs how that Claude Code session behaves throughout its lifetime.

**You can edit these files freely.** Adjust the dev role's review checklist, tighten the QA role's test requirements, or rewrite the teamlead's decomposition rules to match your workflow.

**`agentcrew sync` will NOT overwrite your edits.** The sync command (implemented in `src/sync.mjs`) regenerates only two things:

1. `.agent-crew/agents/_shared/project.md` — the generated project context (from `team.config.yaml`)
2. `.agent-crew/_bin/*.sh` — the generated shell scripts (`launch.sh`, `doctor.sh`, `ensure-role.sh`)

Role `CLAUDE.md` files are never touched by sync. They are written once at `agentcrew init` (copied verbatim from `templates/agents/<role>/CLAUDE.md`) and are yours to own from that point.

> If you want to reset a role's `CLAUDE.md` to the upstream template, copy it manually from the npm package's `templates/agents/<role>/CLAUDE.md`. Sync will not do this automatically.

---

## 2. Adding `gotchas` and `sources_of_truth`

Both fields live in `team.config.yaml`. Edit them directly, then run `agentcrew sync` to regenerate `project.md` so every agent sees the updated context on their next bootstrap.

### `gotchas`

A list of free-text warnings that appear in every role's `project.md` under "Project gotchas". Use this for things that trip up agents repeatedly:

```yaml
gotchas:
  - "Always run migrations before starting the dev server"
  - "The `users` table has RLS enabled — direct inserts in tests require service-role key"
  - "Port 5173 is also used by the storybook dev server — kill it before QA"
```

After editing, run:

```bash
agentcrew sync
```

The updated gotchas will appear in `.agent-crew/agents/_shared/project.md` and every role will read them on next bootstrap.

### `sources_of_truth`

A list of paths (or globs) that agents should consult for requirements and conventions. Each entry has three fields:

```yaml
sources_of_truth:
  - path: README.md
    what: "project overview, how to run"
    how: "read once"
  - path: CLAUDE.md
    what: "architecture, conventions (if present)"
    how: "read once"
  - path: docs/**/*.md
    what: "existing documentation"
    how: "grep by topic"
  - path: docs/spec/requirements.md
    what: "feature requirements and acceptance criteria"
    how: "read before decomposing each task"
```

These appear in `project.md`'s "Sources of truth" table. Teamlead consults them when decomposing tasks; dev and QA consult them when scoping work. The three default entries (README, CLAUDE.md, docs) are set by `buildConfig()` in `src/config.mjs` — add project-specific entries below them.

After editing, run `agentcrew sync`.

---

## 3. Setting `quality_standard`

`quality_standard` is the path to a document that defines your code review bar. Teamlead uses it as the reference when doing code review in the pipeline.

```yaml
quality_standard: docs/engineering/code-review-standards.md
```

**Fallback:** if `quality_standard` is `null` (the default after `init`), teamlead falls back to `.agent-crew/knowledge/principles.md` — the generic principles file copied from the package template at init time.

To override: set the path in `team.config.yaml` and run `agentcrew sync`. The path appears in `project.md`'s "Quality standard" section, which every role reads on bootstrap.

The path can be anything readable from the project root: a file you already have, a doc you write specifically for the crew, or an external standard you commit to your repo.

---

## 4. Enabling and disabling optional roles

Three roles are optional: `ux`, `architect`, and `techwriter`. Core roles (`teamlead`, `dev`, `qa`) are always enabled.

Configure them under `roles:` in `team.config.yaml`:

```yaml
roles:
  teamlead: true   # always true
  dev: true        # always true
  qa: true         # always true
  ux: false        # set to true to enable
  architect: true  # set to true to enable
  techwriter: false
```

**At `agent-crew init`:** only enabled roles get a `CLAUDE.md` copied into `.agent-crew/agents/<role>/`. Disabled roles have no directory.

**After init:** if you enable a role in `team.config.yaml` and run `agentcrew sync`, sync only regenerates `project.md` and `_bin/`. It does **not** create a new role directory. To add a role after init, copy the template manually:

```bash
mkdir -p .agent-crew/agents/ux
cp node_modules/agentcrew/templates/agents/ux/CLAUDE.md .agent-crew/agents/ux/CLAUDE.md
```

Then update `roles.ux: true` in `team.config.yaml` and run `agentcrew sync` so `project.md` lists the role as active.

Optional roles are launched **lazily** by teamlead — only when a task tagged `ux-required`, `architect-review`, or `docs-required` arrives. They are never started at `agentcrew launch` time.

---

## 5. gstack QA integration

[gstack](https://github.com/garrytan/gstack) is a collection of Claude Code skills that includes `/qa-only`, a browser-driven QA skill that launches a dev server, runs a visual pass, and reports findings.

**Detection at `agentcrew init`:** init checks for gstack at `~/.claude/skills/gstack`. If it is not found, init offers to install it — it prints the install command and asks for consent before doing anything. It never installs silently.

**Setting `qa_command`:** there are three options.

```yaml
# Option 1 — gstack (default when gstack is detected at init)
qa_command: /qa-only

# Option 2 — your own QA shell command
qa_command: "bun --bun run test && bun --bun run test:e2e"

# Option 3 — fall back to the project's test commands (commands.test + commands.e2e)
qa_command: ""
```

After changing `qa_command`, run `agentcrew sync` to propagate the value into `project.md`.

**`agentcrew doctor` warning:** if `qa_command` starts with `/` (i.e. it is a slash-skill) but gstack is absent from `~/.claude/skills/gstack`, doctor prints a warning and tells you how to install gstack. The warning does not block startup.

---

## 6. Engine / role / config layering


Understanding what lives where helps you know what to edit for any given change.

| Layer | Location | What to edit here | Regenerated by sync? |
|---|---|---|---|
| Engine | `src/*.mjs` (npm package source) | Core scaffold logic, detection, rendering, sync behavior | N/A — package code |
| Shared protocol | `templates/agents/_shared/protocol.md` | `.inbox/` contracts, atomic write rules, bootstrap polling patterns | No — copied once at init |
| Role definitions | `.agent-crew/agents/<role>/CLAUDE.md` | Role behavior, review checklists, decomposition rules, workflow steps | **No — yours to edit** |
| Shared project context | `.agent-crew/agents/_shared/project.md` | Generated from config — do not edit manually | **Yes — regenerated by sync** |
| Generated scripts | `.agent-crew/_bin/*.sh` | Generated from config — do not edit manually | **Yes — regenerated by sync** |
| Config | `.agent-crew/team.config.yaml` | Project name, commands, devserver, roles, gotchas, sources_of_truth, quality_standard, memory | No — your source of truth |
| Knowledge | `.agent-crew/knowledge/` | Filled by teamlead during onboarding; edit if you want to seed context manually | No |

**Rule of thumb:**
- To change *what agents do* → edit `.agent-crew/agents/<role>/CLAUDE.md`.
- To change *what agents know about the project* → edit `team.config.yaml`, then run `agentcrew sync`.
- To change *how the engine scaffolds or syncs* → open a PR to the `agent-crew` package itself.
- Never edit `project.md` or `_bin/*.sh` by hand — your changes will be overwritten by the next `sync`.
