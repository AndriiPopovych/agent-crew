# `team.config.yaml` reference

This document covers every key produced by `buildConfig()` in `src/config.mjs`. Do not add keys that are not listed here — unknown keys are ignored by the engine.

Edit `team.config.yaml`, then run `agent-crew sync` to regenerate `_shared/project.md` and `_bin/*.sh`.

---

## `project`

Basic project identity.

### `project.name`

| | |
|---|---|
| **Type** | string |
| **Required** | yes |
| **Default** | detected from `package.json#name` or directory name |

The canonical project name. Flows into:
- tmux session prefix: all sessions are named `<project.name>-<role>` (e.g. `myapp-teamlead`)
- `project.md` heading and "Базове" section
- `_bin/launch.sh` — the `SESSION` variable

### `project.root`

| | |
|---|---|
| **Type** | string (absolute path) |
| **Required** | yes |
| **Default** | `process.cwd()` at init time (or git repo root if inside a git repo) |

Absolute path to the project root. Flows into:
- `project.md` "Корінь" field
- `_bin/launch.sh` and `_bin/ensure-role.sh` — the `ROOT` variable used as tmux session working directory

Do not change this after init unless you move the project.

### `project.language`

| | |
|---|---|
| **Type** | string |
| **Required** | no |
| **Default** | `"ua"` |

Language agents use when communicating. Flows into `project.md` "Мова спілкування агентів" field. Set to `"en"` for English-language projects.

---

## `runtime`

Runtime environment for the project.

### `runtime.package_manager`

| | |
|---|---|
| **Type** | string (`"bun"` \| `"pnpm"` \| `"yarn"` \| `"npm"`) |
| **Default** | detected from lockfile (`bun.lock`/`bun.lockb` → `bun`, `pnpm-lock.yaml` → `pnpm`, `yarn.lock` → `yarn`, `package-lock.json` → `npm`) |

The package manager used by the project. Flows into `project.md` "Package manager" field.

### `runtime.exec_prefix`

| | |
|---|---|
| **Type** | string |
| **Default** | derived from `package_manager`: `bun` → `"bun --bun"`, `pnpm` → `"pnpm"`, `yarn` → `"yarn"`, `npm` → `"npm"` |

The prefix prepended to `run <script>` invocations. Flows into `project.md` "Exec prefix" field and is used by generated `commands` values.

---

## `commands`

Shell commands for common dev lifecycle actions. Each value is a full shell command string (e.g. `"bun --bun run dev"`). Set a key to `null` or omit it to indicate "not applicable".

All non-null commands appear in `project.md`'s commands table and inform agents how to run the project.

### `commands.dev`

| | |
|---|---|
| **Type** | string \| null |
| **Default** | detected from `package.json#scripts.dev` |

Start the development server. Also used in `_bin/launch.sh` as the command comment reference and in the dev server startup bootstrap.

### `commands.build`

| | |
|---|---|
| **Type** | string \| null |
| **Default** | detected from `package.json#scripts.build` |

Production build command.

### `commands.lint`

| | |
|---|---|
| **Type** | string \| null |
| **Default** | detected from `package.json#scripts.lint` |

Lint command. Agents run this as part of their pre-commit checklist.

### `commands.test`

| | |
|---|---|
| **Type** | string \| null |
| **Default** | detected from `package.json#scripts.test` |

Unit/integration test command.

### `commands.e2e`

| | |
|---|---|
| **Type** | string \| null |
| **Default** | detected from `package.json#scripts.test:e2e`; `null` if not present |

End-to-end test command. `null` means no E2E suite is configured; omitted from `project.md` table when null.

---

## `devserver`

Dev server configuration used by QA for browser testing and health checks.

### `devserver.port`

| | |
|---|---|
| **Type** | number |
| **Required** | yes (validated — must be a number) |
| **Default** | detected from framework: Next.js → `3000`, Vite → `5173`, Astro → `4321`, react-scripts → `3000`; fallback `3000` |

The port the dev server listens on. Flows into:
- `project.md` "Порт" field
- `_bin/doctor.sh` — checks that the port is free at startup
- `_bin/launch.sh` — referenced in health-check polling logic

### `devserver.health_url`

| | |
|---|---|
| **Type** | string (URL) |
| **Default** | `http://localhost:<port>` |

URL to `curl` for health checks. Flows into `project.md` "Health URL" field and is used by `_bin/doctor.sh`.

---

## `roles`

Which agent roles are scaffolded and active. Core roles are always `true`; optional roles default to `false`.

### `roles.teamlead`

| | |
|---|---|
| **Type** | boolean |
| **Default** | `true` (always) |
| **Validated** | must be `true` |

The orchestrator role. Cannot be disabled.

### `roles.dev`

| | |
|---|---|
| **Type** | boolean |
| **Default** | `true` (always) |
| **Validated** | must be `true` |

The developer role. Cannot be disabled.

### `roles.qa`

| | |
|---|---|
| **Type** | boolean |
| **Default** | `true` (always) |
| **Validated** | must be `true` |

The QA role. Cannot be disabled.

### `roles.ux`

| | |
|---|---|
| **Type** | boolean |
| **Default** | `false` |

Optional UX analyst role. When `true` at `agent-crew init`, `.agent-crew/agents/ux/CLAUDE.md` is scaffolded. Teamlead boots the `<prefix>-ux` tmux session lazily on first `ux-required` task.

### `roles.architect`

| | |
|---|---|
| **Type** | boolean |
| **Default** | `false` |

Optional architect role. When `true` at `agent-crew init`, `.agent-crew/agents/architect/CLAUDE.md` is scaffolded. Teamlead boots the `<prefix>-architect` session lazily for periodic scans and pre-implementation reviews.

### `roles.techwriter`

| | |
|---|---|
| **Type** | boolean |
| **Default** | `false` |

Optional tech writer role. When `true` at `agent-crew init`, `.agent-crew/agents/techwriter/CLAUDE.md` is scaffolded. Teamlead boots the `<prefix>-techwriter` session lazily on `docs-required` tasks.

---

## `sources_of_truth`

A list of file paths (or globs) agents should consult for requirements and conventions. Each entry is an object with three fields.

**Default (set by `buildConfig`):**

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
```

### `sources_of_truth[].path`

| | |
|---|---|
| **Type** | string (path or glob relative to project root) |

The file or glob pattern to read. Appears in `project.md`'s "Джерела правди" table.

### `sources_of_truth[].what`

| | |
|---|---|
| **Type** | string |

Human-readable description of what this source contains. Tells agents why to read it.

### `sources_of_truth[].how`

| | |
|---|---|
| **Type** | string |

How to read it: e.g. `"read once"`, `"grep by topic"`, `"read before decomposing each task"`.

All three fields flow into `project.md`'s sources table, which every role reads on bootstrap.

---

## `quality_standard`

| | |
|---|---|
| **Type** | string (file path) \| null |
| **Default** | `null` |

Path to a document that defines the code review standard. Teamlead uses it as the reference during code review.

**Fallback when `null`:** `.agent-crew/knowledge/principles.md` (the generic principles file copied from the package template at init time).

Flows into `project.md`'s "Quality standard" section.

Example:

```yaml
quality_standard: docs/engineering/review-standards.md
```

---

## `memory`

Memory file configuration.

### `memory.path`

| | |
|---|---|
| **Type** | string (file path, may use `~`) |
| **Default** | `~/.claude/projects/<slug>/memory/MEMORY.md` where `<slug>` is derived from `project.root` |

Path to the MEMORY.md file that persists context across agent sessions. The slug is computed by `memorySlug(root)` in `src/config.mjs`: strips the leading `/`, replaces remaining `/` with `-`, and prepends `-`.

Flows into `project.md`'s "Memory" section. Teamlead reads it on every session start; all other roles read it but never write to it directly.

---

## `gotchas`

| | |
|---|---|
| **Type** | string[] |
| **Default** | `[]` (empty list) |

A list of free-text warnings that appear in every role's `project.md` under "Project gotchas". Use for things that commonly trip up agents: migration order, port conflicts, environment variable requirements, destructive operations that need confirmation, etc.

Example:

```yaml
gotchas:
  - "Run DB migrations before starting the dev server"
  - "Port 5432 must be free — stop local Postgres if running"
```

When the list is empty, `project.md` shows a placeholder prompting you to add entries. After editing, run `agent-crew sync`.

---

## Complete example

```yaml
# agent-crew project config — single source of truth.
# Edit then run `agent-crew sync` to regenerate generated files.

project:
  name: myapp
  root: /Users/alice/projects/myapp
  language: en

runtime:
  package_manager: bun
  exec_prefix: bun --bun

commands:
  dev: bun --bun run dev
  build: bun --bun run build
  lint: bun --bun run lint
  test: bun --bun run test
  e2e: bun --bun run test:e2e

devserver:
  port: 3000
  health_url: http://localhost:3000

roles:
  teamlead: true
  dev: true
  qa: true
  ux: false
  architect: true
  techwriter: false

sources_of_truth:
  - path: README.md
    what: project overview, how to run
    how: read once
  - path: CLAUDE.md
    what: architecture, conventions (if present)
    how: read once
  - path: docs/**/*.md
    what: existing documentation
    how: grep by topic

quality_standard: docs/engineering/review-standards.md

memory:
  path: ~/.claude/projects/-Users-alice-projects-myapp/memory/MEMORY.md

gotchas:
  - Always run `bun --bun run db:migrate` before starting the dev server
```
