import { test } from "node:test";
import assert from "node:assert/strict";
import { renderProjectMd } from "../src/render.mjs";
import { buildConfig } from "../src/config.mjs";
import { detectFromFiles } from "../src/detect.mjs";

const cfg = buildConfig(
  detectFromFiles({
    lockfiles: ["bun.lock"],
    pkg: { scripts: { dev: "next dev", build: "next build", test: "vitest" }, dependencies: { next: "16" } },
    name: "demo",
    root: "/tmp/demo",
  }),
  { roles: { architect: true } }
);

test("project.md contains commands, port, language, session prefix", () => {
  const md = renderProjectMd(cfg);
  assert.match(md, /bun --bun run build/);
  assert.match(md, /http:\/\/localhost:3000/);
  assert.match(md, /demo-teamlead/);
  assert.match(md, /Мова спілкування.*ua/i);
});

test("project.md surfaces qa_command", () => {
  const md = renderProjectMd(cfg);
  assert.match(md, /QA entrypoint/i);
  assert.match(md, /\/qa-only/);
});

test("project.md lists enabled roles only", () => {
  const md = renderProjectMd(cfg);
  assert.match(md, /architect/);
  assert.doesNotMatch(md, /\bux\b/); // ux disabled in this cfg
});
