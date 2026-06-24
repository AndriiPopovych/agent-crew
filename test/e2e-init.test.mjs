import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectProject } from "../src/detect.mjs";
import { buildConfig, validateConfig } from "../src/config.mjs";
import { scaffold } from "../src/scaffold.mjs";
import { syncGenerated } from "../src/sync.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/next-bun", import.meta.url));

test("init pipeline on a fixture produces a complete, valid .agent-crew", () => {
  const root = mkdtempSync(join(tmpdir(), "e2e-"));
  try {
    cpSync(FIXTURE, root, { recursive: true });

    const detected = detectProject(root);
    assert.equal(detected.runtime.package_manager, "bun");
    assert.equal(detected.commands.build, "bun --bun run build");

    const cfg = buildConfig(detected, { roles: { architect: true, techwriter: true }, language: "ua" });
    assert.equal(validateConfig(cfg).ok, true);

    scaffold(cfg, { targetRoot: root });

    const ac = join(root, ".agent-crew");
    for (const f of [
      "team.config.yaml",
      "agents/_shared/protocol.md",
      "agents/_shared/project.md",
      "agents/teamlead/CLAUDE.md",
      "agents/architect/CLAUDE.md",
      "agents/techwriter/CLAUDE.md",
      "knowledge/onboarding.md",
      "knowledge/architecture.md",
      "knowledge/principles.md",
      "_bin/launch.sh",
      "_bin/doctor.sh",
      "_bin/ensure-role.sh",
      ".inbox/status.md",
    ]) {
      assert.ok(existsSync(join(ac, f)), `missing ${f}`);
    }
    assert.ok(!existsSync(join(ac, "agents/ux/CLAUDE.md")));
    assert.match(readFileSync(join(ac, "agents/_shared/project.md"), "utf8"), /fixture-app-teamlead/);
    assert.match(readFileSync(join(ac, "_bin/launch.sh"), "utf8"), /fixture-app-teamlead/);
    assert.equal(readFileSync(join(ac, ".inbox/status.md"), "utf8"), '{"phase":"idle"}');

    syncGenerated(root);
    assert.match(readFileSync(join(ac, "agents/_shared/project.md"), "utf8"), /fixture-app/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
