import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDoctorChecks } from "../src/doctor.mjs";
import { buildLaunchPlan } from "../src/launch.mjs";
import { buildConfig } from "../src/config.mjs";
import { detectFromFiles } from "../src/detect.mjs";

const cfg = buildConfig(detectFromFiles({ lockfiles: ["bun.lock"], pkg: { scripts: { dev: "next dev" } }, name: "demo", root: "/tmp/demo" }), {});

test("doctor checks reference tmux, package manager, port", () => {
  const checks = buildDoctorChecks(cfg);
  const labels = checks.map((c) => c.label).join(" | ");
  assert.match(labels, /tmux/);
  assert.match(labels, /bun/);
  assert.match(labels, /3000/);
  for (const c of checks) assert.equal(typeof c.cmd, "string");
});

test("launch plan targets the teamlead session and includes bootstrap", () => {
  const plan = buildLaunchPlan(cfg);
  assert.equal(plan.session, "demo-teamlead");
  assert.ok(plan.steps.some((s) => /new-session/.test(s)));
  assert.ok(plan.steps.some((s) => /onboarding/i.test(s)));
});
