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
