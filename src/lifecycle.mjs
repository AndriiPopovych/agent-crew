import { parseYesNo } from "./prompts.mjs";
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

export function relativeAge(iso, now = new Date()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const min = Math.round((now.getTime() - t) / 60000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв тому`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} год тому`;
  return `${Math.floor(h / 24)} дн тому`;
}

// Pure render of the one-screen status report.
export function buildStatusReport(cfg, sessions, pipeline, { health = null, now = new Date() } = {}) {
  const prefix = cfg.project.name;
  const lines = [`agent-crew - ${prefix}`, "", "Ролі:"];
  const enabled = Object.entries(cfg.roles)
    .filter(([, on]) => on)
    .map(([r]) => r);
  for (const role of enabled) {
    const up = sessions.live.has(`${prefix}-${role}`);
    const label = up ? "up" : CORE_ROLES.includes(role) ? "down" : "не запущена (lazy-роль)";
    lines.push(`  ${up ? "●" : "○"} ${role.padEnd(11)} ${label}`);
  }
  const extra = sessions.roles.filter((r) => !enabled.includes(r));
  if (extra.length) lines.push(`  інші сесії: ${extra.map((r) => `${prefix}-${r}`).join(", ")}`);

  lines.push("", "Devserver:");
  lines.push(`  ${sessions.server ? "●" : "○"} сесія ${prefix}-server: ${sessions.server ? "up" : "down"}`);
  if (health !== null) {
    lines.push(`  health ${cfg.devserver.health_url}: ${health ? "ok" : "недоступний"}`);
  }

  lines.push("", "Pipeline:");
  if (!pipeline.exists) {
    lines.push("  стан відсутній - crew ще не працювала або .inbox/ порожній");
  } else if (!pipeline.state) {
    lines.push("  status.md не парситься як JSON. Сирий вміст:");
    lines.push(`  ${pipeline.raw}`);
  } else {
    const s = pipeline.state;
    lines.push(`  фаза:     ${s.phase ?? "?"}`);
    if (s.task) lines.push(`  задача:   ${s.task}`);
    if (s.iteration != null) lines.push(`  ітерація: ${s.iteration}`);
    if (s.timestamp) {
      const age = relativeAge(s.timestamp, now);
      lines.push(`  оновлено: ${s.timestamp}${age ? ` (${age})` : ""}`);
    }
  }
  return lines.join("\n");
}

// Pure: which sessions to kill and whether to ask first.
export function buildStopPlan(cfg, sessions, pipeline) {
  const phase = pipeline?.state?.phase ?? null;
  const busy = phase !== null && phase !== "idle" && phase !== "batch_done";
  const task = pipeline?.state?.task;
  return {
    sessions: [...sessions.live].sort(),
    needsConfirm: busy,
    reason: busy ? `фаза "${phase}"${task ? `, задача ${task}` : ""}` : null,
  };
}

// tmux ls; exit != 0 (no tmux server) → zero sessions, not an error.
export function listTmuxSessions() {
  const res = spawnSync("tmux", ["ls", "-F", "#{session_name}"], { encoding: "utf8" });
  return res.status === 0 ? res.stdout : "";
}

export async function checkHealth(url, timeoutMs = 2000) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function runStatus(cfg, { cwd = process.cwd() } = {}) {
  const sessions = parseSessions(cfg.project.name, listTmuxSessions());
  const pipeline = readPipelineState(join(cwd, ".agent-crew/.inbox"));
  const health = await checkHealth(cfg.devserver?.health_url);
  console.log(buildStatusReport(cfg, sessions, pipeline, { health }));
  return 0;
}

export function runAttach(cfg, role = "teamlead") {
  const prefix = cfg.project.name;
  if (!cfg.roles?.[role]) {
    const enabled = Object.entries(cfg.roles)
      .filter(([, on]) => on)
      .map(([r]) => r);
    console.error(`Роль "${role}" не активна в team.config.yaml. Активні: ${enabled.join(", ")}.`);
    return 1;
  }
  const session = `${prefix}-${role}`;
  const sessions = parseSessions(prefix, listTmuxSessions());
  if (!sessions.live.has(session)) {
    console.error(
      role === "teamlead"
        ? `Сесія ${session} не запущена. Запусти: agentcrew launch`
        : `Сесія ${session} не запущена. Воркерів піднімає teamlead: agentcrew attach`
    );
    return 1;
  }
  const res = spawnSync("tmux", ["attach", "-t", session], { stdio: "inherit" });
  return res.status ?? 1;
}

async function defaultAsk(question) {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return parseYesNo(await rl.question(question), false);
  } finally {
    rl.close();
  }
}

function killTmuxSession(name) {
  spawnSync("tmux", ["kill-session", "-t", name]);
}

export async function runStop(
  cfg,
  { cwd = process.cwd(), force = false, ask = defaultAsk, listSessions = listTmuxSessions, kill = killTmuxSession } = {}
) {
  const sessions = parseSessions(cfg.project.name, listSessions());
  const pipeline = readPipelineState(join(cwd, ".agent-crew/.inbox"));
  const plan = buildStopPlan(cfg, sessions, pipeline);
  if (plan.sessions.length === 0) {
    console.log("Нічого зупиняти - жодної живої сесії crew.");
    return 0;
  }
  console.log(`Живі сесії: ${plan.sessions.join(", ")}`);
  if (plan.needsConfirm && !force) {
    const confirmed = await ask(`Pipeline активний (${plan.reason}). Точно зупинити? [y/N] `);
    if (!confirmed) {
      console.log("Скасовано - нічого не зупинено.");
      return 0;
    }
  }
  for (const s of plan.sessions) kill(s);
  console.log(`Зупинено: ${plan.sessions.join(", ")}`);
  console.log("Стан у .inbox/ збережено - продовжити: agentcrew resume");
  return 0;
}

export { CORE_ROLES };
