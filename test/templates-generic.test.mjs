import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const TEMPLATES = fileURLToPath(new URL("../templates", import.meta.url));

function mdFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...mdFiles(p));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

const FORBIDDEN = [
  /sync-matrix/i,
  /supabase/i,
  /\/root\/projects/i,
  /synchronization matri/i,
  /bun --bun/,
  /next\.?js/i,
  /\bMGRS\b/,
  /leaflet/i,
  /\bPRD\b/,
];

test("no project-specific leaks in any template", () => {
  for (const f of mdFiles(TEMPLATES)) {
    const text = readFileSync(f, "utf8");
    for (const re of FORBIDDEN) {
      assert.ok(!re.test(text), `${f} leaks ${re}`);
    }
  }
});

test("core roles reference protocol.md and project.md", () => {
  for (const role of ["teamlead", "dev", "qa"]) {
    const text = readFileSync(join(TEMPLATES, "agents", role, "CLAUDE.md"), "utf8");
    assert.match(text, /protocol\.md/, `${role} must reference protocol.md`);
    assert.match(text, /project\.md/, `${role} must reference project.md`);
  }
});

test("teamlead defines onboarding + clarification behavior", () => {
  const text = readFileSync(join(TEMPLATES, "agents", "teamlead", "CLAUDE.md"), "utf8");
  assert.match(text, /onboarding/i, "teamlead must describe onboarding");
  assert.match(text, /уточн/i, "teamlead must describe clarifying questions");
});
