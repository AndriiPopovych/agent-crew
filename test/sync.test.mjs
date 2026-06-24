import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold } from "../src/scaffold.mjs";
import { syncGenerated } from "../src/sync.mjs";
import { buildConfig, readConfig, writeConfig } from "../src/config.mjs";
import { detectFromFiles } from "../src/detect.mjs";

test("sync regenerates project.md after config edit, leaves role files untouched", () => {
  const root = mkdtempSync(join(tmpdir(), "sync-"));
  try {
    const cfg = buildConfig(detectFromFiles({ lockfiles: ["bun.lock"], pkg: { scripts: { dev: "next dev" } }, name: "demo", root }), {});
    scaffold(cfg, { targetRoot: root });

    const rolePath = join(root, ".agent-crew/agents/dev/CLAUDE.md");
    writeFileSync(rolePath, "CUSTOM EDIT", "utf8");
    const cfgPath = join(root, ".agent-crew/team.config.yaml");
    const edited = readConfig(cfgPath);
    edited.devserver.port = 8080;
    edited.devserver.health_url = "http://localhost:8080";
    writeConfig(cfgPath, edited);

    syncGenerated(root);

    assert.match(readFileSync(join(root, ".agent-crew/agents/_shared/project.md"), "utf8"), /8080/);
    assert.equal(readFileSync(rolePath, "utf8"), "CUSTOM EDIT"); // untouched
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
