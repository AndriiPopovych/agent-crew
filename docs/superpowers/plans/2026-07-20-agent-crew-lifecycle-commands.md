# agent-crew — Lifecycle Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Чотири lifecycle-команди CLI - `status`, `attach`, `stop`, `resume` - що закривають щоденний цикл роботи з crew і повністю тестуються в CI без живого tmux.

**Architecture:** Новий модуль `src/lifecycle.mjs` за наявним патерном "чисті build-функції + тонкі обгортки зі side-effects" (як `doctor.mjs`/`launch.mjs`). tmux викликається напряму через `spawnSync` (префікс і ролі відомі з config) - нових `_bin`-скриптів немає. `resume` - це `_bin/launch.sh` з env `AGENT_CREW_RESUME=1`, який підставляє альтернативний bootstrap-промпт; воркерів відновлює сам teamlead.

**Tech Stack:** Node ESM (>= 20), `node:test`, `spawnSync`, `fetch` + `AbortSignal.timeout` (health-пінг).

**Spec:** `docs/superpowers/specs/2026-07-20-agent-crew-lifecycle-design.md`

---

## File Structure

| Path | Change | Responsibility |
|---|---|---|
| `src/lifecycle.mjs` | NEW | parseSessions, readPipelineState, relativeAge, buildStatusReport, buildStopPlan (чисті); listTmuxSessions, checkHealth, runStatus, runAttach, runStop (side-effects) |
| `test/lifecycle.test.mjs` | NEW | unit-тести чистих функцій на фікстурах |
| `bin/cli.mjs` | MODIFY | команди `status`, `attach [role]`, `stop [--force]`, `resume`; help |
| `src/launch.mjs` | MODIFY | `launch(targetRoot, { resume })` → env `AGENT_CREW_RESUME` |
| `src/render.mjs` | MODIFY | `launch.sh`: вибір bootstrap-промпту через `AGENT_CREW_RESUME` |
| `test/render-bin.test.mjs` | MODIFY | покриття resume-гілки |
| `test/smoke.test.mjs` | MODIFY | help містить нові команди; `status` поза проєктом → exit 1 |
| `templates/agents/teamlead/CLAUDE.md` | MODIFY | нова секція `## 10. Відновлення після рестарту (resume)` (нумерація 9→11 має пропуск - заповнюємо) |
| `README.md`, `docs/how-it-works.md` | MODIFY | таблиця команд + опис lifecycle |
| `package.json` | MODIFY | версія 0.2.0 |

Конвенції репо: українська типографія в user-facing текстах (прямі лапки, тире "-"); templates/ лишаються generic - `test/templates-generic.test.mjs` має проходити; TDD, кожна задача - коміт.

---

### Task 1: parseSessions + readPipelineState

**Files:**
- Create: `src/lifecycle.mjs`
- Create: `test/lifecycle.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `test/lifecycle.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSessions, readPipelineState } from "../src/lifecycle.mjs";

test("parseSessions: empty tmux output → nothing live", () => {
  const s = parseSessions("demo", "");
  assert.equal(s.live.size, 0);
  assert.deepEqual(s.roles, []);
  assert.equal(s.server, false);
});

test("parseSessions: picks only prefixed sessions, separates server", () => {
  const out = "demo-teamlead\nother-project\ndemo-server\ndemo-dev\nrandom\n";
  const s = parseSessions("demo", out);
  assert.deepEqual([...s.live].sort(), ["demo-dev", "demo-server", "demo-teamlead"]);
  assert.deepEqual(s.roles.sort(), ["dev", "teamlead"]);
  assert.equal(s.server, true);
});

test("parseSessions: prefix with dashes does not swallow lookalikes", () => {
  const out = "my-app-teamlead\nmy-application-dev\nmy-app-dev\n";
  const s = parseSessions("my-app", out);
  assert.deepEqual([...s.live].sort(), ["my-app-dev", "my-app-teamlead"]);
  assert.deepEqual(s.roles.sort(), ["dev", "teamlead"]);
});

test("readPipelineState: missing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "inbox-"));
  try {
    assert.deepEqual(readPipelineState(dir), { exists: false, state: null, raw: null });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readPipelineState: valid JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "inbox-"));
  try {
    const json = '{"phase":"development","task":"TASK-3","iteration":1,"timestamp":"2026-07-20T10:00:00Z"}';
    writeFileSync(join(dir, "status.md"), json + "\n");
    const r = readPipelineState(dir);
    assert.equal(r.exists, true);
    assert.equal(r.state.phase, "development");
    assert.equal(r.state.task, "TASK-3");
    assert.equal(r.raw, json);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readPipelineState: broken JSON → state null, raw preserved, no throw", () => {
  const dir = mkdtempSync(join(tmpdir(), "inbox-"));
  try {
    writeFileSync(join(dir, "status.md"), "phase: development (not json)");
    const r = readPipelineState(dir);
    assert.equal(r.exists, true);
    assert.equal(r.state, null);
    assert.equal(r.raw, "phase: development (not json)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/lifecycle.test.mjs`
Expected: FAIL - `Cannot find module '../src/lifecycle.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lifecycle.mjs`:

```js
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CORE_ROLES = ["teamlead", "dev", "qa"];

// Pure: parse `tmux ls -F "#{session_name}"` output into crew sessions.
export function parseSessions(prefix, tmuxLsOutput) {
  const names = (tmuxLsOutput || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const mine = names.filter((n) => n.startsWith(`${prefix}-`));
  const roles = mine
    .filter((n) => n !== `${prefix}-server`)
    .map((n) => n.slice(prefix.length + 1));
  return { live: new Set(mine), roles, server: mine.includes(`${prefix}-server`) };
}

// status.md → { exists, state, raw }. Never throws: broken JSON → state null.
export function readPipelineState(inboxDir) {
  const p = join(inboxDir, "status.md");
  if (!existsSync(p)) return { exists: false, state: null, raw: null };
  const raw = readFileSync(p, "utf8").trim();
  try {
    const state = JSON.parse(raw);
    return { exists: true, state: typeof state === "object" && state !== null ? state : null, raw };
  } catch {
    return { exists: true, state: null, raw };
  }
}

export { CORE_ROLES };
```

(`spawnSync` імпортовано наперед - використається в Task 4; це не блокує тести.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/lifecycle.test.mjs`
Expected: PASS (6 тестів)

- [ ] **Step 5: Commit**

```bash
git add src/lifecycle.mjs test/lifecycle.test.mjs
git commit -m "feat: lifecycle core - parseSessions + readPipelineState"
```

---

### Task 2: relativeAge + buildStatusReport

**Files:**
- Modify: `src/lifecycle.mjs`
- Modify: `test/lifecycle.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `test/lifecycle.test.mjs` (додай імпорти до наявного import-блоку lifecycle: `relativeAge`, `buildStatusReport`; додай нові імпорти конфігу):

```js
import { relativeAge, buildStatusReport } from "../src/lifecycle.mjs";
import { buildConfig } from "../src/config.mjs";
import { detectFromFiles } from "../src/detect.mjs";

const cfg = buildConfig(
  detectFromFiles({
    lockfiles: ["bun.lock"],
    pkg: { scripts: { dev: "next dev" }, dependencies: { next: "16" } },
    name: "demo",
    root: "/tmp/demo",
  }),
  { roles: { architect: true } }
);

const NOW = new Date("2026-07-20T10:14:00Z");

test("relativeAge: minutes, hours, days, garbage", () => {
  assert.equal(relativeAge("2026-07-20T10:13:40Z", NOW), "щойно");
  assert.equal(relativeAge("2026-07-20T10:00:00Z", NOW), "14 хв тому");
  assert.equal(relativeAge("2026-07-20T07:14:00Z", NOW), "3 год тому");
  assert.equal(relativeAge("2026-07-15T10:14:00Z", NOW), "5 дн тому");
  assert.equal(relativeAge("not-a-date", NOW), null);
});

test("buildStatusReport: sessions, lazy roles, pipeline, health", () => {
  const sessions = parseSessions("demo", "demo-teamlead\ndemo-server\n");
  const pipeline = {
    exists: true,
    state: { phase: "development", task: "TASK-3", iteration: 1, timestamp: "2026-07-20T10:00:00Z" },
    raw: "…",
  };
  const out = buildStatusReport(cfg, sessions, pipeline, { health: true, now: NOW });
  assert.match(out, /agent-crew - demo/);
  assert.match(out, /● teamlead/);
  assert.match(out, /○ dev\s+down/);
  assert.match(out, /○ architect\s+не запущена \(lazy-роль\)/);
  assert.match(out, /● сесія demo-server: up/);
  assert.match(out, /health http:\/\/localhost:3000: ok/);
  assert.match(out, /фаза:\s+development/);
  assert.match(out, /задача:\s+TASK-3/);
  assert.match(out, /оновлено: 2026-07-20T10:00:00Z \(14 хв тому\)/);
});

test("buildStatusReport: no state yet", () => {
  const out = buildStatusReport(
    cfg,
    parseSessions("demo", ""),
    { exists: false, state: null, raw: null },
    { health: false, now: NOW }
  );
  assert.match(out, /стан відсутній/);
  assert.match(out, /health http:\/\/localhost:3000: недоступний/);
});

test("buildStatusReport: broken status.md shows raw without crashing", () => {
  const out = buildStatusReport(
    cfg,
    parseSessions("demo", ""),
    { exists: true, state: null, raw: "half-written garbage" },
    { now: NOW }
  );
  assert.match(out, /не парситься/);
  assert.match(out, /half-written garbage/);
});

test("buildStatusReport: unknown crew sessions listed separately", () => {
  const sessions = parseSessions("demo", "demo-teamlead\ndemo-scribe\n");
  const out = buildStatusReport(cfg, sessions, { exists: false, state: null, raw: null }, { now: NOW });
  assert.match(out, /інші сесії: demo-scribe/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/lifecycle.test.mjs`
Expected: FAIL - `relativeAge`/`buildStatusReport` не експортовані

- [ ] **Step 3: Write implementation**

Append to `src/lifecycle.mjs`:

```js
export function relativeAge(iso, now = new Date()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const min = Math.round((now.getTime() - t) / 60000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв тому`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} год тому`;
  return `${Math.floor(h / 24)} дн тому`;
}

// Pure render of the one-screen status report.
export function buildStatusReport(cfg, sessions, pipeline, { health = null, now = new Date() } = {}) {
  const prefix = cfg.project.name;
  const lines = [`agent-crew - ${prefix}`, "", "Ролі:"];
  const enabled = Object.entries(cfg.roles)
    .filter(([, on]) => on)
    .map(([r]) => r);
  for (const role of enabled) {
    const up = sessions.live.has(`${prefix}-${role}`);
    const label = up ? "up" : CORE_ROLES.includes(role) ? "down" : "не запущена (lazy-роль)";
    lines.push(`  ${up ? "●" : "○"} ${role.padEnd(11)} ${label}`);
  }
  const extra = sessions.roles.filter((r) => !enabled.includes(r));
  if (extra.length) lines.push(`  інші сесії: ${extra.map((r) => `${prefix}-${r}`).join(", ")}`);

  lines.push("", "Devserver:");
  lines.push(`  ${sessions.server ? "●" : "○"} сесія ${prefix}-server: ${sessions.server ? "up" : "down"}`);
  if (health !== null) {
    lines.push(`  health ${cfg.devserver.health_url}: ${health ? "ok" : "недоступний"}`);
  }

  lines.push("", "Pipeline:");
  if (!pipeline.exists) {
    lines.push("  стан відсутній - crew ще не працювала або .inbox/ порожній");
  } else if (!pipeline.state) {
    lines.push("  status.md не парситься як JSON. Сирий вміст:");
    lines.push(`  ${pipeline.raw}`);
  } else {
    const s = pipeline.state;
    lines.push(`  фаза:     ${s.phase ?? "?"}`);
    if (s.task) lines.push(`  задача:   ${s.task}`);
    if (s.iteration != null) lines.push(`  ітерація: ${s.iteration}`);
    if (s.timestamp) {
      const age = relativeAge(s.timestamp, now);
      lines.push(`  оновлено: ${s.timestamp}${age ? ` (${age})` : ""}`);
    }
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/lifecycle.test.mjs`
Expected: PASS (11 тестів)

- [ ] **Step 5: Commit**

```bash
git add src/lifecycle.mjs test/lifecycle.test.mjs
git commit -m "feat: buildStatusReport + relativeAge"
```

---

### Task 3: buildStopPlan

**Files:**
- Modify: `src/lifecycle.mjs`
- Modify: `test/lifecycle.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `test/lifecycle.test.mjs` (додай `buildStopPlan` до імпорту з lifecycle):

```js
test("buildStopPlan: idle → no confirm", () => {
  const sessions = parseSessions("demo", "demo-teamlead\ndemo-dev\n");
  const pipeline = { exists: true, state: { phase: "idle" }, raw: "" };
  const plan = buildStopPlan(cfg, sessions, pipeline);
  assert.deepEqual(plan.sessions, ["demo-dev", "demo-teamlead"]);
  assert.equal(plan.needsConfirm, false);
  assert.equal(plan.reason, null);
});

test("buildStopPlan: active phase → confirm with phase and task", () => {
  const sessions = parseSessions("demo", "demo-teamlead\n");
  const pipeline = { exists: true, state: { phase: "development", task: "TASK-7" }, raw: "" };
  const plan = buildStopPlan(cfg, sessions, pipeline);
  assert.equal(plan.needsConfirm, true);
  assert.match(plan.reason, /development/);
  assert.match(plan.reason, /TASK-7/);
});

test("buildStopPlan: batch_done or no state → no confirm", () => {
  const sessions = parseSessions("demo", "demo-teamlead\n");
  assert.equal(buildStopPlan(cfg, sessions, { exists: true, state: { phase: "batch_done" }, raw: "" }).needsConfirm, false);
  assert.equal(buildStopPlan(cfg, sessions, { exists: false, state: null, raw: null }).needsConfirm, false);
  assert.equal(buildStopPlan(cfg, sessions, { exists: true, state: null, raw: "broken" }).needsConfirm, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/lifecycle.test.mjs`
Expected: FAIL - `buildStopPlan` не експортована

- [ ] **Step 3: Write implementation**

Append to `src/lifecycle.mjs`:

```js
// Pure: which sessions to kill and whether to ask first.
export function buildStopPlan(cfg, sessions, pipeline) {
  const phase = pipeline?.state?.phase ?? null;
  const busy = phase !== null && phase !== "idle" && phase !== "batch_done";
  const task = pipeline?.state?.task;
  return {
    sessions: [...sessions.live].sort(),
    needsConfirm: busy,
    reason: busy ? `фаза "${phase}"${task ? `, задача ${task}` : ""}` : null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/lifecycle.test.mjs`
Expected: PASS (14 тестів)

- [ ] **Step 5: Commit**

```bash
git add src/lifecycle.mjs test/lifecycle.test.mjs
git commit -m "feat: buildStopPlan"
```

---

### Task 4: side-effect обгортки + CLI `status` і `attach`

**Files:**
- Modify: `src/lifecycle.mjs`
- Modify: `bin/cli.mjs`
- Modify: `test/smoke.test.mjs`

- [ ] **Step 1: Write the failing smoke tests**

Append to `test/smoke.test.mjs`:

```js
test("--help lists lifecycle commands", () => {
  const out = execFileSync("node", [cli, "--help"], { encoding: "utf8" });
  for (const c of ["status", "attach", "stop", "resume"]) assert.match(out, new RegExp(c));
});

test("status outside a project exits 1", () => {
  assert.throws(() => execFileSync("node", [cli, "status"], { encoding: "utf8", cwd: "/tmp" }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/smoke.test.mjs`
Expected: FAIL - help не містить `status` (обидва нові тести падають: перший на match, другий бо `status` зараз падає в default-гілку unknown command… яка теж exit 1 - тому щоб тест був чесний, перший тест і є гейт; другий пройде "випадково". Це ок - він захищає майбутню поведінку.)

- [ ] **Step 3: Write implementation**

Append to `src/lifecycle.mjs`:

```js
import { parseYesNo } from "./prompts.mjs";

// tmux ls; exit != 0 (no tmux server) → zero sessions, not an error.
export function listTmuxSessions() {
  const res = spawnSync("tmux", ["ls", "-F", "#{session_name}"], { encoding: "utf8" });
  return res.status === 0 ? res.stdout : "";
}

export async function checkHealth(url, timeoutMs = 2000) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function runStatus(cfg, { cwd = process.cwd() } = {}) {
  const sessions = parseSessions(cfg.project.name, listTmuxSessions());
  const pipeline = readPipelineState(join(cwd, ".agent-crew/.inbox"));
  const health = await checkHealth(cfg.devserver?.health_url);
  console.log(buildStatusReport(cfg, sessions, pipeline, { health }));
  return 0;
}

export function runAttach(cfg, role = "teamlead") {
  const prefix = cfg.project.name;
  if (!cfg.roles?.[role]) {
    const enabled = Object.entries(cfg.roles)
      .filter(([, on]) => on)
      .map(([r]) => r);
    console.error(`Роль "${role}" не активна в team.config.yaml. Активні: ${enabled.join(", ")}.`);
    return 1;
  }
  const session = `${prefix}-${role}`;
  const sessions = parseSessions(prefix, listTmuxSessions());
  if (!sessions.live.has(session)) {
    console.error(
      role === "teamlead"
        ? `Сесія ${session} не запущена. Запусти: agentcrew launch`
        : `Сесія ${session} не запущена. Воркерів піднімає teamlead: agentcrew attach`
    );
    return 1;
  }
  const res = spawnSync("tmux", ["attach", "-t", session], { stdio: "inherit" });
  return res.status ?? 1;
}
```

ВАЖЛИВО: `import { parseYesNo }` постав НА ПОЧАТОК файлу до решти імпортів (ESM hoisting все одно спрацює, але тримаємо імпорти згори). `parseYesNo` знадобиться в Task 5 - додаємо зараз, щоб не чіпати імпорти двічі.

In `bin/cli.mjs`:

1. Зміни парс argv (рядок 13):

```js
const [, , cmd, ...args] = process.argv;
```

2. Додай імпорт після наявних:

```js
import { runStatus, runAttach, runStop } from "../src/lifecycle.mjs";
```

(`runStop` з'явиться в Task 5; щоб коміт Task 4 був зелений - імпортуй поки лише `runStatus, runAttach`, а `runStop` додаси в Task 5.)

3. Нові case у `switch` (після `case "onboard"`):

```js
    case "status": {
      const cfg = loadCfgOrExit(cwd);
      process.exit(await runStatus(cfg, { cwd }));
      break;
    }
    case "attach": {
      const cfg = loadCfgOrExit(cwd);
      process.exit(runAttach(cfg, args[0] || "teamlead"));
      break;
    }
```

4. Онови help-текст:

```js
      console.log(`agentcrew — pluggable multi-agent crew

Usage: agentcrew <command>
  init      Scan repo, scaffold .agent-crew/ into the current project
  launch    Start the teamlead tmux session (self-onboards on first run)
  onboard   Run/refresh the deep project onboarding
  status    One-screen report: role sessions, devserver health, pipeline phase
  attach    Attach to a role's tmux session (default: teamlead)
  stop      Stop all crew sessions (--force to skip confirmation); .inbox state is kept
  resume    Relaunch the teamlead and continue from .inbox/status.md
  sync      Regenerate generated files from team.config.yaml
  doctor    Check preconditions (tmux, package manager, port, env)`);
```

(help згадує `stop`/`resume` вже зараз - їхні case з'являться в Task 5-7; виклик до того часу впаде в unknown command, це прийнятний проміжний стан всередині гілки.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/smoke.test.mjs test/lifecycle.test.mjs`
Expected: PASS

- [ ] **Step 5: Manual sanity (поза CI, якщо є tmux локально)**

Run: `node bin/cli.mjs status` у репо agent-crew (без .agent-crew/) → повідомлення про відсутній config, exit 1. Це очікувано.

- [ ] **Step 6: Commit**

```bash
git add src/lifecycle.mjs bin/cli.mjs test/smoke.test.mjs
git commit -m "feat: agentcrew status + attach"
```

---

### Task 5: `stop [--force]`

**Files:**
- Modify: `src/lifecycle.mjs`
- Modify: `test/lifecycle.test.mjs`
- Modify: `bin/cli.mjs`

- [ ] **Step 1: Write the failing test**

`runStop` приймає інжектований `ask` (тестовність без readline). Append to `test/lifecycle.test.mjs` (додай `runStop` до імпорту; tmux у CI відсутній або без сесій - обидва шляхи дають "нічого зупиняти"):

```js
test("runStop: no live sessions → nothing to stop, exit 0", async () => {
  const code = await runStop(cfg, { cwd: "/tmp", force: false, ask: async () => true });
  assert.equal(code, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lifecycle.test.mjs`
Expected: FAIL - `runStop` не експортована

- [ ] **Step 3: Write implementation**

Append to `src/lifecycle.mjs`:

```js
async function defaultAsk(question) {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return parseYesNo(await rl.question(question), false);
  } finally {
    rl.close();
  }
}

export async function runStop(cfg, { cwd = process.cwd(), force = false, ask = defaultAsk } = {}) {
  const sessions = parseSessions(cfg.project.name, listTmuxSessions());
  const pipeline = readPipelineState(join(cwd, ".agent-crew/.inbox"));
  const plan = buildStopPlan(cfg, sessions, pipeline);
  if (plan.sessions.length === 0) {
    console.log("Нічого зупиняти - жодної живої сесії crew.");
    return 0;
  }
  console.log(`Живі сесії: ${plan.sessions.join(", ")}`);
  if (plan.needsConfirm && !force) {
    const confirmed = await ask(`Pipeline активний (${plan.reason}). Точно зупинити? [y/N] `);
    if (!confirmed) {
      console.log("Скасовано - нічого не зупинено.");
      return 0;
    }
  }
  for (const s of plan.sessions) spawnSync("tmux", ["kill-session", "-t", s]);
  console.log(`Зупинено: ${plan.sessions.join(", ")}`);
  console.log("Стан у .inbox/ збережено - продовжити: agentcrew resume");
  return 0;
}
```

In `bin/cli.mjs`: додай `runStop` до імпорту з lifecycle і новий case:

```js
    case "stop": {
      const cfg = loadCfgOrExit(cwd);
      process.exit(await runStop(cfg, { cwd, force: args.includes("--force") }));
      break;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/lifecycle.test.mjs test/smoke.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lifecycle.mjs test/lifecycle.test.mjs bin/cli.mjs
git commit -m "feat: agentcrew stop with confirm on active pipeline"
```

---

### Task 6: resume-гілка в launch.sh + `launch({ resume })`

**Files:**
- Modify: `src/render.mjs:78-108` (генерація launch.sh)
- Modify: `src/launch.mjs:46-60`
- Modify: `test/render-bin.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `test/render-bin.test.mjs`:

```js
test("launch.sh supports resume via AGENT_CREW_RESUME with an alternative bootstrap", () => {
  const scripts = renderBinScripts(cfg);
  assert.match(scripts["launch.sh"], /AGENT_CREW_RESUME/);
  assert.match(scripts["launch.sh"], /відновлення після рестарту/);
  assert.match(scripts["launch.sh"], /не починай задачу заново/);
  // обидва промпти присутні: звичайний і resume
  assert.match(scripts["launch.sh"], /self-onboarding/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/render-bin.test.mjs`
Expected: FAIL - немає `AGENT_CREW_RESUME`

- [ ] **Step 3: Write implementation**

In `src/render.mjs`, всередині `renderBinScripts` після константи `bootstrap` додай:

```js
  const resumeBootstrap =
    "Прочитай повністю .agent-crew/agents/teamlead/CLAUDE.md і працюй за цією роллю. " +
    "Далі прочитай .agent-crew/agents/_shared/protocol.md і .agent-crew/agents/_shared/project.md. " +
    "Це відновлення після рестарту (resume): прочитай .agent-crew/.inbox/status.md і артефакти " +
    "поточної задачі в .agent-crew/.inbox/, підніми потрібних воркерів і devserver, " +
    "покажи мені коротке зведення стану (фаза, задача, останній артефакт) " +
    "і продовж роботу з поточної фази - не починай задачу заново.";
```

Заміни template-literal `launch` на версію з вибором промпту (зміни: блок `BOOTSTRAP=`, а `send-keys` бере `"$BOOTSTRAP"` замість інлайн-літерала):

```js
  const launch = `#!/usr/bin/env bash
# GENERATED by agentcrew. Edit team.config.yaml + run \`agentcrew sync\`.
# dev: ${dev}
set -euo pipefail
ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION="${prefix}-teamlead"

tmux has-session -t "$SESSION" 2>/dev/null && { tmux attach -t "$SESSION"; exit 0; }

BOOTSTRAP='${bootstrap.replace(/'/g, "'\\''")}'
if [ "\${AGENT_CREW_RESUME:-}" = "1" ]; then
  BOOTSTRAP='${resumeBootstrap.replace(/'/g, "'\\''")}'
fi

tmux new-session -d -s "$SESSION" -c "$ROOT"
tmux send-keys -t "$SESSION" "claude" Enter

for i in $(seq 1 30); do
  if tmux capture-pane -p -t "$SESSION" | grep -qE "(Welcome to Claude Code|│ >|Try )"; then break; fi
  sleep 1
done

tmux send-keys -t "$SESSION" C-u
sleep 1
tmux send-keys -t "$SESSION" "$BOOTSTRAP" Enter
sleep 3
tmux send-keys -t "$SESSION" Enter
tmux attach -t "$SESSION"
`;
```

In `src/launch.mjs`, зміни сигнатуру й env (рядки 46 і 57):

```js
export function launch(targetRoot, { onboard = false, resume = false } = {}) {
```

```js
    env: {
      ...process.env,
      AGENT_CREW_FORCE_ONBOARD: onboard ? "1" : "",
      AGENT_CREW_RESUME: resume ? "1" : "",
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/render-bin.test.mjs test/sync.test.mjs test/scaffold.test.mjs`
Expected: PASS (sync/scaffold ідемпотентність не зламана)

- [ ] **Step 5: Commit**

```bash
git add src/render.mjs src/launch.mjs test/render-bin.test.mjs
git commit -m "feat: AGENT_CREW_RESUME branch in generated launch.sh"
```

---

### Task 7: CLI `resume` + секція teamlead

**Files:**
- Modify: `bin/cli.mjs`
- Modify: `templates/agents/teamlead/CLAUDE.md` (вставка перед `## 11. Architect dispatch`)

- [ ] **Step 1: CLI case**

In `bin/cli.mjs` додай case:

```js
    case "resume": {
      loadCfgOrExit(cwd);
      if (!existsSync(join(cwd, ".agent-crew/.inbox/status.md"))) {
        console.error("Немає .agent-crew/.inbox/status.md - нема чого відновлювати. Використай: agentcrew launch");
        process.exit(1);
      }
      process.exit(launch(cwd, { resume: true }));
      break;
    }
```

- [ ] **Step 2: Teamlead-секція**

In `templates/agents/teamlead/CLAUDE.md` встав ПЕРЕД рядком `## 11. Architect dispatch` (нумерація 9→11 має пропуск - ця секція його заповнює):

```markdown
## 10. Відновлення після рестарту (resume)

Якщо тебе запущено з інструкцією відновлення (resume) - або ти сам бачиш, що `.inbox/status.md` має не-idle фазу, а воркер-сесії мертві (машину перезавантажили, tmux вбито):

1. Прочитай `.inbox/status.md` і робочу папку поточної задачі (`.inbox/TASK-<N>/`): останній `result-v*`, `review-v*`, `qa-report.md` - визнач, на якому кроці pipeline зупинився.
2. Перевір git: `git status` + `git log --oneline -5` - чи лишились незакомічені зміни від попередньої сесії. Незакомічене НЕ відкидай - це робота dev; розберись, до якої задачі воно належить.
3. Підніми потрібні сесії через `_bin/ensure-role.sh <role>` і devserver (§2.3).
4. Покажи користувачу коротке зведення: фаза, задача, останній артефакт, що робитимеш далі.
5. Продовж з поточної фази: поважай наявні артефакти (нумерація `result-v*`/`review-v*` продовжується), не починай задачу заново.

```

- [ ] **Step 3: Run tests (guard + smoke)**

Run: `node --test test/templates-generic.test.mjs test/smoke.test.mjs`
Expected: PASS - секція generic, help уже містить resume

- [ ] **Step 4: Commit**

```bash
git add bin/cli.mjs templates/agents/teamlead/CLAUDE.md
git commit -m "feat: agentcrew resume + teamlead recovery section"
```

---

### Task 8: docs + версія + фінальна перевірка

**Files:**
- Modify: `README.md` (таблиця Commands)
- Modify: `docs/how-it-works.md`
- Modify: `package.json` (version)

- [ ] **Step 1: README - онови таблицю Commands**

Заміни таблицю в секції `## Commands` на:

```markdown
| Command | What it does |
|---|---|
| `init` | Scan repo, scaffold `.agent-crew/` into the current project |
| `launch` | Start the teamlead tmux session (self-onboards on first run) |
| `onboard` | Run/refresh the deep project onboarding |
| `status` | One-screen report: role sessions, devserver health, pipeline phase |
| `attach [role]` | Attach to a role's tmux session (default: teamlead) |
| `stop [--force]` | Stop all crew sessions; warns if a task is in flight, `.inbox/` state is kept |
| `resume` | Relaunch the teamlead and continue from `.inbox/status.md` after a crash/reboot |
| `sync` | Regenerate generated files from `team.config.yaml` |
| `doctor` | Check preconditions (tmux, package manager, port, env) |
```

- [ ] **Step 2: docs/how-it-works.md - додай секцію**

Append наприкінці файлу:

```markdown
## Lifecycle commands

The CLI covers the daily loop around a running crew:

- **`agentcrew status`** - reads `tmux ls` + `.inbox/status.md` and prints one screen: which role sessions are up (optional roles that are down show as lazy), devserver session + health ping, and the current pipeline phase/task with the age of the last update. Works even when the tmux server is not running.
- **`agentcrew attach [role]`** - `tmux attach` to `<prefix>-<role>` with friendly errors (role disabled, session not running). Defaults to the teamlead.
- **`agentcrew stop [--force]`** - kills all `<prefix>-*` sessions including the devserver. If `status.md` shows an active phase (not `idle`/`batch_done`), it asks for confirmation first. `.inbox/` is never touched, so a later `resume` can pick up where the crew left off.
- **`agentcrew resume`** - runs `_bin/launch.sh` with `AGENT_CREW_RESUME=1`. The generated script swaps the bootstrap prompt for a recovery one: the teamlead reads `.inbox/status.md` and the current task artifacts, brings workers back up itself, shows a summary, and continues from the current phase. The CLI restores only the teamlead - orchestration stays in one place.
```

- [ ] **Step 3: package.json - version 0.2.0**

```json
  "version": "0.2.0",
```

- [ ] **Step 4: Full test run**

Run: `npm test`
Expected: PASS - усі тести зелені (36 старих + нові)

- [ ] **Step 5: Commit**

```bash
git add README.md docs/how-it-works.md package.json
git commit -m "docs: lifecycle commands + bump to 0.2.0"
```

---

## Self-Review

**Spec coverage (специфікація §3-§8):**
- §3 архітектура: чисті функції + обгортки → Task 1-5 ✓; без нових `_bin` ✓
- §4.1 status (ролі/lazy/devserver+health/pipeline/битий JSON/без tmux-сервера) → Task 2, 4 ✓
- §4.2 attach (дефолт teamlead, вимкнена роль, мертва сесія) → Task 4 ✓
- §4.3 stop (нема сесій → exit 0; confirm при активній фазі; `--force`; `.inbox` не чіпається) → Task 3, 5 ✓
- §4.4 resume (вимога status.md; `AGENT_CREW_RESUME=1`; альтернативний промпт; живий teamlead → attach через наявну логіку launch.sh) → Task 6, 7 ✓
- §5 файли: всі перелічені файли мають задачі ✓ (`test/render-bin.test.mjs` → Task 6)
- §6 помилки: нема config → `loadCfgOrExit` ✓; нема tmux-сервера → `listTmuxSessions` повертає "" ✓; битий status.md → Task 1, 2 ✓; nested attach → exit code tmux ✓ (нічого не робимо - за спекою)
- §7 тести: parseSessions (порожній/чужі/дефіси/повний) ✓, readPipelineState (3 кейси) ✓, buildStatusReport (4 кейси) ✓, buildStopPlan (3 кейси) ✓, render-bin resume ✓, guard-тест ✓
- §8 scope: версія 0.2.0 → Task 8 ✓; гілка `feat/lifecycle-commands` (створена до плану) ✓

**Placeholder scan:** немає TBD/TODO; кожен крок з кодом містить код повністю.

**Type consistency:** `parseSessions(prefix, out) → {live:Set, roles:[], server:bool}` використовується однаково в Task 2/3/4/5; `readPipelineState → {exists, state, raw}` однаково в Task 1/2/3/5; `buildStopPlan → {sessions, needsConfirm, reason}` у Task 3/5; `launch(targetRoot, {onboard, resume})` у Task 6/7; env-ім'я `AGENT_CREW_RESUME` однакове в render/launch/docs.

**Відомий поза-скоуповий борг:** `AGENT_CREW_FORCE_ONBOARD` env виставляється, але launch.sh його не читає (баг існував до цього плану) - зафіксовано окремою задачею, тут не чіпаємо.
