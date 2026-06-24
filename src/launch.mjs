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

export function launch(targetRoot, { onboard = false } = {}) {
  const script = join(targetRoot, ".agent-crew/_bin/launch.sh");
  const res = spawnSync("bash", [script], {
    stdio: "inherit",
    cwd: targetRoot,
    env: { ...process.env, AGENT_CREW_FORCE_ONBOARD: onboard ? "1" : "" },
  });
  return res.status ?? 1;
}
