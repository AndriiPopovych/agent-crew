import { spawnSync } from "node:child_process";
import { join } from "node:path";

export function buildLaunchPlan(cfg) {
  const session = `${cfg.project.name}-teamlead`;
  return {
    session,
    steps: [
      `tmux new-session -d -s ${session}`,
      `tmux send-keys -t ${session} "claude" Enter`,
      `(polling for prompt)`,
      `tmux send-keys bootstrap: read teamlead CLAUDE.md, protocol.md, project.md; ` +
        `if knowledge/onboarding.md pending -> deep onboarding, else bring up dev/qa`,
      `tmux attach -t ${session}`,
    ],
  };
}

export function commandExists(cmd) {
  // Use `bash -c` (not `-lc`) so detection matches how launch.sh actually runs:
  // with the inherited PATH, not a re-sourced login profile.
  return spawnSync("bash", ["-c", `command -v ${cmd} >/dev/null 2>&1`]).status === 0;
}

// Pure: returns a guidance string when a launch prerequisite is missing, else null.
export function preflightMessage({ hasTmux, hasClaude }) {
  if (hasTmux && hasClaude) return null;
  const lines = [];
  if (!hasTmux) {
    lines.push(
      "tmux не знайдено - він потрібен для запуску crew (агенти живуть у tmux-сесіях):",
      "  macOS:          brew install tmux",
      "  Debian/Ubuntu:  sudo apt install tmux"
    );
  }
  if (!hasClaude) {
    lines.push(
      "claude (Claude Code CLI) не знайдено на PATH - без нього агенти не піднімуться.",
      "  встанови Claude Code: https://docs.claude.com/claude-code"
    );
  }
  lines.push("Встанови відсутнє і запусти знову: agentcrew launch");
  return lines.join("\n");
}

export function launch(targetRoot, { onboard = false } = {}) {
  const hasTmux = commandExists("tmux");
  const hasClaude = commandExists("claude");
  const msg = preflightMessage({ hasTmux, hasClaude });
  if (msg) console.error(msg);
  if (!hasTmux) return 1; // hard block: launch.sh needs tmux immediately
  // claude missing -> warned above but continue (may resolve inside the session env)
  const script = join(targetRoot, ".agent-crew/_bin/launch.sh");
  const res = spawnSync("bash", [script], {
    stdio: "inherit",
    cwd: targetRoot,
    env: { ...process.env, AGENT_CREW_FORCE_ONBOARD: onboard ? "1" : "" },
  });
  return res.status ?? 1;
}
