#!/usr/bin/env node
const [, , cmd] = process.argv;
const COMMANDS = ["init", "sync", "doctor", "launch", "onboard"];

if (!cmd || cmd === "--help" || cmd === "-h") {
  console.log(`agent-crew — pluggable multi-agent crew

Usage: agent-crew <command>

Commands:
  init      Scan repo, scaffold .agent-crew/ into the current project
  launch    Start the teamlead tmux session (self-onboards on first run)
  onboard   Run/refresh the deep project onboarding
  sync      Regenerate generated files from team.config.yaml
  doctor    Check preconditions (tmux, package manager, port, env)`);
  process.exit(0);
}

if (!COMMANDS.includes(cmd)) {
  console.error(`Unknown command: ${cmd}\nRun 'agent-crew --help'.`);
  process.exit(1);
}

console.log(`(stub) ${cmd}`);
