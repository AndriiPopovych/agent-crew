import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFromFiles } from "../src/detect.mjs";

test("bun + next: picks bun, prefixes scripts, port 3000", () => {
  const r = detectFromFiles({
    lockfiles: ["bun.lock"],
    pkg: { scripts: { dev: "next dev", build: "next build", lint: "next lint", test: "vitest" }, dependencies: { next: "16" } },
  });
  assert.equal(r.runtime.package_manager, "bun");
  assert.equal(r.runtime.exec_prefix, "bun --bun");
  assert.equal(r.commands.dev, "bun --bun run dev");
  assert.equal(r.commands.e2e, null);
  assert.equal(r.devserver.port, 3000);
});

test("pnpm + vite: pnpm prefix, port 5173", () => {
  const r = detectFromFiles({
    lockfiles: ["pnpm-lock.yaml"],
    pkg: { scripts: { dev: "vite", build: "vite build", test: "vitest", "test:e2e": "playwright test" }, devDependencies: { vite: "5" } },
  });
  assert.equal(r.runtime.package_manager, "pnpm");
  assert.equal(r.runtime.exec_prefix, "pnpm");
  assert.equal(r.commands.test, "pnpm run test");
  assert.equal(r.commands.e2e, "pnpm run test:e2e");
  assert.equal(r.devserver.port, 5173);
});

test("no pkg: generic fallback with empty commands", () => {
  const r = detectFromFiles({ lockfiles: [], pkg: null });
  assert.equal(r.runtime.package_manager, "npm");
  assert.equal(r.commands.dev, "");
  assert.equal(r.devserver.port, 3000);
});
