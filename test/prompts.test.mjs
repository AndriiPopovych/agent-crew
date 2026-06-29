import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYesNo, parseRoleToggles, resolveQaCommand } from "../src/prompts.mjs";

test("parseYesNo: blank uses default, y/n override", () => {
  assert.equal(parseYesNo("", true), true);
  assert.equal(parseYesNo("n", true), false);
  assert.equal(parseYesNo("Y", false), true);
});

test("parseRoleToggles: comma list of opt roles -> booleans", () => {
  const r = parseRoleToggles("architect, techwriter");
  assert.deepEqual(r, { ux: false, architect: true, techwriter: true });
});

test("parseRoleToggles: blank -> all opt off", () => {
  assert.deepEqual(parseRoleToggles(""), { ux: false, architect: false, techwriter: false });
});

test("resolveQaCommand: gstack present -> /qa-only; absent+declined -> ''", () => {
  assert.equal(resolveQaCommand({ gstackPresent: true, install: false }), "/qa-only");
  assert.equal(resolveQaCommand({ gstackPresent: false, install: true }), "/qa-only");
  assert.equal(resolveQaCommand({ gstackPresent: false, install: false }), "");
});
