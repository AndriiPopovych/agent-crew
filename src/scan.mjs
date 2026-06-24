import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const IGNORE = new Set(["node_modules", ".git", ".agent-crew", "dist", "build", ".next", "coverage"]);
const AGENT_DOCS = ["CLAUDE.md", "AGENTS.md", ".cursorrules", "GEMINI.md"];

function topTree(root, maxEntries = 60) {
  const out = [];
  const walk = (dir, prefix, depth) => {
    if (depth > 2 || out.length >= maxEntries) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith(".") && e.name !== ".github") continue;
      if (IGNORE.has(e.name)) continue;
      if (out.length >= maxEntries) break;
      out.push(prefix + e.name + (e.isDirectory() ? "/" : ""));
      if (e.isDirectory()) walk(join(dir, e.name), prefix + "  ", depth + 1);
    }
  };
  walk(root, "", 0);
  return out.join("\n");
}

function readIfExists(root, name, limit = 4000) {
  const p = join(root, name);
  if (!existsSync(p) || !statSync(p).isFile()) return "";
  return readFileSync(p, "utf8").slice(0, limit);
}

function recentGitLog(root) {
  try {
    return execFileSync("git", ["log", "--oneline", "-15"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

export function scanRepo(root) {
  return {
    tree: topTree(root),
    readme: readIfExists(root, "README.md"),
    git_log: recentGitLog(root),
    existing_agent_docs: AGENT_DOCS.filter((f) => existsSync(join(root, f))),
  };
}
