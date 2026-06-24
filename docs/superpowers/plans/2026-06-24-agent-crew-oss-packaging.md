# agent-crew — OSS Packaging & Publish (Plan 3 / 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Make `agent-crew` a polished, publishable open-source package — README, LICENSE, CONTRIBUTING, docs, a worked example, CI — then publish the repo to GitHub. (npm publish is prepared but left to the user — it needs their npm auth and is an irreversible public action.)

**Architecture:** Pure docs/config/CI additions. No changes to `src/`. The test suite (26) stays green; `npm pack --dry-run` is the packaging gate.

**Tech Stack:** Markdown, JSON, GitHub Actions YAML, `gh` CLI.

---

## File Structure

| Path | Responsibility |
|---|---|
| `LICENSE` | MIT license text |
| `README.md` | Landing doc: what/why, quickstart, architecture, commands, links |
| `CONTRIBUTING.md` | How to contribute; the engine/roles/CLI split |
| `docs/how-it-works.md` | Engine deep-dive (.inbox, tmux, lazy bootstrap, onboarding) |
| `docs/customizing.md` | How to edit roles, add a role, tune config |
| `docs/config-reference.md` | Every `team.config.yaml` key documented |
| `examples/sync-matrix/team.config.yaml` | Real-world example config |
| `examples/sync-matrix/README.md` | Narrative: the project agent-crew was extracted from |
| `.github/workflows/test.yml` | CI: run `npm test` on push/PR |
| `package.json` | Add repository/homepage/bugs/keywords/author metadata |
| `.npmignore` | Exclude docs/examples/test from the published tarball |

---

## Task 1: LICENSE + package.json metadata

**Files:** Create `LICENSE`; Modify `package.json`.

- [ ] **Step 1:** Create `LICENSE` — standard MIT text, copyright `2026 Andrii Popovych`.

- [ ] **Step 2:** Add to `package.json` (merge into existing object, keep all current fields):
```json
{
  "author": "Andrii Popovych",
  "homepage": "https://github.com/AndriiPopovych/agent-crew#readme",
  "repository": { "type": "git", "url": "git+https://github.com/AndriiPopovych/agent-crew.git" },
  "bugs": { "url": "https://github.com/AndriiPopovych/agent-crew/issues" },
  "keywords": ["claude", "claude-code", "ai-agents", "multi-agent", "tmux", "scaffolding", "cli", "orchestration", "subagents"]
}
```

- [ ] **Step 3:** Verify `cd /Users/andrii/Documents/projects/agent-crew && node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` (no error) and `npm test` still 26/26.

- [ ] **Step 4: Commit**
```bash
git add LICENSE package.json
git commit -m "chore: MIT license + npm package metadata"
```

---

## Task 2: .npmignore (lean published tarball)

**Files:** Create `.npmignore`.

- [ ] **Step 1:** Create `.npmignore` so the published package ships only `bin/`, `src/`, `templates/` (already the `files` allowlist) — but explicitly exclude dev cruft in case `files` is ever removed:
```
docs/
examples/
test/
.github/
.agent-crew/
*.test.mjs
```

- [ ] **Step 2: Verify the tarball contents:**
Run `cd /Users/andrii/Documents/projects/agent-crew && npm pack --dry-run 2>&1 | tail -40`.
Expected: includes `bin/cli.mjs`, all `src/*.mjs`, all `templates/**`, `package.json`, `LICENSE`, `README.md`; EXCLUDES `test/`, `docs/`, `examples/`, `.github/`. (Note: `README.md` + `LICENSE` are always included by npm regardless of ignore.)

- [ ] **Step 3: Commit**
```bash
git add .npmignore
git commit -m "chore: .npmignore for lean published package"
```

---

## Task 3: README.md

**Files:** Create `README.md`.
**Context for the writer:** Read `docs/superpowers/specs/2026-06-24-agent-crew-design.md` for the full design, and `bin/cli.mjs` for the exact commands. The README is the project's front door.

- [ ] **Step 1:** Write `README.md` (English, since it's an OSS landing page — but it's fine to note the agents communicate in the project's configured language). Include these sections:
  - **Title + one-line pitch:** "Drop a proven multi-agent Claude Code crew into any repo with one command."
  - **What it is:** 6-role tmux-based crew (teamlead, dev, qa + optional ux/architect/techwriter), each a persistent Claude Code process in its own tmux session, coordinating via a `.agent-crew/.inbox/` file protocol. Extracted and generalized from a real production project.
  - **Why tmux (not native subagents):** persistent, parallel agents with isolated context that live for hours.
  - **Quickstart:**
    ```bash
    cd your-project
    npx agent-crew init      # autodetect stack, confirm, scaffold .agent-crew/
    agent-crew doctor        # check tmux, package manager, port
    agent-crew launch        # start the teamlead; it self-onboards on first run
    ```
    Then: "talk only to the teamlead — give it a task in plain language; it clarifies, decomposes, delegates dev → review → QA → commit."
  - **Commands table:** init / launch / onboard / sync / doctor (from `bin/cli.mjs` help).
  - **Architecture:** the 3-layer split (engine protocol / role templates / `team.config.yaml`), plus an ASCII pipeline diagram: `teamlead → [architect] → [ux] → dev → review → qa → commit → [techwriter]`.
  - **What lands in your repo:** the `.agent-crew/` tree (self-contained, gitignore the `.inbox/`).
  - **Onboarding:** CLI seeds static facts; teamlead does a deep self-onboarding on first launch.
  - **Requirements:** Node ≥20, tmux, Claude Code CLI, git.
  - **Honest limitations:** CI tests the scaffolder, not live agents (those need a real Claude Code session); `init` is interactive.
  - **Links:** docs/how-it-works.md, docs/config-reference.md, docs/customizing.md, CONTRIBUTING.md, examples/sync-matrix.
  - **License:** MIT.
  - NO placeholders, NO fabricated benchmarks/badges that don't exist. A real npm-version badge is fine to include as `![npm](https://img.shields.io/npm/v/agent-crew)` since we will publish.

- [ ] **Step 2: Verify** no TODO/placeholder text; `npm test` still 26/26.

- [ ] **Step 3: Commit**
```bash
git add README.md
git commit -m "docs: README"
```

---

## Task 4: docs/ trio

**Files:** Create `docs/how-it-works.md`, `docs/customizing.md`, `docs/config-reference.md`.
**Context:** Read `templates/agents/_shared/protocol.md`, `src/render.mjs` (renderProjectMd shows the config→project.md mapping), `src/config.mjs` (buildConfig shows the full schema), `src/scaffold.mjs` (the generated tree), `bin/cli.mjs`.

- [ ] **Step 1: `docs/how-it-works.md`** — explain the engine: the `.agent-crew/.inbox/` protocol (status.md state machine + phases, versioned artifacts, atomic writes), tmux session model + lazy bootstrap, the two-phase onboarding (CLI seed + teamlead deep onboarding), memory protocol. Derive content from `protocol.md` + the role files — do not invent behavior.

- [ ] **Step 2: `docs/customizing.md`** — how to: edit a role's `CLAUDE.md` (and that `agent-crew sync` won't overwrite it — only `project.md` + `_bin/` are regenerated); add project gotchas / sources_of_truth in `team.config.yaml`; set a `quality_standard`; enable/disable optional roles (edit config `roles:` then re-init or hand-create the role dir); the engine/role/config layering for contributors.

- [ ] **Step 3: `docs/config-reference.md`** — document EVERY `team.config.yaml` key from `src/config.mjs` buildConfig: `project.{name,root,language}`, `runtime.{package_manager,exec_prefix}`, `commands.{dev,build,lint,test,e2e}`, `devserver.{port,health_url}`, `roles.*`, `sources_of_truth[]`, `quality_standard`, `memory.path`, `gotchas[]`. For each: type, what it does, where it flows (project.md / _bin / session prefix), default.

- [ ] **Step 4: Verify** the documented keys exactly match `buildConfig` output in `src/config.mjs` (no invented keys). `npm test` 26/26.

- [ ] **Step 5: Commit**
```bash
git add docs/how-it-works.md docs/customizing.md docs/config-reference.md
git commit -m "docs: how-it-works, customizing, config-reference"
```

---

## Task 5: examples/sync-matrix

**Files:** Create `examples/sync-matrix/team.config.yaml`, `examples/sync-matrix/README.md`.

- [ ] **Step 1: `examples/sync-matrix/team.config.yaml`** — a realistic example config showing a populated setup (this is the project agent-crew was extracted from). Use a Next.js/bun/Supabase stack as the EXAMPLE VALUES (this is fine in `examples/` — it is NOT a template, so the genericity guard does not apply to it; the guard only scans `templates/`). Fill: name `sync-matrix`, language `ua`, package_manager `bun`, exec_prefix `bun --bun`, commands, port 3000, all roles enabled, a few realistic `sources_of_truth` and `gotchas` (e.g. the `bun --bun` Node-18 gotcha), `quality_standard: docs/principles.md`.

- [ ] **Step 2: `examples/sync-matrix/README.md`** — short narrative: "agent-crew was extracted from sync-matrix, a real combat-ops planning app. This is a representative config. Note: example values (Supabase, Next.js) are illustrative; your `agent-crew init` autodetects your own stack."

- [ ] **Step 3: Verify** the config parses: `cd /Users/andrii/Documents/projects/agent-crew && node -e "import('yaml').then(y=>console.log(!!y.parse(require('fs').readFileSync('examples/sync-matrix/team.config.yaml','utf8'))))"` prints `true`. Confirm `npm test` 26/26 (guard must still pass — examples/ is outside templates/, so no leak failure).

- [ ] **Step 4: Commit**
```bash
git add examples/
git commit -m "docs: worked example (sync-matrix config)"
```

---

## Task 6: CONTRIBUTING.md + CI

**Files:** Create `CONTRIBUTING.md`, `.github/workflows/test.yml`.

- [ ] **Step 1: `CONTRIBUTING.md`** — dev setup (`npm install`, `npm test`), the architecture split (engine `templates/agents/_shared/protocol.md` = project-agnostic; role `CLAUDE.md` = behavior; CLI `src/` = scaffolding logic), the genericity guard (`test/templates-generic.test.mjs` — no project-specific tokens in `templates/`), TDD expectation, conventional-commit style, how to propose a new role.

- [ ] **Step 2: `.github/workflows/test.yml`:**
```yaml
name: test
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm test
```

- [ ] **Step 3: Verify** YAML is valid: `cd /Users/andrii/Documents/projects/agent-crew && node -e "import('yaml').then(y=>{y.parse(require('fs').readFileSync('.github/workflows/test.yml','utf8'));console.log('valid')})"`. Confirm `npm ci` works locally (lockfile present) and `npm test` 26/26.

- [ ] **Step 4: Commit**
```bash
git add CONTRIBUTING.md .github/workflows/test.yml
git commit -m "chore: CONTRIBUTING + GitHub Actions CI"
```

---

## Task 7: Publish to GitHub

**Files:** none.

- [ ] **Step 1:** Final full verification: `cd /Users/andrii/Documents/projects/agent-crew && npm test` (26/26) and `npm pack --dry-run 2>&1 | tail -20` (correct tarball).

- [ ] **Step 2:** This is the only outward-facing step. The controller (not a subagent) performs it: merge `feat/oss-packaging` into `main`, then create the public GitHub repo and push:
```bash
cd ~/Documents/projects/agent-crew
gh repo create agent-crew --public --source=. --remote=origin --description "Drop a proven multi-agent Claude Code crew into any repo with one command." --push
```
(If `gh repo create` with `--push` does not push all history, follow with `git push -u origin main`.)

- [ ] **Step 3:** Verify the repo exists and CI is green: `gh repo view --web` (or `gh run list`).

- [ ] **Step 4 (npm — DEFERRED to user):** Do NOT run `npm publish`. The package is publish-ready. Document the command for the user: after `npm login`, run `npm publish --access public` from the repo root. Note: confirm the name `agent-crew` is free on npm first (`npm view agent-crew` → 404 means free).

---

## Self-Review

**Spec coverage (design spec §8 open-source packaging, §9 testing note):**
- MIT license → Task 1 ✓
- README + architecture diagram → Task 3 ✓
- examples/sync-matrix → Task 5 ✓
- CONTRIBUTING + engine/roles/CLI split → Task 6 ✓
- docs trio → Task 4 ✓
- CI (tests the scaffolder, not live agents — stated honestly in README) → Task 6 + Task 3 ✓
- Publish to GitHub → Task 7 ✓; npm publish prepared + deferred to user (irreversible/public, needs their auth) ✓

**Placeholder scan:** README/docs tasks explicitly forbid TODO/placeholder/fabricated badges. The npm-version badge is real (we publish-ready the package).

**Consistency:** repo URL `github.com/AndriiPopovych/agent-crew` used in package.json + README + workflow; config keys in `docs/config-reference.md` must match `src/config.mjs` exactly (Task 4 step 4 verifies); `examples/` is intentionally outside `templates/` so the genericity guard does not flag its illustrative stack values.
