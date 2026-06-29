# agent-crew — gstack QA Integration (Plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Make gstack the recommended-default QA tooling: a configurable `qa_command` (default `/qa-only`) that the QA role + teamlead read from `project.md`; detection of gstack; and a consent-based offer to install it at `init`/`doctor` when missing. Never auto-install silently.

**Architecture:** A new pure `src/gstack.mjs` (detection + canonical install command, with an injectable skills dir for tests). `qa_command` flows through config → `project.md` → QA/teamlead roles (templates stay generic — they read the value, they don't hardcode gstack). `doctor` warns when `qa_command` is a slash-skill and gstack is absent. `init` offers to install gstack (consent only). Resolution: gstack present → `qa_command` defaults to `/qa-only`; user declines install → `qa_command` set to `""` (QA falls back to project run/test commands).

**Tech Stack:** Node ESM, `node:test`. gstack source: `github.com/garrytan/gstack`. Canonical install: `git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup`. Detection anchor: `~/.claude/skills/gstack/VERSION` exists; skill anchor: `~/.claude/skills/<name>` dir exists (e.g. `qa-only`).

**Why this is safe/right:** installing gstack is a global machine change, so it is offer-and-consent, never silent (mirrors gstack's own auto-upgrade-asks pattern). Templates remain generic (no hardcoded gstack), so OSS users without gstack are unaffected — the guard test still passes.

---

## File Structure

| Path | Change |
|---|---|
| `src/gstack.mjs` | NEW — `isGstackInstalled`, `hasSkill`, `gstackInstallCommand`, `installGstack` |
| `test/gstack.test.mjs` | NEW |
| `src/config.mjs` | `buildConfig` gains `qa_command` (default `/qa-only`); validate string |
| `src/render.mjs` | `renderProjectMd` surfaces `qa_command` |
| `src/doctor.mjs` | `buildDoctorChecks` adds a gstack check when `qa_command` is a slash-skill |
| `bin/cli.mjs` | `init` resolves `qa_command` from gstack detection + consent offer |
| `src/prompts.mjs` | add `parseYesNo`-based gstack-install offer helper (pure part tested) |
| `templates/agents/qa/CLAUDE.md` | read `qa_command` from project.md (generic) |
| `templates/agents/teamlead/CLAUDE.md` | mention `qa_command` in QA briefing (generic) |
| `docs/config-reference.md` + `docs/customizing.md` | document `qa_command` + gstack |
| `examples/sync-matrix/team.config.yaml` | set `qa_command: "/qa-only"` |
| `test/config.test.mjs`, `test/render-project.test.mjs`, `test/doctor-launch.test.mjs` | extend for `qa_command` |

---

## Task 1: gstack detection module

**Files:** Create `src/gstack.mjs`, `test/gstack.test.mjs`.

- [ ] **Step 1: Failing test** `test/gstack.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isGstackInstalled, hasSkill, gstackInstallCommand } from "../src/gstack.mjs";

test("isGstackInstalled true when VERSION present, false otherwise", () => {
  const skills = mkdtempSync(join(tmpdir(), "skills-"));
  try {
    assert.equal(isGstackInstalled({ skillsDir: skills }), false);
    mkdirSync(join(skills, "gstack"), { recursive: true });
    writeFileSync(join(skills, "gstack", "VERSION"), "1.0.0");
    assert.equal(isGstackInstalled({ skillsDir: skills }), true);
  } finally {
    rmSync(skills, { recursive: true, force: true });
  }
});

test("hasSkill checks a skill dir under skillsDir", () => {
  const skills = mkdtempSync(join(tmpdir(), "skills-"));
  try {
    assert.equal(hasSkill("qa-only", { skillsDir: skills }), false);
    mkdirSync(join(skills, "qa-only"), { recursive: true });
    assert.equal(hasSkill("qa-only", { skillsDir: skills }), true);
  } finally {
    rmSync(skills, { recursive: true, force: true });
  }
});

test("gstackInstallCommand is the canonical clone+setup one-liner", () => {
  const cmd = gstackInstallCommand();
  assert.match(cmd, /git clone --single-branch --depth 1 https:\/\/github\.com\/garrytan\/gstack\.git/);
  assert.match(cmd, /\.\/setup/);
});
```

- [ ] **Step 2: Run** `node --test test/gstack.test.mjs` → FAIL (module not found).

- [ ] **Step 3: Implement `src/gstack.mjs`:**
```js
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

function defaultSkillsDir() {
  return process.env.AGENT_CREW_SKILLS_DIR || join(homedir(), ".claude", "skills");
}

export function isGstackInstalled({ skillsDir = defaultSkillsDir() } = {}) {
  return existsSync(join(skillsDir, "gstack", "VERSION"));
}

export function hasSkill(name, { skillsDir = defaultSkillsDir() } = {}) {
  return existsSync(join(skillsDir, name));
}

export function gstackInstallCommand() {
  return (
    "git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git " +
    "~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup"
  );
}

// Consent-gated: callers must confirm before invoking. Runs the official installer.
export function installGstack() {
  const res = spawnSync("bash", ["-lc", gstackInstallCommand()], { stdio: "inherit" });
  return res.status === 0;
}
```

- [ ] **Step 4: Run** `node --test test/gstack.test.mjs` → PASS (3). Full `npm test` green.

- [ ] **Step 5: Commit** `git add src/gstack.mjs test/gstack.test.mjs && git commit -m "feat: gstack detection + install command"`

---

## Task 2: qa_command in config

**Files:** `src/config.mjs`, `test/config.test.mjs`.

- [ ] **Step 1: Extend test** — add to `test/config.test.mjs`:
```js
test("buildConfig: qa_command defaults to /qa-only, overridable, validated", () => {
  const def = buildConfig(detected, {});
  assert.equal(def.qa_command, "/qa-only");
  const empty = buildConfig(detected, { qaCommand: "" });
  assert.equal(empty.qa_command, "");
  const custom = buildConfig(detected, { qaCommand: "npm run qa" });
  assert.equal(custom.qa_command, "npm run qa");
  // validate rejects non-string
  const bad = buildConfig(detected, {});
  bad.qa_command = 42;
  assert.equal(validateConfig(bad).ok, false);
});
```
(`detected` already exists at the top of the test file.)

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** in `src/config.mjs`:
  - `buildConfig(detected, { roles, language, qaCommand } = {})` — add to the returned object, placed right after `commands`: `qa_command: qaCommand ?? "/qa-only",` (note: use `??` so an explicit `""` is preserved).
  - In `validateConfig`, add: `if (cfg?.qa_command != null && typeof cfg.qa_command !== "string") errors.push("qa_command must be a string");`

- [ ] **Step 4: Run** → PASS. Full `npm test` green.

- [ ] **Step 5: Commit** `git add src/config.mjs test/config.test.mjs && git commit -m "feat: qa_command config field (default /qa-only)"`

---

## Task 3: surface qa_command in project.md

**Files:** `src/render.mjs`, `test/render-project.test.mjs`.

- [ ] **Step 1: Extend test** — add to `test/render-project.test.mjs`:
```js
test("project.md surfaces qa_command", () => {
  const md = renderProjectMd(cfg);
  assert.match(md, /QA entrypoint/i);
  assert.match(md, /\/qa-only/);
});
```
(`cfg` at the top of that test currently has the default `qa_command: "/qa-only"` from buildConfig — confirm it does after Task 2; it will.)

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** in `renderProjectMd` — add a section (after Commands, before Dev-сервер):
```js
  const qaLine = cfg.qa_command
    ? "`" + cfg.qa_command + "` — QA починає кожну задачу з цього (gstack-скіл або команда)."
    : "не задано — QA тестує через команди запуску/тести проєкту.";
```
and in the template string add:
```
## QA entrypoint
${qaLine}
```

- [ ] **Step 4: Run** → PASS. Full `npm test` green.

- [ ] **Step 5: Commit** `git add src/render.mjs test/render-project.test.mjs && git commit -m "feat: surface qa_command in project.md"`

---

## Task 4: doctor gstack check

**Files:** `src/doctor.mjs`, `test/doctor-launch.test.mjs`.

- [ ] **Step 1: Extend test** — add to `test/doctor-launch.test.mjs`:
```js
test("doctor adds a gstack check when qa_command is a slash-skill", () => {
  const withGstack = buildConfig(detectFromFiles({ lockfiles: ["bun.lock"], pkg: { scripts: { dev: "next dev" } }, name: "demo", root: "/tmp/demo" }), {});
  const labels = buildDoctorChecks(withGstack).map((c) => c.label).join(" | ");
  assert.match(labels, /gstack/i);
  const noSkill = buildConfig(detectFromFiles({ lockfiles: ["bun.lock"], pkg: { scripts: { dev: "next dev" } }, name: "demo", root: "/tmp/demo" }), { qaCommand: "" });
  const labels2 = buildDoctorChecks(noSkill).map((c) => c.label).join(" | ");
  assert.doesNotMatch(labels2, /gstack/i);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** in `buildDoctorChecks(cfg)` — after the existing checks, conditionally append:
```js
  if (typeof cfg.qa_command === "string" && cfg.qa_command.startsWith("/")) {
    checks.push({
      label: `gstack installed (for QA entrypoint ${cfg.qa_command})`,
      cmd: "test -f \"$HOME/.claude/skills/gstack/VERSION\"",
    });
  }
```
(Build the array in a `const checks = [ ... ]` then push; adjust the function to return `checks`.)

- [ ] **Step 4: Run** → PASS. Full `npm test` green.

- [ ] **Step 5: Commit** `git add src/doctor.mjs test/doctor-launch.test.mjs && git commit -m "feat: doctor checks gstack when qa_command is a slash-skill"`

---

## Task 5: init gstack offer (consent) + prompt helper

**Files:** `src/prompts.mjs`, `bin/cli.mjs`, `test/prompts.test.mjs`.

- [ ] **Step 1: Extend prompts test** — add to `test/prompts.test.mjs`:
```js
import { resolveQaCommand } from "../src/prompts.mjs";
test("resolveQaCommand: gstack present -> /qa-only; absent+declined -> ''", () => {
  assert.equal(resolveQaCommand({ gstackPresent: true, install: false }), "/qa-only");
  assert.equal(resolveQaCommand({ gstackPresent: false, install: true }), "/qa-only");
  assert.equal(resolveQaCommand({ gstackPresent: false, install: false }), "");
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** in `src/prompts.mjs`:
```js
// Pure resolution of the QA entrypoint based on gstack availability + install decision.
export function resolveQaCommand({ gstackPresent, install }) {
  return gstackPresent || install ? "/qa-only" : "";
}
```

- [ ] **Step 4: Wire `bin/cli.mjs` `doInit`** (after `runInitPrompts`, before buildConfig). Import `isGstackInstalled, installGstack` from `../src/gstack.mjs`, `resolveQaCommand` from `../src/prompts.mjs`, and use `createInterface` for a one-off confirm. Logic:
```js
  // gstack QA integration (recommended default)
  let gstackPresent = isGstackInstalled();
  let installed = false;
  if (!gstackPresent) {
    const rl = (await import("node:readline/promises")).createInterface({ input: process.stdin, output: process.stdout });
    try {
      const { parseYesNo } = await import("../src/prompts.mjs");
      const ans = parseYesNo(await rl.question("gstack не знайдено (рекомендований QA-інструмент, напр. /qa-only). Встановити зараз? [Y/n] "), true);
      if (ans) { console.log("Встановлюю gstack…"); installed = installGstack(); if (!installed) console.error("Не вдалось встановити gstack — продовжую без нього."); }
    } finally { rl.close(); }
  }
  const qaCommand = resolveQaCommand({ gstackPresent, install: installed });
```
Then pass `qaCommand` into `buildConfig(merged, { roles: answers.roles, language: answers.language, qaCommand })`.

- [ ] **Step 5: Run** full `npm test` → all green (the prompts pure test passes; the interactive init path is not unit-tested). Manually verify `node bin/cli.mjs --help` still works.

- [ ] **Step 6: Commit** `git add src/prompts.mjs bin/cli.mjs test/prompts.test.mjs && git commit -m "feat: init offers gstack install (consent) + resolves qa_command"`

---

## Task 6: wire qa_command into QA + teamlead templates

**Files:** `templates/agents/qa/CLAUDE.md`, `templates/agents/teamlead/CLAUDE.md`.

- [ ] **Step 1:** In `templates/agents/qa/CLAUDE.md`, in the testing-tools section, add (generic — reads from project.md, does not hardcode gstack as the only way):
  > **QA entrypoint.** Якщо в `_shared/project.md` (поле `qa_command`) задано команду/скіл — починай кожну задачу з нього (типово gstack-скіл `/qa-only`, який сам проганяє повний QA-флоу). Якщо порожнє — тестуй через команди запуску/тести проєкту з `project.md`.

- [ ] **Step 2:** In `templates/agents/teamlead/CLAUDE.md`, in the QA-briefing area, add one line: when briefing QA, pass along the `qa_command` from `project.md` (if set) as the entrypoint; if absent, QA uses the project's run/test commands.

- [ ] **Step 3:** Run `node --test test/templates-generic.test.mjs` (guard MUST still pass — `/qa-only` is NOT a forbidden token; confirm no forbidden tokens introduced) and full `npm test`.

- [ ] **Step 4: Commit** `git add templates/agents/qa/CLAUDE.md templates/agents/teamlead/CLAUDE.md && git commit -m "feat(templates): QA + teamlead read qa_command from project.md"`

---

## Task 7: docs + example

**Files:** `docs/config-reference.md`, `docs/customizing.md`, `examples/sync-matrix/team.config.yaml`.

- [ ] **Step 1:** `docs/config-reference.md` — add a `qa_command` entry: type string, default `/qa-only`, meaning (QA entrypoint; gstack skill or shell command; empty → project run/test commands), where it flows (project.md → QA + teamlead).
- [ ] **Step 2:** `docs/customizing.md` — add a short "gstack QA integration" subsection: `init` detects gstack and offers to install it (`github.com/garrytan/gstack`); set `qa_command` to `/qa-only` (gstack) or your own QA command, or empty to use project test commands; `doctor` warns if a gstack skill is configured but gstack is absent.
- [ ] **Step 3:** `examples/sync-matrix/team.config.yaml` — add `qa_command: "/qa-only"` (place after `commands:` or `devserver:`).
- [ ] **Step 4:** Verify the example still parses (`node -e "import('yaml').then(y=>console.log(!!y.parse(require('fs').readFileSync('examples/sync-matrix/team.config.yaml','utf8'))))"`) and `npm test` green.
- [ ] **Step 5: Commit** `git add docs examples && git commit -m "docs: document qa_command + gstack QA integration"`

---

## Task 8: final audit + dogfood

- [ ] **Step 1:** Full `npm test` → all green (incl. genericity guard + new gstack/config/render/doctor tests).
- [ ] **Step 2:** Dogfood scaffold with default config and assert project.md surfaces the QA entrypoint:
```bash
cd /tmp && rm -rf ac-gs && mkdir ac-gs && cd ac-gs && git init -q && git commit -q --allow-empty -m init
node -e "import('/Users/andrii/Documents/projects/agent-crew/src/scaffold.mjs').then(async m=>{const {buildConfig}=await import('/Users/andrii/Documents/projects/agent-crew/src/config.mjs');const {detectFromFiles}=await import('/Users/andrii/Documents/projects/agent-crew/src/detect.mjs');const cfg=buildConfig(detectFromFiles({lockfiles:[],pkg:null,name:'gs',root:process.cwd()}),{});m.scaffold(cfg,{targetRoot:process.cwd()})})"
grep -n "QA entrypoint" .agent-crew/agents/_shared/project.md && grep -n "qa_command" .agent-crew/team.config.yaml
cd /tmp && rm -rf ac-gs
```
Expected: project.md has the QA entrypoint section; team.config.yaml has `qa_command: /qa-only`.
- [ ] **Step 3:** Update `README.md` — add a one-line mention under Onboarding or Requirements: "QA uses gstack's `/qa-only` by default (offered at `init`); configurable via `qa_command`." Commit `git add README.md && git commit -m "docs: mention gstack QA integration in README"`.
- [ ] **Step 4:** Report PLAN-4 COMPLETE.

---

## Self-Review
- Detect + consent-install (never silent) → Tasks 1, 5 ✓
- Configurable qa_command, default `/qa-only`, empty fallback → Tasks 2, 5 ✓
- Templates stay generic (read from project.md, guard green) → Task 6 ✓
- doctor surfaces missing gstack → Task 4 ✓
- docs + example + README → Tasks 7, 8 ✓
- Placeholder/consistency: `qa_command` key identical across config/render/doctor/docs/example; install command identical to gstack README; detection anchor `~/.claude/skills/gstack/VERSION` consistent.
