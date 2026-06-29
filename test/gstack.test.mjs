import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isGstackInstalled, hasSkill, gstackInstallCommand } from "../src/gstack.mjs";

test("isGstackInstalled true when VERSION present, false otherwise", () => {
  const skills = mkdtempSync(join(tmpdir(), "skills-"));
  try {
    assert.equal(isGstackInstalled({ skillsDir: skills }), false);
    mkdirSync(join(skills, "gstack"), { recursive: true });
    writeFileSync(join(skills, "gstack", "VERSION"), "1.0.0");
    assert.equal(isGstackInstalled({ skillsDir: skills }), true);
  } finally {
    rmSync(skills, { recursive: true, force: true });
  }
});

test("hasSkill checks a skill dir under skillsDir", () => {
  const skills = mkdtempSync(join(tmpdir(), "skills-"));
  try {
    assert.equal(hasSkill("qa-only", { skillsDir: skills }), false);
    mkdirSync(join(skills, "qa-only"), { recursive: true });
    assert.equal(hasSkill("qa-only", { skillsDir: skills }), true);
  } finally {
    rmSync(skills, { recursive: true, force: true });
  }
});

test("gstackInstallCommand is the canonical clone+setup one-liner", () => {
  const cmd = gstackInstallCommand();
  assert.match(cmd, /git clone --single-branch --depth 1 https:\/\/github\.com\/garrytan\/gstack\.git/);
  assert.match(cmd, /\.\/setup/);
});
