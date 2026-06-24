import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildConfig, validateConfig, writeConfig, readConfig } from "../src/config.mjs";
import { detectFromFiles } from "../src/detect.mjs";

const detected = detectFromFiles({
  lockfiles: ["bun.lock"],
  pkg: { scripts: { dev: "next dev", build: "next build" }, dependencies: { next: "16" } },
  name: "demo",
  root: "/tmp/demo",
});

test("buildConfig: core roles on, chosen opt roles, default sources + memory", () => {
  const cfg = buildConfig(detected, { roles: { ux: false, architect: true, techwriter: false }, language: "ua" });
  assert.equal(cfg.roles.teamlead, true);
  assert.equal(cfg.roles.dev, true);
  assert.equal(cfg.roles.qa, true);
  assert.equal(cfg.roles.architect, true);
  assert.equal(cfg.roles.ux, false);
  assert.equal(cfg.project.language, "ua");
  assert.ok(cfg.sources_of_truth.some((s) => s.path === "README.md"));
  assert.match(cfg.memory.path, /demo/);
});

test("validateConfig: rejects missing name and bad port", () => {
  const bad = buildConfig(detected, {});
  bad.project.name = "";
  bad.devserver.port = "nope";
  const { ok, errors } = validateConfig(bad);
  assert.equal(ok, false);
  assert.equal(errors.length, 2);
});

test("write then read round-trips", () => {
  const dir = mkdtempSync(join(tmpdir(), "ac-"));
  try {
    const cfg = buildConfig(detected, { roles: { architect: true } });
    const p = join(dir, "team.config.yaml");
    writeConfig(p, cfg);
    const back = readConfig(p);
    assert.deepEqual(back.roles, cfg.roles);
    assert.equal(back.project.name, "demo");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
