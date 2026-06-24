#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { detectProject } from "../src/detect.mjs";
import { buildConfig, readConfig, validateConfig } from "../src/config.mjs";
import { runInitPrompts } from "../src/prompts.mjs";
import { scaffold } from "../src/scaffold.mjs";
import { syncGenerated } from "../src/sync.mjs";
import { runDoctor } from "../src/doctor.mjs";
import { launch } from "../src/launch.mjs";

const [, , cmd] = process.argv;
const cwd = process.cwd();

function loadCfgOrExit(root) {
  const p = join(root, ".agent-crew/team.config.yaml");
  if (!existsSync(p)) {
    console.error("Не знайдено .agent-crew/team.config.yaml — спершу `agent-crew init`.");
    process.exit(1);
  }
  return readConfig(p);
}

async function doInit() {
  const detected = detectProject(cwd);
  const root = detected.project.root;
  if (existsSync(join(root, ".agent-crew"))) {
    console.error(".agent-crew/ вже існує. Видали її або відредагуй team.config.yaml + `agent-crew sync`.");
    process.exit(1);
  }
  const answers = await runInitPrompts(detected);
  const merged = {
    ...detected,
    commands: answers.commands,
    devserver: { port: answers.port, health_url: `http://localhost:${answers.port}` },
  };
  const cfg = buildConfig(merged, { roles: answers.roles, language: answers.language });
  const { ok, errors } = validateConfig(cfg);
  if (!ok) {
    console.error("Конфіг невалідний:\n  - " + errors.join("\n  - "));
    process.exit(1);
  }
  scaffold(cfg, { targetRoot: root });
  console.log(`\n✓ .agent-crew/ створено в ${root}`);
  console.log("Наступний крок:  agent-crew launch");
}

async function main() {
  switch (cmd) {
    case "init":
      await doInit();
      break;
    case "sync": {
      syncGenerated(cwd);
      console.log("✓ згенеровані файли оновлено з team.config.yaml");
      break;
    }
    case "doctor": {
      const cfg = loadCfgOrExit(cwd);
      process.exit(runDoctor(cfg, { cwd }) ? 0 : 1);
      break;
    }
    case "launch":
      loadCfgOrExit(cwd);
      process.exit(launch(cwd, { onboard: false }));
      break;
    case "onboard":
      loadCfgOrExit(cwd);
      process.exit(launch(cwd, { onboard: true }));
      break;
    case undefined:
    case "--help":
    case "-h":
      console.log(`agent-crew — pluggable multi-agent crew

Usage: agent-crew <command>
  init      Scan repo, scaffold .agent-crew/ into the current project
  launch    Start the teamlead tmux session (self-onboards on first run)
  onboard   Run/refresh the deep project onboarding
  sync      Regenerate generated files from team.config.yaml
  doctor    Check preconditions (tmux, package manager, port, env)`);
      break;
    default:
      console.error(`Unknown command: ${cmd}\nRun 'agent-crew --help'.`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
