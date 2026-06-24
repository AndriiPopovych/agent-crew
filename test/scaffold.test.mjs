import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold } from "../src/scaffold.mjs";
import { buildConfig } from "../src/config.mjs";
import { detectFromFiles } from "../src/detect.mjs";

function makeCfg(root) {
  return buildConfig(detectFromFiles({ lockfiles: ["bun.lock"], pkg: { scripts: { dev: "next dev" }, dependencies: { next: "16" } }, name: "demo", root }), { roles: { architect: true } });
}

test("scaffold writes full .agent-crew tree, only enabled roles, patches gitignore", () => {
  const root = mkdtempSync(join(tmpdir(), "host-"));
  try {
    const cfg = makeCfg(root);
    scaffold(cfg, { targetRoot: root });
    const ac = join(root, ".agent-crew");
    assert.ok(existsSync(join(ac, "team.config.yaml")));
    assert.ok(existsSync(join(ac, "agents/_shared/protocol.md")));
    assert.ok(existsSync(join(ac, "agents/_shared/project.md")));
    assert.ok(existsSync(join(ac, "agents/teamlead/CLAUDE.md")));
    assert.ok(existsSync(join(ac, "agents/architect/CLAUDE.md")));   // enabled
    assert.ok(!existsSync(join(ac, "agents/ux/CLAUDE.md")));         // disabled
    assert.ok(existsSync(join(ac, "knowledge/onboarding.md")));
    assert.ok(existsSync(join(ac, "knowledge/principles.md")));
    assert.ok(existsSync(join(ac, "_bin/launch.sh")));
    assert.ok(existsSync(join(ac, ".inbox/status.md")));
    assert.match(readFileSync(join(root, ".gitignore"), "utf8"), /\.agent-crew\/\.inbox\//);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scaffold throws on existing .agent-crew without force", () => {
  const root = mkdtempSync(join(tmpdir(), "host2-"));
  try {
    const cfg = makeCfg(root);
    scaffold(cfg, { targetRoot: root });
    assert.throws(() => scaffold(cfg, { targetRoot: root }), /already exists/);
    scaffold(cfg, { targetRoot: root, force: true }); // no throw
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
