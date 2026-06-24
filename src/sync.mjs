import { writeFileSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readConfig, validateConfig } from "./config.mjs";
import { renderProjectMd, renderBinScripts } from "./render.mjs";

// Regenerates ONLY generated files (project.md, _bin/*). Never touches role markdown.
export function syncGenerated(targetRoot) {
  const ac = join(targetRoot, ".agent-crew");
  const cfgPath = join(ac, "team.config.yaml");
  if (!existsSync(cfgPath)) throw new Error(`no team.config.yaml at ${cfgPath} — run 'agentcrew init' first`);

  const cfg = readConfig(cfgPath);
  const { ok, errors } = validateConfig(cfg);
  if (!ok) throw new Error("invalid config:\n  - " + errors.join("\n  - "));

  writeFileSync(join(ac, "agents/_shared/project.md"), renderProjectMd(cfg), "utf8");

  const scripts = renderBinScripts(cfg);
  for (const [name, body] of Object.entries(scripts)) {
    const p = join(ac, "_bin", name);
    writeFileSync(p, body, "utf8");
    chmodSync(p, 0o755);
  }
  return cfg;
}
