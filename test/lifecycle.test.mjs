import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSessions, readPipelineState, relativeAge, buildStatusReport, buildStopPlan, runStop } from "../src/lifecycle.mjs";
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

test("readPipelineState: unreadable status.md → no throw, raw null", () => {
  const dir = mkdtempSync(join(tmpdir(), "inbox-"));
  try {
    mkdirSync(join(dir, "status.md"));
    assert.deepEqual(readPipelineState(dir), { exists: true, state: null, raw: null });
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

test("runStop: no live sessions → nothing to stop, exit 0", async () => {
  const code = await runStop(cfg, { cwd: "/tmp", force: false, ask: async () => true });
  assert.equal(code, 0);
});
