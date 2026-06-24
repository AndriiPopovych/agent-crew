# Contributing to agent-crew

## Dev setup

```bash
npm install   # installs the `yaml` dependency
npm test      # runs all tests with Node's built-in test runner
```

Requires **Node ≥ 20** (the project uses `node:test`, ES modules, and `--experimental-vm-modules`-free imports that landed in v20).

No build step — all source is plain `.mjs`.

---

## Architecture: what to edit where

### Engine — `templates/agents/_shared/protocol.md`

The project-agnostic coordination contract: the `.agent-crew/.inbox/` directory layout, `status.md` schema and atomic-write rules, tmux bootstrap patterns, memory ownership, and the self-check checklist before signalling the next agent.

**Changes here affect every project** that runs `agent-crew sync`, because `scaffold` copies this file verbatim into `.agent-crew/agents/_shared/protocol.md`. Edit carefully; a breaking change requires all host repos to re-sync.

### Roles — `templates/agents/<role>/CLAUDE.md`

Per-role behavior: what the agent reads on startup, how it picks up tasks, when it signals, what it produces. One file per role (`teamlead`, `dev`, `qa`, `ux`, `architect`, `techwriter`).

**Must stay generic** — no project-specific stack names, framework versions, or filesystem paths. The genericity guard (see below) rejects any template that leaks those.

### CLI — `src/*.mjs` + `bin/cli.mjs`

| Module | Responsibility |
|---|---|
| `bin/cli.mjs` | Entry point — parses `argv`, routes sub-commands |
| `src/detect.mjs` | Auto-detects runtime, commands, dev server from the host repo |
| `src/config.mjs` | `buildConfig` / `validateConfig` / `readConfig` / `writeConfig`, defines `OPT_ROLES` |
| `src/scaffold.mjs` | Creates `.agent-crew/` from templates; defines `CORE_ROLES` |
| `src/render.mjs` | Renders `_shared/project.md` and `_bin/*.sh` from `team.config.yaml` |
| `src/sync.mjs` | Re-renders generated files in an existing `.agent-crew/` |
| `src/doctor.mjs` | Validates the crew installation, reports drift |
| `src/launch.mjs` | Opens tmux sessions for enabled roles |
| `src/scan.mjs` | Lightweight repo scanner (language, entry files) |
| `src/seed.mjs` | Generates `knowledge/onboarding.md` + `knowledge/architecture.md` |
| `src/prompts.mjs` | Interactive prompts for `agent-crew init` |

### Generated (never hand-edit in a host repo)

`_shared/project.md` and `_bin/*.sh` inside `.agent-crew/` are produced by `agent-crew sync` from `team.config.yaml`. Editing them by hand in a host repo is pointless — the next `sync` overwrites them. Change `src/render.mjs` or `team.config.yaml` instead.

---

## The genericity guard

`test/templates-generic.test.mjs` scans **every `.md` file under `templates/`** and fails if any file contains a forbidden token:

```
sync-matrix, supabase, /root/projects, synchronization matri,
bun --bun, next.js / nextjs, MGRS, leaflet, PRD
```

These represent project-specific stack names, filesystem paths, and domain vocabulary that must never appear in reusable templates. The test also asserts that the core roles (`teamlead`, `dev`, `qa`) each reference both `protocol.md` and `project.md`.

**Before adding or editing template content, run `npm test` locally.** If you need to reference a specific technology in an example, put it in `docs/` or `examples/`, not in `templates/`.

---

## TDD expectation

Logic in `src/` is test-driven using `node:test`. Each module has a sibling test file:

```
src/config.mjs        →  test/config.test.mjs
src/detect.mjs        →  test/detect.test.mjs
src/render.mjs        →  test/render-project.test.mjs
                          test/render-bin.test.mjs
src/scaffold.mjs      →  test/scaffold.test.mjs
src/sync.mjs          →  test/sync.test.mjs
src/doctor.mjs        →  test/doctor-launch.test.mjs
src/scan.mjs          →  test/scan.test.mjs
src/seed.mjs          →  test/seed.test.mjs
src/prompts.mjs       →  test/prompts.test.mjs
bin/cli.mjs           →  test/smoke.test.mjs
                          test/e2e-init.test.mjs
```

New `src/` modules must ship with a `test/*.test.mjs` covering the happy path and at least one error branch.

---

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat:     new user-facing capability
fix:      bug fix
docs:     documentation only
chore:    tooling, config, dependencies
refactor: internal restructure (no behaviour change)
test:     adding or fixing tests
```

Examples:

```
feat: add --dry-run flag to agent-crew sync
fix: scaffold fails when .gitignore has no trailing newline
test: cover config.buildConfig with custom language option
```

---

## Proposing a new role

1. **Add** `templates/agents/<role>/CLAUDE.md` — describe what the agent reads on startup, its responsibilities, and how it signals completion. Keep it generic; run `npm test` to confirm the genericity guard passes.

2. **Wire it into config** — add the role name to `OPT_ROLES` in `src/config.mjs` and set its default to `false` in `buildConfig`.

3. **Wire it into scaffold** — `src/scaffold.mjs` already iterates `OPT_ROLES` filtered by `cfg.roles[r]`, so the role directory is copied automatically once it's in `OPT_ROLES`.

4. **Update render / prompts if optional** — if the role needs project-specific configuration, add its fields to `renderProjectMd` in `src/render.mjs` and an opt-in prompt to `src/prompts.mjs`.

5. **Add tests** — cover at least: scaffold with the role enabled, scaffold with it disabled, and any new `renderProjectMd` fields.

6. **Update `README.md`** — add the role to the roles table and any relevant usage examples.
