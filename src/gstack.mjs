import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

function defaultSkillsDir() {
  return process.env.AGENT_CREW_SKILLS_DIR || join(homedir(), ".claude", "skills");
}

export function isGstackInstalled({ skillsDir = defaultSkillsDir() } = {}) {
  return existsSync(join(skillsDir, "gstack", "VERSION"));
}

export function hasSkill(name, { skillsDir = defaultSkillsDir() } = {}) {
  return existsSync(join(skillsDir, name));
}

export function gstackInstallCommand() {
  return (
    "git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git " +
    "~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup"
  );
}

// Consent-gated: callers must confirm before invoking. Runs the official installer.
export function installGstack() {
  const res = spawnSync("bash", ["-lc", gstackInstallCommand()], { stdio: "inherit" });
  return res.status === 0;
}
