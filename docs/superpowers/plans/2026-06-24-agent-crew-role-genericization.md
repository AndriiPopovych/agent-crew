# agent-crew — Role Genericization (Plan 2 / 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the minimal role-stub templates with full, production-quality role definitions ported from the proven `sync-matrix` crew — but genericized: all project-specific facts come from `_shared/project.md` / `knowledge/`, not hardcoded.

**Architecture:** Each role's full prose is ported from `/Users/andrii/Documents/matrix/sync-matrix/agents/<role>/CLAUDE.md` into `templates/agents/<role>/CLAUDE.md`, applying the shared transformation rules below. An automated "genericity guard" test (forbidden-token scan + required-anchor check) is the gate. Two new behaviors are added to teamlead: phase-2 self-onboarding and requirements elicitation. Vocabulary shifts from "client feedback" to "tasks".

**Tech Stack:** Markdown prose + Node `node:test` guard test. No runtime code changes.

**Why subagents read the source file directly (exception to the usual "paste full text" rule):** the source role files total ~3300 lines. Reproducing them inline is impractical and the on-disk source is authoritative. Each port task gives the exact source path + exact transformation rules + the guard-test gate. This is a deliberate, scoped exception.

---

## Shared Transformation Rules (apply to EVERY role port)

When porting `sync-matrix/agents/<role>/CLAUDE.md` → `templates/agents/<role>/CLAUDE.md`, transform as follows. **Preserve** the role's structure, philosophy, workflow logic, review discipline, and Ukrainian voice. **Genericize** only the project-specific bindings:

| In sync-matrix source | Becomes in template |
|---|---|
| "Sync-Matrix" / "sync-matrix" (project name, in prose) | "проєкт" / "цей проєкт"; for the session prefix say "сесії `<project>-<role>` (префікс — у `project.md`)" |
| `sync-matrix-teamlead`, `sync-matrix-dev`, … (session names) | `<project>-teamlead`, `<project>-dev`, … with a note that `<project>` = the prefix in `_shared/project.md` |
| `/root/projects/sync-matrix` (paths) | the repo root (cwd); crew files live under `.agent-crew/` |
| `.inbox/...` | `.agent-crew/.inbox/...` |
| Stack specifics: `bun --bun`, Supabase, port 3000, Next.js, TypeScript strict, MGRS, Leaflet | "команди/порт/стек — з `_shared/project.md`"; never hardcode a stack |
| Sources of truth: `PRD. Synchronization Matrix.pdf`, `Synchronization Matrices Feedback.md`, `Synchronization matrix_Additional reqs.pdf` | "джерела правди — з `sources_of_truth` у `project.md` та `knowledge/`" |
| `docs/principles.md` ("бібла для code review") | the `quality_standard` from `project.md` (fallback `.agent-crew/knowledge/principles.md`) |
| `docs/qa/**`, `docs/user-testing/**`, `docs/plans/**` (sync-matrix doc layout) | keep as "проєктна `docs/`-структура, якщо є" / write reports under `.agent-crew/.inbox/<TASK-N>/` or project `docs/` |
| `supabase/migrations/`, `scripts/apply-migration.sh` | generalize to "міграції/інфра — якщо проєкт їх має (див. `project.md` gotchas)" |
| memory path `~/.claude/projects/-root-projects-sync-matrix/...` | the path in `project.md` `memory.path` |
| "client feedback batch", "фідбек", "ітерації 1–4", "правки замовника" | "задачі / запит / робота"; input is **concrete tasks to do**, not corrections |

**Hard rule:** the ported file must NOT contain any of these tokens (case-insensitive): `sync-matrix`, `supabase`, `/root/projects`, `synchronization matri`, `bun --bun`, `next.js`/`nextjs`, `MGRS`, `leaflet`, `PRD`. The guard test (Task 1) enforces this.

**Anchor rule:** every role must, on bootstrap, instruct reading `_shared/protocol.md` and `_shared/project.md`. teamlead/dev/qa must reference both by name.

---

## File Structure

| Path | Change |
|---|---|
| `test/templates-generic.test.mjs` | NEW — genericity guard (forbidden tokens + required anchors) |
| `templates/agents/_shared/protocol.md` | EXPAND — port the richer sync-matrix protocol (atomic writes, versioned artifacts, status schema, bootstrap polling, memory) onto `.agent-crew/.inbox/` |
| `templates/agents/teamlead/CLAUDE.md` | REPLACE stub — full teamlead + self-onboarding + requirements elicitation |
| `templates/agents/dev/CLAUDE.md` | REPLACE stub — full developer role |
| `templates/agents/qa/CLAUDE.md` | REPLACE stub — full QA role |
| `templates/agents/architect/CLAUDE.md` | REPLACE stub — full architect role |
| `templates/agents/ux/CLAUDE.md` | REPLACE stub — full UX role |
| `templates/agents/techwriter/CLAUDE.md` | REPLACE stub — full techwriter role |

---

## Task 1: Genericity guard test

**Files:** Create `test/templates-generic.test.mjs`.

- [ ] **Step 1: Write the test** (it must PASS against current stubs, then gate all later tasks)

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const TEMPLATES = fileURLToPath(new URL("../templates", import.meta.url));

function mdFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...mdFiles(p));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

const FORBIDDEN = [
  /sync-matrix/i,
  /supabase/i,
  /\/root\/projects/i,
  /synchronization matri/i,
  /bun --bun/,
  /next\.?js/i,
  /\bMGRS\b/,
  /leaflet/i,
  /\bPRD\b/,
];

test("no project-specific leaks in any template", () => {
  for (const f of mdFiles(TEMPLATES)) {
    const text = readFileSync(f, "utf8");
    for (const re of FORBIDDEN) {
      assert.ok(!re.test(text), `${f} leaks ${re}`);
    }
  }
});

test("core roles reference protocol.md and project.md", () => {
  for (const role of ["teamlead", "dev", "qa"]) {
    const text = readFileSync(join(TEMPLATES, "agents", role, "CLAUDE.md"), "utf8");
    assert.match(text, /protocol\.md/, `${role} must reference protocol.md`);
    assert.match(text, /project\.md/, `${role} must reference project.md`);
  }
});

test("teamlead defines onboarding + clarification behavior", () => {
  const text = readFileSync(join(TEMPLATES, "agents", "teamlead", "CLAUDE.md"), "utf8");
  assert.match(text, /onboarding/i, "teamlead must describe onboarding");
  assert.match(text, /уточн/i, "teamlead must describe clarifying questions");
});
```

- [ ] **Step 2: Run** `cd /Users/andrii/Documents/projects/agent-crew && node --test test/templates-generic.test.mjs`
Expected: PASS (current stubs already satisfy anchors + onboarding/уточн in teamlead, and have no forbidden tokens).

- [ ] **Step 3: Commit**

```bash
git add test/templates-generic.test.mjs
git commit -m "test: genericity guard for role templates"
```

---

## Task 2: Port the engine protocol

**Files:** Modify `templates/agents/_shared/protocol.md`.
**Source:** `/Users/andrii/Documents/matrix/sync-matrix/agents/_shared/protocol.md` (195 lines).

- [ ] **Step 1:** Read the source. Rewrite `templates/agents/_shared/protocol.md` to port its full content (sections 1–7: `.inbox/` structure with versioned artifacts; `status.md` JSON contract + all phases; atomic writes `.tmp + mv`; tmux bootstrap polling; lifecycle of the work-input file; memory read-only-for-workers; pre-signal self-check) applying the Shared Transformation Rules. Key changes: every `.inbox/` path → `.agent-crew/.inbox/`; memory path → "шлях у `project.md`"; the "Lifecycle файлу з фідбеком" section → "Lifecycle вхідного запиту" (input is a task/request in any form, not a feedback file); drop the sync-matrix preconditions paths.

- [ ] **Step 2:** Run `node --test test/templates-generic.test.mjs` — expect PASS (no leaks). Run full `npm test` — expect all green.

- [ ] **Step 3: Commit**

```bash
git add templates/agents/_shared/protocol.md
git commit -m "feat(templates): port full engine protocol, genericized"
```

---

## Task 3: Port teamlead (+ onboarding + elicitation)

**Files:** Replace `templates/agents/teamlead/CLAUDE.md`.
**Source:** `/Users/andrii/Documents/matrix/sync-matrix/agents/teamlead/CLAUDE.md` (1280 lines).

- [ ] **Step 1:** Read the source fully. Produce a genericized teamlead role that preserves: philosophy (quality > speed, tech-debt as risk, architect-not-dispatcher), the main loop, tmux command protocol (`<project>-*` sessions, send-keys reliability patterns, proactive background monitoring), task decomposition into `.agent-crew/.inbox/tasks/TASK-<N>.md`, conditional stages (architect pre-impl review, ux brief), code-review standard (verify each claim, root cause, build exit 0 — sourced from `quality_standard`), lazy bootstrap of opt roles via `_bin/ensure-role.sh`, parallelism rules, memory aggregation, session hygiene.

  Apply ALL Shared Transformation Rules. Additionally ADD these two behaviors (new vs sync-matrix), consistent with the design spec:

  **(A) Phase-2 self-onboarding (on first launch):** On session start, after reading `protocol.md` + `project.md`, check `.agent-crew/knowledge/onboarding.md` frontmatter. If `status: pending-deep-onboarding`: run a deep project investigation (read key modules/entry points, detect conventions from lint/types/structure, read existing `docs/`, skim git history), then REWRITE `knowledge/onboarding.md` (domain, architecture summary, conventions, active zones, risks) and `knowledge/architecture.md` (module/dir map), set frontmatter `status: ready`, present the user a concise summary, and ask what to work on. If `status: ready`: skip onboarding, bring up dev/qa + devserver, await a task. Include a staleness note: if `generated_at_sha` differs greatly from current HEAD, offer `agent-crew onboard --refresh`.

  **(B) Requirements elicitation:** Input is **concrete tasks** (feature/change/refactor/bug) in any form (chat text, issue link, file, TODO) — NOT a curated feedback document. Before decomposing an underspecified task, ask the user clarifying questions (scope, acceptance criteria, edge cases), grounded in `knowledge/`. Checking a spec/PRD is OPTIONAL — only if such a doc exists in `sources_of_truth`.

  Keep it thorough but tight; this is the most important role.

- [ ] **Step 2:** Run `node --test test/templates-generic.test.mjs` — expect PASS (no leaks; onboarding + уточн anchors present). Run full `npm test`.

- [ ] **Step 3: Commit**

```bash
git add templates/agents/teamlead/CLAUDE.md
git commit -m "feat(templates): port teamlead with onboarding + requirements elicitation"
```

---

## Task 4: Port developer

**Files:** Replace `templates/agents/dev/CLAUDE.md`.
**Source:** `/Users/andrii/Documents/matrix/sync-matrix/agents/dev/CLAUDE.md` (531 lines).

- [ ] **Step 1:** Read source. Genericize, preserving: engineer mindset (verify before edit, root cause not symptom, build must pass, honest pushback), signal protocol via `.agent-crew/.inbox/status.md`, reading task + optional `ux-brief.md`, versioned `result-v<N>.md` (atomic writes), the result-report format, review-loop handling, "don't expand scope". Replace stack specifics (build/test commands) with "commands from `project.md`"; quality standard from `quality_standard`. Sources-of-truth table → generic (protocol.md, project.md, knowledge/, project docs if any).

- [ ] **Step 2:** `node --test test/templates-generic.test.mjs` PASS; full `npm test` green.

- [ ] **Step 3: Commit**

```bash
git add templates/agents/dev/CLAUDE.md
git commit -m "feat(templates): port developer role, genericized"
```

---

## Task 5: Port QA

**Files:** Replace `templates/agents/qa/CLAUDE.md`.
**Source:** `/Users/andrii/Documents/matrix/sync-matrix/agents/qa/CLAUDE.md` (491 lines).

- [ ] **Step 1:** Read source. Genericize, preserving: QA mindset, reading `qa-brief.md`, testing against acceptance criteria, `qa-report.md` format (PASS/FAIL + reproduction steps + severity), regression awareness, how-to-run sourced from `project.md`. Replace any browser/stack/Supabase specifics with "how to run/test — from `project.md`". Keep the discipline of independent verification.

- [ ] **Step 2:** guard PASS; full `npm test` green.

- [ ] **Step 3: Commit**

```bash
git add templates/agents/qa/CLAUDE.md
git commit -m "feat(templates): port QA role, genericized"
```

---

## Task 6: Port architect

**Files:** Replace `templates/agents/architect/CLAUDE.md`.
**Source:** `/Users/andrii/Documents/matrix/sync-matrix/agents/architect/CLAUDE.md` (392 lines).

- [ ] **Step 1:** Read source. Genericize, preserving: async operation (periodic scan after batch, pre-impl review for big changes, coupling/hot-spot alerts), proposed-tasks → `.agent-crew/.inbox/architect/proposed-tasks/`, "не блокує pipeline", memory candidates. Replace sync-matrix architecture-doc layout (`docs/architecture/`) with "проєктна архітектурна дока, якщо є; інакше — `knowledge/architecture.md`".

- [ ] **Step 2:** guard PASS; full `npm test` green.

- [ ] **Step 3: Commit**

```bash
git add templates/agents/architect/CLAUDE.md
git commit -m "feat(templates): port architect role, genericized"
```

---

## Task 7: Port UX

**Files:** Replace `templates/agents/ux/CLAUDE.md`.
**Source:** `/Users/andrii/Documents/matrix/sync-matrix/agents/ux/CLAUDE.md` (301 lines).

- [ ] **Step 1:** Read source. Genericize, preserving: on-demand activation for `ux-required` tasks, `ux-brief.md` output (patterns, a11y checklist, flow, edge cases) for dev, "не пише код". Replace any sync-matrix UI specifics (MUI, Leaflet, specific screens) with generic UI/UX guidance; design references → "проєктний дизайн-стандарт, якщо є".

- [ ] **Step 2:** guard PASS; full `npm test` green.

- [ ] **Step 3: Commit**

```bash
git add templates/agents/ux/CLAUDE.md
git commit -m "feat(templates): port UX role, genericized"
```

---

## Task 8: Port techwriter

**Files:** Replace `templates/agents/techwriter/CLAUDE.md`.
**Source:** `/Users/andrii/Documents/matrix/sync-matrix/agents/techwriter/CLAUDE.md` (143 lines).

- [ ] **Step 1:** Read source. Genericize, preserving: on-demand for `docs-required` tasks, release notes, help texts, user-testing guides; `doc-request.md`/`doc-report.md` via `.agent-crew/.inbox/techwriter/`; "не пише код, не тестує". Replace sync-matrix doc paths/specifics with generic project `docs/`.

- [ ] **Step 2:** guard PASS; full `npm test` green.

- [ ] **Step 3: Commit**

```bash
git add templates/agents/techwriter/CLAUDE.md
git commit -m "feat(templates): port techwriter role, genericized"
```

---

## Task 9: Dogfood + final genericity audit

**Files:** none (verification only) — unless a leak/fix is found.

- [ ] **Step 1: Full suite** `cd /Users/andrii/Documents/projects/agent-crew && npm test` — expect ALL green incl. genericity guard.

- [ ] **Step 2: Real scaffold dogfood** — scaffold into a throwaway repo with a NON-default stack to prove genericity (e.g. a python-ish or plain dir), then read the generated role files for any project-specific leaks the regex might miss:
```bash
cd /tmp && rm -rf ac-dogfood && mkdir ac-dogfood && cd ac-dogfood && git init -q && git commit -q --allow-empty -m init
node /Users/andrii/Documents/projects/agent-crew/bin/cli.mjs sync 2>/dev/null || true   # no config yet -> just confirm error path
# scaffold directly (non-interactive) with all roles:
node -e "import('/Users/andrii/Documents/projects/agent-crew/src/scaffold.mjs').then(async m=>{const {buildConfig}=await import('/Users/andrii/Documents/projects/agent-crew/src/config.mjs');const {detectFromFiles}=await import('/Users/andrii/Documents/projects/agent-crew/src/detect.mjs');const cfg=buildConfig(detectFromFiles({lockfiles:[],pkg:null,name:'dogfood',root:process.cwd()}),{roles:{ux:true,architect:true,techwriter:true}});m.scaffold(cfg,{targetRoot:process.cwd()})})"
grep -rniE "sync-matrix|supabase|/root/projects|bun --bun|next\.?js|leaflet|\bMGRS\b|\bPRD\b" .agent-crew/agents || echo "CLEAN: no leaks in generated agents"
cat .agent-crew/agents/teamlead/CLAUDE.md | head -40
cd /tmp && rm -rf ac-dogfood
```
Expected: "CLEAN: no leaks"; teamlead reads correctly for a generic project.

- [ ] **Step 3:** If any leak/awkward project-specific phrasing is found, fix the offending template file, re-run guard + full suite, and commit `fix(templates): scrub residual project-specific phrasing`.

- [ ] **Step 4:** Report done. (No commit if Step 3 found nothing.)

---

## Self-Review

**Spec coverage (design spec §3.2, §3.6, §6, §11):**
- §3.2 role templates genericized (placeholders → project.md/knowledge) → Tasks 2–8 ✓
- §3.6 teamlead phase-2 self-onboarding → Task 3 (A) ✓
- §6 flexible work intake + teamlead clarification → Task 3 (B) ✓
- §11 "feedback → tasks" reframing + de-specific vocabulary → Shared Rules + guard test ✓
- §11 genericization done with verification (not blind) → guard test (Task 1) + dogfood (Task 9) ✓

**Placeholder scan:** prose tasks reference exact source paths + exact transformation rules; the guard test is the objective gate. No "TODO/TBD".

**Consistency:** all paths use `.agent-crew/.inbox/`; all roles anchor on `protocol.md` + `project.md`; session prefix `<project>-<role>` everywhere; forbidden-token list identical in Shared Rules and guard test.
