import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parse, stringify } from "yaml";

const OPT_ROLES = ["ux", "architect", "techwriter"];

function memorySlug(root) {
  return "-" + root.replace(/^\/+/, "").replace(/\//g, "-");
}

const DEFAULT_SOURCES = [
  { path: "README.md", what: "огляд проєкту, як запускати", how: "read один раз" },
  { path: "CLAUDE.md", what: "архітектура, конвенції (якщо є)", how: "read один раз" },
  { path: "docs/**/*.md", what: "наявна документація", how: "grep за темою" },
];

export function buildConfig(detected, { roles = {}, language, qaCommand } = {}) {
  const root = detected.project.root || process.cwd();
  return {
    project: {
      name: detected.project.name,
      root,
      language: language ?? detected.project.language ?? "ua",
    },
    runtime: { ...detected.runtime },
    commands: { ...detected.commands },
    qa_command: qaCommand ?? "/qa-only",
    devserver: { ...detected.devserver },
    roles: {
      teamlead: true,
      dev: true,
      qa: true,
      ux: roles.ux ?? false,
      architect: roles.architect ?? false,
      techwriter: roles.techwriter ?? false,
    },
    sources_of_truth: DEFAULT_SOURCES.map((s) => ({ ...s })),
    quality_standard: null,
    memory: { path: `~/.claude/projects/${memorySlug(root)}/memory/MEMORY.md` },
    gotchas: [],
  };
}

export function validateConfig(cfg) {
  const errors = [];
  if (!cfg?.project?.name) errors.push("project.name is required");
  if (typeof cfg?.devserver?.port !== "number") errors.push("devserver.port must be a number");
  if (!cfg?.roles?.teamlead || !cfg?.roles?.dev || !cfg?.roles?.qa) {
    errors.push("core roles (teamlead, dev, qa) must be enabled");
  }
  if (cfg?.qa_command != null && typeof cfg.qa_command !== "string") errors.push("qa_command must be a string");
  return { ok: errors.length === 0, errors };
}

export function writeConfig(path, cfg) {
  const header =
    "# agent-crew project config — single source of truth.\n" +
    "# Edit then run `agentcrew sync` to regenerate generated files.\n\n";
  writeFileSync(path, header + stringify(cfg), "utf8");
}

export function readConfig(path) {
  return parse(readFileSync(path, "utf8"));
}

export function configHash(cfg) {
  return createHash("sha256").update(stringify(cfg)).digest("hex").slice(0, 12);
}

export { OPT_ROLES };
