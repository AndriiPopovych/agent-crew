import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBinScripts } from "../src/render.mjs";
import { buildConfig } from "../src/config.mjs";
import { detectFromFiles } from "../src/detect.mjs";

const cfg = buildConfig(
  detectFromFiles({ lockfiles: ["bun.lock"], pkg: { scripts: { dev: "next dev" }, dependencies: { next: "16" } }, name: "demo", root: "/tmp/demo" }),
  {}
);

test("renderBinScripts returns launch/doctor/ensure-role with shebang and session prefix", () => {
  const scripts = renderBinScripts(cfg);
  for (const name of ["launch.sh", "doctor.sh", "ensure-role.sh"]) {
    assert.ok(scripts[name], `${name} missing`);
    assert.match(scripts[name], /^#!\/usr\/bin\/env bash/);
  }
  assert.match(scripts["launch.sh"], /demo-teamlead/);
  assert.match(scripts["doctor.sh"], /3000/);
  assert.match(scripts["launch.sh"], /bun --bun run dev/);
});

test("doctor.sh includes a gstack check when qa_command is a slash-skill", () => {
  const scripts = renderBinScripts(cfg);
  assert.match(scripts["doctor.sh"], /gstack/);
});
