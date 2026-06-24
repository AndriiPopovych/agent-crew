import { cpSync, mkdirSync, writeFileSync, existsSync, readFileSync, appendFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { writeConfig, OPT_ROLES } from "./config.mjs";
import { renderProjectMd, renderBinScripts } from "./render.mjs";
import { scanRepo } from "./scan.mjs";
import { seedKnowledge } from "./seed.mjs";

const TEMPLATES = fileURLToPath(new URL("../templates", import.meta.url));
const CORE_ROLES = ["teamlead", "dev", "qa"];
const GITIGNORE_LINE = ".agent-crew/.inbox/";

function headSha(root) {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function scaffold(cfg, { targetRoot, force = false }) {
  const ac = join(targetRoot, ".agent-crew");
  if (existsSync(ac)) {
    if (!force) throw new Error(`.agent-crew already exists at ${ac} (use force)`);
    rmSync(ac, { recursive: true, force: true });
  }

  // 1. agents/_shared (protocol verbatim) + README
  mkdirSync(join(ac, "agents/_shared"), { recursive: true });
  cpSync(join(TEMPLATES, "agents/_shared/protocol.md"), join(ac, "agents/_shared/protocol.md"));
  cpSync(join(TEMPLATES, "agents/README.md"), join(ac, "agents/README.md"));

  // 2. role dirs — only enabled
  const enabled = [...CORE_ROLES, ...OPT_ROLES.filter((r) => cfg.roles[r])];
  for (const role of enabled) {
    mkdirSync(join(ac, "agents", role), { recursive: true });
    cpSync(join(TEMPLATES, "agents", role, "CLAUDE.md"), join(ac, "agents", role, "CLAUDE.md"));
  }

  // 3. generated project.md
  writeFileSync(join(ac, "agents/_shared/project.md"), renderProjectMd(cfg), "utf8");

  // 4. _bin/*.sh (executable)
  mkdirSync(join(ac, "_bin"), { recursive: true });
  const scripts = renderBinScripts(cfg);
  for (const [name, body] of Object.entries(scripts)) {
    const p = join(ac, "_bin", name);
    writeFileSync(p, body, "utf8");
    chmodSync(p, 0o755);
  }

  // 5. knowledge/ — generic principles + seed onboarding/architecture
  mkdirSync(join(ac, "knowledge"), { recursive: true });
  cpSync(join(TEMPLATES, "knowledge/principles.md"), join(ac, "knowledge/principles.md"));
  const seed = seedKnowledge(cfg, scanRepo(targetRoot), { head: headSha(targetRoot) });
  for (const [name, body] of Object.entries(seed)) {
    writeFileSync(join(ac, "knowledge", name), body, "utf8");
  }

  // 6. .inbox/ runtime
  mkdirSync(join(ac, ".inbox/tasks"), { recursive: true });
  writeFileSync(join(ac, ".inbox/status.md"), '{"phase":"idle"}', "utf8");

  // 7. config (single source of truth)
  writeConfig(join(ac, "team.config.yaml"), cfg);

  // 8. patch host .gitignore
  const gi = join(targetRoot, ".gitignore");
  const has = existsSync(gi) && readFileSync(gi, "utf8").split("\n").includes(GITIGNORE_LINE);
  if (!has) appendFileSync(gi, (existsSync(gi) ? "\n" : "") + GITIGNORE_LINE + "\n");
}

export { CORE_ROLES };
