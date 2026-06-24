import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

test("--help exits 0 and prints usage", () => {
  const out = execFileSync("node", [cli, "--help"], { encoding: "utf8" });
  assert.match(out, /Usage: agent-crew/);
  assert.match(out, /init/);
  assert.match(out, /launch/);
});

test("unknown command exits 1", () => {
  assert.throws(() => execFileSync("node", [cli, "bogus"], { encoding: "utf8" }));
});

test("sync without config exits 1", () => {
  assert.throws(() => execFileSync("node", [cli, "sync"], { encoding: "utf8", cwd: "/tmp" }));
});
