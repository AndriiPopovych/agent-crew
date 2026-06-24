import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepo } from "../src/scan.mjs";

test("scanRepo collects top-level tree, readme, existing agent docs", () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-"));
  try {
    writeFileSync(join(dir, "README.md"), "# Demo\nhello");
    writeFileSync(join(dir, "CLAUDE.md"), "arch notes");
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "index.ts"), "export const x = 1;");
    const r = scanRepo(dir);
    assert.ok(r.tree.includes("src"));
    assert.match(r.readme, /Demo/);
    assert.ok(r.existing_agent_docs.includes("CLAUDE.md"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
