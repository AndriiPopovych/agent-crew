import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";

const PM_BY_LOCKFILE = {
  "bun.lock": "bun",
  "bun.lockb": "bun",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
};

const EXEC_PREFIX = {
  bun: "bun --bun",
  pnpm: "pnpm",
  yarn: "yarn",
  npm: "npm",
};

const FRAMEWORK_PORT = { next: 3000, vite: 5173, astro: 4321, "react-scripts": 3000 };

function pmFromLockfiles(lockfiles) {
  for (const f of lockfiles) {
    if (PM_BY_LOCKFILE[f]) return PM_BY_LOCKFILE[f];
  }
  return "npm";
}

function frameworkOf(pkg) {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  return Object.keys(FRAMEWORK_PORT).find((fw) => fw in deps) ?? null;
}

function scriptCmd(pm, prefix, scripts, name) {
  if (!scripts || !(name in scripts)) return name === "e2e" ? null : "";
  return `${prefix} run ${name}`;
}

export function detectFromFiles({ lockfiles = [], pkg = null, name = "project", root = "" }) {
  const pm = pmFromLockfiles(lockfiles);
  const prefix = EXEC_PREFIX[pm];
  const scripts = pkg?.scripts ?? null;
  const fw = frameworkOf(pkg);
  const port = (fw && FRAMEWORK_PORT[fw]) || 3000;

  return {
    project: { name, root, language: "ua" },
    runtime: { package_manager: pm, exec_prefix: prefix },
    commands: {
      dev: scriptCmd(pm, prefix, scripts, "dev"),
      build: scriptCmd(pm, prefix, scripts, "build"),
      lint: scriptCmd(pm, prefix, scripts, "lint"),
      test: scriptCmd(pm, prefix, scripts, "test"),
      e2e: scripts && "test:e2e" in scripts ? `${prefix} run test:e2e` : null,
    },
    devserver: { port, health_url: `http://localhost:${port}` },
    framework: fw,
  };
}

export function detectProject(cwd) {
  let root = cwd;
  try {
    root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
  } catch {
    /* not a git repo — use cwd */
  }
  const lockfiles = Object.keys(PM_BY_LOCKFILE).filter((f) => existsSync(join(root, f)));
  let pkg = null;
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    } catch {
      pkg = null;
    }
  }
  const name = (pkg?.name && typeof pkg.name === "string" && pkg.name.trim()) ? pkg.name.trim() : basename(root);
  return detectFromFiles({ lockfiles, pkg, name, root });
}
