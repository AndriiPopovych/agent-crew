import { test } from "node:test";
import assert from "node:assert/strict";
import { seedKnowledge } from "../src/seed.mjs";
import { buildConfig } from "../src/config.mjs";
import { detectFromFiles } from "../src/detect.mjs";

const cfg = buildConfig(detectFromFiles({ lockfiles: ["bun.lock"], pkg: { scripts: { dev: "next dev" } }, name: "demo", root: "/tmp/demo" }), {});
const scan = { tree: "src/\n  index.ts", readme: "# Demo\nA demo app.", git_log: "abc init", existing_agent_docs: ["CLAUDE.md"] };

test("seed produces onboarding.md (pending) and architecture.md with tree", () => {
  const files = seedKnowledge(cfg, scan, { head: "abc1234" });
  assert.match(files["onboarding.md"], /status: pending-deep-onboarding/);
  assert.match(files["onboarding.md"], /generated_at_sha: abc1234/);
  assert.match(files["onboarding.md"], /demo/);
  assert.match(files["architecture.md"], /index\.ts/);
  assert.match(files["architecture.md"], /status: seed/);
  assert.match(files["architecture.md"], /generated_at_sha: abc1234/);
});
