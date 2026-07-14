import { execSync } from "node:child_process";

export function buildDoctorChecks(cfg) {
  const pm = cfg.runtime.package_manager;
  const port = cfg.devserver.port;
  const checks = [
    { label: "tmux installed", cmd: "command -v tmux >/dev/null" },
    { label: "claude (Claude Code CLI) installed", cmd: "command -v claude >/dev/null" },
    { label: `${pm} installed`, cmd: `command -v ${pm} >/dev/null` },
    {
      label: `port ${port} free`,
      cmd: `! (command -v lsof >/dev/null && lsof -iTCP:${port} -sTCP:LISTEN >/dev/null 2>&1)`,
    },
    { label: ".agent-crew/.inbox present", cmd: "test -d .agent-crew/.inbox" },
  ];
  if (typeof cfg.qa_command === "string" && cfg.qa_command.startsWith("/")) {
    checks.push({
      label: `gstack installed (for QA entrypoint ${cfg.qa_command})`,
      cmd: "test -f \"$HOME/.claude/skills/gstack/VERSION\"",
    });
  }
  return checks;
}

export function runDoctor(cfg, { cwd = process.cwd() } = {}) {
  const checks = buildDoctorChecks(cfg);
  let failed = 0;
  for (const c of checks) {
    let ok = true;
    try {
      execSync(c.cmd, { cwd, stdio: "ignore", shell: "/bin/bash" });
    } catch {
      ok = false;
      failed++;
    }
    console.log(`  ${ok ? "ok " : "!! "} ${c.label}`);
  }
  return failed === 0;
}
