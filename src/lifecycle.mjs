import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CORE_ROLES = ["teamlead", "dev", "qa"];

// Pure: parse `tmux ls -F "#{session_name}"` output into crew sessions.
export function parseSessions(prefix, tmuxLsOutput) {
  const names = (tmuxLsOutput || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const mine = names.filter((n) => n.startsWith(`${prefix}-`));
  const roles = mine
    .filter((n) => n !== `${prefix}-server`)
    .map((n) => n.slice(prefix.length + 1));
  return { live: new Set(mine), roles, server: mine.includes(`${prefix}-server`) };
}

// status.md → { exists, state, raw }. Never throws: read error → raw null, broken JSON → state null.
export function readPipelineState(inboxDir) {
  const p = join(inboxDir, "status.md");
  if (!existsSync(p)) return { exists: false, state: null, raw: null };
  let raw = null;
  try {
    raw = readFileSync(p, "utf8").trim();
    const state = JSON.parse(raw);
    return { exists: true, state: typeof state === "object" && state !== null ? state : null, raw };
  } catch {
    return { exists: true, state: null, raw };
  }
}

export { CORE_ROLES };
