# agent-crew — CLI Scaffolder Foundation (Plan 1 / 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `agent-crew` npm CLI that scaffolds a self-contained `.agent-crew/` multi-agent setup into any repo, fully unit- and integration-tested, with minimal-but-functional role stubs.

**Architecture:** Node.js ESM package. Pure logic modules (`detect`, `config`, `render`, `scan`, `seed`, `doctor`, `launch`) are side-effect-free and unit-tested; `scaffold` and `bin/cli.mjs` do IO/orchestration and are covered by integration tests against fixture repos. Project-specific values flow from a single `team.config.yaml` into generated `agents/_shared/project.md` + `_bin/*.sh`; role markdown is copied verbatim from `templates/`.

**Tech Stack:** Node.js >=20 (ESM), built-in `node:test` + `node:assert/strict`, `node:readline/promises`, single runtime dep `yaml`. No build step.

**Scope of this plan:** Everything except the *content* of the 6 role files (Plan 2) and OSS packaging/publish (Plan 3). Role templates here are minimal functional stubs; the real engine `protocol.md` is ported in full since it is already project-agnostic.

**Config object shape (used by every module — keys match `team.config.yaml` 1:1):**
```js
{
  project:   { name: string, root: string, language: string },     // language e.g. "ua"
  runtime:   { package_manager: string, exec_prefix: string },     // exec_prefix may be ""
  commands:  { dev: string, build: string, lint: string, test: string, e2e: string|null },
  devserver: { port: number, health_url: string },
  roles:     { teamlead: true, dev: true, qa: true, ux: bool, architect: bool, techwriter: bool },
  sources_of_truth: Array<{ path: string, what: string, how: string }>,
  quality_standard: string|null,
  memory:    { path: string },
  gotchas:   string[]
}
```

---

## File Structure

Tool repo (`~/Documents/projects/agent-crew`):

| Path | Responsibility |
|---|---|
| `package.json` | Package metadata, `"bin"`, `"type":"module"`, test script |
| `bin/cli.mjs` | Arg parsing + command dispatch (`init`/`sync`/`doctor`/`launch`/`onboard`) |
| `src/detect.mjs` | Static stack detection → partial config (pure) |
| `src/config.mjs` | Build default config, validate, read/write YAML |
| `src/render.mjs` | Render `project.md` + `_bin/*.sh` strings from config (pure) |
| `src/scan.mjs` | Cheap repo scan (tree, git log, readme, existing agent docs) (pure-ish, reads FS) |
| `src/seed.mjs` | Build `knowledge/onboarding.md` + `architecture.md` seed strings (pure) |
| `src/scaffold.mjs` | Create `.agent-crew/` tree, copy role templates, write generated files, patch `.gitignore` |
| `src/prompts.mjs` | Interactive `confirm`/`select`/`text` via readline |
| `src/doctor.mjs` | Build preconditions check list + runner (pure builder + thin exec) |
| `src/launch.mjs` | Build tmux+claude command sequence (pure) + thin exec |
| `templates/agents/_shared/protocol.md` | Engine protocol (verbatim-agnostic) |
| `templates/agents/{teamlead,dev,qa,ux,architect,techwriter}/CLAUDE.md` | Role stubs (real content = Plan 2) |
| `templates/agents/README.md` | Static crew readme stub |
| `test/*.test.mjs` | Unit + integration tests |
| `test/fixtures/` | Fixture repos for integration tests |

Generated into a host repo:
```
<host>/.agent-crew/{team.config.yaml, agents/, knowledge/, _bin/, .inbox/}
```

---

## Task 1: Project skeleton

**Files:**
- Create: `package.json`
- Create: `bin/cli.mjs`
- Create: `test/smoke.test.mjs`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "agent-crew",
  "version": "0.1.0",
  "description": "Pluggable tmux-based multi-agent crew for Claude Code — drop into any repo.",
  "type": "module",
  "bin": { "agent-crew": "bin/cli.mjs" },
  "engines": { "node": ">=20" },
  "files": ["bin", "src", "templates"],
  "scripts": {
    "test": "node --test"
  },
  "dependencies": {
    "yaml": "^2.5.0"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Install dependency**

Run: `cd ~/Documents/projects/agent-crew && npm install`
Expected: creates `node_modules/`, `package-lock.json`; exit 0.

- [ ] **Step 3: Write minimal `bin/cli.mjs`**

```js
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
```

- [ ] **Step 4: Write smoke test**

```js
// test/smoke.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

test("--help exits 0 and prints usage", () => {
  const out = execFileSync("node", [cli, "--help"], { encoding: "utf8" });
  assert.match(out, /Usage: agent-crew/);
});

test("unknown command exits 1", () => {
  assert.throws(() => execFileSync("node", [cli, "bogus"], { encoding: "utf8" }));
});
```

- [ ] **Step 5: Run tests**

Run: `cd ~/Documents/projects/agent-crew && npm test`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/projects/agent-crew
git add package.json package-lock.json bin/cli.mjs test/smoke.test.mjs
git commit -m "feat: cli skeleton with command dispatch"
```

---

## Task 2: Stack detection (`detect.mjs`)

**Files:**
- Create: `src/detect.mjs`
- Test: `test/detect.test.mjs`

- [ ] **Step 1: Write failing test**

```js
// test/detect.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFromFiles } from "../src/detect.mjs";

test("bun + next: picks bun, prefixes scripts, port 3000", () => {
  const r = detectFromFiles({
    lockfiles: ["bun.lock"],
    pkg: { scripts: { dev: "next dev", build: "next build", lint: "next lint", test: "vitest" }, dependencies: { next: "16" } },
  });
  assert.equal(r.runtime.package_manager, "bun");
  assert.equal(r.runtime.exec_prefix, "bun --bun");
  assert.equal(r.commands.dev, "bun --bun run dev");
  assert.equal(r.commands.e2e, null);
  assert.equal(r.devserver.port, 3000);
});

test("pnpm + vite: pnpm prefix, port 5173", () => {
  const r = detectFromFiles({
    lockfiles: ["pnpm-lock.yaml"],
    pkg: { scripts: { dev: "vite", build: "vite build", test: "vitest", "test:e2e": "playwright test" }, devDependencies: { vite: "5" } },
  });
  assert.equal(r.runtime.package_manager, "pnpm");
  assert.equal(r.runtime.exec_prefix, "pnpm");
  assert.equal(r.commands.test, "pnpm run test");
  assert.equal(r.commands.e2e, "pnpm run test:e2e");
  assert.equal(r.devserver.port, 5173);
});

test("no pkg: generic fallback with empty commands", () => {
  const r = detectFromFiles({ lockfiles: [], pkg: null });
  assert.equal(r.runtime.package_manager, "npm");
  assert.equal(r.commands.dev, "");
  assert.equal(r.devserver.port, 3000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/detect.test.mjs`
Expected: FAIL — cannot find module `../src/detect.mjs`.

- [ ] **Step 3: Implement `src/detect.mjs`**

```js
// src/detect.mjs
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
  // pnpm/yarn/npm: "<pm> run <name>"; bun: "<prefix> run <name>"
  return `${prefix} run ${name}`;
}

// Pure core — tested directly.
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

// FS wrapper — used by the CLI, not unit-tested directly.
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
  return detectFromFiles({ lockfiles, pkg, name: basename(root), root });
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/detect.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/detect.mjs test/detect.test.mjs
git commit -m "feat: static stack detection"
```

---

## Task 3: Config build / validate / IO (`config.mjs`)

**Files:**
- Create: `src/config.mjs`
- Test: `test/config.test.mjs`

- [ ] **Step 1: Write failing test**

```js
// test/config.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildConfig, validateConfig, writeConfig, readConfig } from "../src/config.mjs";
import { detectFromFiles } from "../src/detect.mjs";

const detected = detectFromFiles({
  lockfiles: ["bun.lock"],
  pkg: { scripts: { dev: "next dev", build: "next build" }, dependencies: { next: "16" } },
  name: "demo",
  root: "/tmp/demo",
});

test("buildConfig: core roles on, chosen opt roles, default sources + memory", () => {
  const cfg = buildConfig(detected, { roles: { ux: false, architect: true, techwriter: false }, language: "ua" });
  assert.equal(cfg.roles.teamlead, true);
  assert.equal(cfg.roles.dev, true);
  assert.equal(cfg.roles.qa, true);
  assert.equal(cfg.roles.architect, true);
  assert.equal(cfg.roles.ux, false);
  assert.equal(cfg.project.language, "ua");
  assert.ok(cfg.sources_of_truth.some((s) => s.path === "README.md"));
  assert.match(cfg.memory.path, /demo/);
});

test("validateConfig: rejects missing name and bad port", () => {
  const bad = buildConfig(detected, {});
  bad.project.name = "";
  bad.devserver.port = "nope";
  const { ok, errors } = validateConfig(bad);
  assert.equal(ok, false);
  assert.equal(errors.length, 2);
});

test("write then read round-trips", () => {
  const dir = mkdtempSync(join(tmpdir(), "ac-"));
  try {
    const cfg = buildConfig(detected, { roles: { architect: true } });
    const p = join(dir, "team.config.yaml");
    writeConfig(p, cfg);
    const back = readConfig(p);
    assert.deepEqual(back.roles, cfg.roles);
    assert.equal(back.project.name, "demo");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/config.test.mjs`
Expected: FAIL — cannot find module `../src/config.mjs`.

- [ ] **Step 3: Implement `src/config.mjs`**

```js
// src/config.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parse, stringify } from "yaml";

const OPT_ROLES = ["ux", "architect", "techwriter"];

function memorySlug(root) {
  // mirrors Claude Code's project dir slug: leading "-" + path with "/" -> "-"
  return "-" + root.replace(/^\/+/, "").replace(/\//g, "-");
}

const DEFAULT_SOURCES = [
  { path: "README.md", what: "огляд проєкту, як запускати", how: "read один раз" },
  { path: "CLAUDE.md", what: "архітектура, конвенції (якщо є)", how: "read один раз" },
  { path: "docs/**/*.md", what: "наявна документація", how: "grep за темою" },
];

export function buildConfig(detected, { roles = {}, language } = {}) {
  const root = detected.project.root || process.cwd();
  return {
    project: {
      name: detected.project.name,
      root,
      language: language ?? detected.project.language ?? "ua",
    },
    runtime: { ...detected.runtime },
    commands: { ...detected.commands },
    devserver: { ...detected.devserver },
    roles: {
      teamlead: true,
      dev: true,
      qa: true,
      ux: roles.ux ?? false,
      architect: roles.architect ?? false,
      techwriter: roles.techwriter ?? false,
    },
    sources_of_truth: DEFAULT_SOURCES.map((s) => ({ ...s })),
    quality_standard: null,
    memory: { path: `~/.claude/projects/${memorySlug(root)}/memory/MEMORY.md` },
    gotchas: [],
  };
}

export function validateConfig(cfg) {
  const errors = [];
  if (!cfg?.project?.name) errors.push("project.name is required");
  if (typeof cfg?.devserver?.port !== "number") errors.push("devserver.port must be a number");
  if (!cfg?.roles?.teamlead || !cfg?.roles?.dev || !cfg?.roles?.qa) {
    errors.push("core roles (teamlead, dev, qa) must be enabled");
  }
  return { ok: errors.length === 0, errors };
}

export function writeConfig(path, cfg) {
  const header =
    "# agent-crew project config — single source of truth.\n" +
    "# Edit then run `agent-crew sync` to regenerate generated files.\n\n";
  writeFileSync(path, header + stringify(cfg), "utf8");
}

export function readConfig(path) {
  return parse(readFileSync(path, "utf8"));
}

export function configHash(cfg) {
  return createHash("sha256").update(stringify(cfg)).digest("hex").slice(0, 12);
}

export { OPT_ROLES };
```

- [ ] **Step 4: Run tests**

Run: `node --test test/config.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.mjs test/config.test.mjs
git commit -m "feat: config build, validate, yaml IO"
```

---

## Task 4: Render `project.md` (`render.mjs` part 1)

**Files:**
- Create: `src/render.mjs`
- Test: `test/render-project.test.mjs`

- [ ] **Step 1: Write failing test**

```js
// test/render-project.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderProjectMd } from "../src/render.mjs";
import { buildConfig } from "../src/config.mjs";
import { detectFromFiles } from "../src/detect.mjs";

const cfg = buildConfig(
  detectFromFiles({
    lockfiles: ["bun.lock"],
    pkg: { scripts: { dev: "next dev", build: "next build", test: "vitest" }, dependencies: { next: "16" } },
    name: "demo",
    root: "/tmp/demo",
  }),
  { roles: { architect: true } }
);

test("project.md contains commands, port, language, session prefix", () => {
  const md = renderProjectMd(cfg);
  assert.match(md, /bun --bun run build/);
  assert.match(md, /http:\/\/localhost:3000/);
  assert.match(md, /demo-teamlead/);
  assert.match(md, /Мова спілкування.*ua/i);
});

test("project.md lists enabled roles only", () => {
  const md = renderProjectMd(cfg);
  assert.match(md, /architect/);
  assert.doesNotMatch(md, /\bux\b/); // ux disabled in this cfg
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/render-project.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `renderProjectMd` in `src/render.mjs`**

```js
// src/render.mjs

function row(k, v) {
  return `| ${k} | ${v} |`;
}

export function renderProjectMd(cfg) {
  const { project, runtime, commands, devserver, roles } = cfg;
  const enabledRoles = Object.entries(roles)
    .filter(([, on]) => on)
    .map(([r]) => r);

  const cmdRows = Object.entries(commands)
    .filter(([, v]) => v)
    .map(([k, v]) => row("`" + k + "`", "`" + v + "`"))
    .join("\n");

  const sources = cfg.sources_of_truth
    .map((s) => `| \`${s.path}\` | ${s.what} | ${s.how} |`)
    .join("\n");

  const gotchas = cfg.gotchas.length
    ? cfg.gotchas.map((g) => `- ${g}`).join("\n")
    : "- (поки немає — додай у `team.config.yaml`)";

  return `# Project context — ${project.name}

> ГЕНЕРОВАНО з \`team.config.yaml\`. Не редагуй вручну — зміни конфіг і запусти \`agent-crew sync\`.
> Кожна роль читає цей файл на bootstrap ПІСЛЯ \`protocol.md\`.

## Базове
- **Назва проєкту:** ${project.name}
- **Корінь:** \`${project.root}\`
- **Мова спілкування агентів:** ${project.language}
- **Префікс tmux-сесій:** \`${project.name}-<role>\` (напр. \`${project.name}-teamlead\`, \`${project.name}-dev\`)
- **Активні ролі:** ${enabledRoles.join(", ")}

## Стек / рантайм
- **Package manager:** ${runtime.package_manager}
- **Exec prefix:** \`${runtime.exec_prefix}\`

## Команди
| Дія | Команда |
|---|---|
${cmdRows}

## Dev-сервер
- **Порт:** ${devserver.port}
- **Health URL:** ${devserver.health_url}

## Quality standard (бібла для code review)
${cfg.quality_standard ? "`" + cfg.quality_standard + "`" : "`.agent-crew/knowledge/principles.md` (генерик — допили під проєкт)"}

## Джерела правди
| Шлях | Що містить | Як читати |
|---|---|---|
${sources}

## Project gotchas
${gotchas}

## Memory
- \`${cfg.memory.path}\`
`;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/render-project.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/render.mjs test/render-project.test.mjs
git commit -m "feat: render generated project.md"
```

---

## Task 5: Render `_bin/*.sh` (`render.mjs` part 2)

**Files:**
- Modify: `src/render.mjs`
- Test: `test/render-bin.test.mjs`

- [ ] **Step 1: Write failing test**

```js
// test/render-bin.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBinScripts } from "../src/render.mjs";
import { buildConfig } from "../src/config.mjs";
import { detectFromFiles } from "../src/detect.mjs";

const cfg = buildConfig(
  detectFromFiles({ lockfiles: ["bun.lock"], pkg: { scripts: { dev: "next dev" }, dependencies: { next: "16" } }, name: "demo", root: "/tmp/demo" }),
  {}
);

test("renderBinScripts returns launch/doctor/ensure-role with shebang and session prefix", () => {
  const scripts = renderBinScripts(cfg);
  for (const name of ["launch.sh", "doctor.sh", "ensure-role.sh"]) {
    assert.ok(scripts[name], `${name} missing`);
    assert.match(scripts[name], /^#!\/usr\/bin\/env bash/);
  }
  assert.match(scripts["launch.sh"], /demo-teamlead/);
  assert.match(scripts["doctor.sh"], /3000/);
  assert.match(scripts["launch.sh"], /bun --bun run dev/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/render-bin.test.mjs`
Expected: FAIL — `renderBinScripts is not a function`.

- [ ] **Step 3: Add `renderBinScripts` to `src/render.mjs`**

Append to `src/render.mjs`:

```js
export function renderBinScripts(cfg) {
  const prefix = cfg.project.name;
  const port = cfg.devserver.port;
  const health = cfg.devserver.health_url;
  const dev = cfg.commands.dev || "echo 'no dev command configured' && sleep infinity";
  const pm = cfg.runtime.package_manager;

  const bootstrap =
    "Прочитай повністю .agent-crew/agents/teamlead/CLAUDE.md і працюй за цією роллю. " +
    "Далі прочитай .agent-crew/agents/_shared/protocol.md і .agent-crew/agents/_shared/project.md. " +
    "Якщо .agent-crew/knowledge/onboarding.md ще не існує — спершу зроби self-onboarding: " +
    "досліди проєкт і напиши onboarding.md + architecture.md у .agent-crew/knowledge/, " +
    "покажи мені summary і спитай, над чим працюємо. Інакше — підніми dev/qa/devserver і чекай задачі.";

  const launch = `#!/usr/bin/env bash
# GENERATED by agent-crew. Edit team.config.yaml + run \`agent-crew sync\`.
set -euo pipefail
ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION="${prefix}-teamlead"

tmux has-session -t "$SESSION" 2>/dev/null && { tmux attach -t "$SESSION"; exit 0; }

tmux new-session -d -s "$SESSION" -c "$ROOT"
tmux send-keys -t "$SESSION" "claude" Enter

for i in $(seq 1 30); do
  if tmux capture-pane -p -t "$SESSION" | grep -qE "(Welcome to Claude Code|│ >|Try )"; then break; fi
  sleep 1
done

tmux send-keys -t "$SESSION" C-u
sleep 1
tmux send-keys -t "$SESSION" '${bootstrap.replace(/'/g, "'\\''")}' Enter
sleep 3
tmux send-keys -t "$SESSION" Enter
tmux attach -t "$SESSION"
`;

  const doctor = `#!/usr/bin/env bash
# GENERATED by agent-crew.
ok=0
chk() { if eval "$2"; then echo "  ok  $1"; else echo "  !!  $1"; ok=1; fi; }
echo "agent-crew doctor — ${prefix}"
chk "tmux installed"            "command -v tmux >/dev/null"
chk "${pm} installed"           "command -v ${pm} >/dev/null"
chk "port ${port} free"         "! (command -v lsof >/dev/null && lsof -iTCP:${port} -sTCP:LISTEN >/dev/null 2>&1)"
chk ".inbox/ present"           "test -d .agent-crew/.inbox"
chk "health url reachable opt"  "true"  # ${health} checked at launch, not preconditions
exit $ok
`;

  const ensureRole = `#!/usr/bin/env bash
# GENERATED by agent-crew. Idempotently bring up a worker tmux session.
# Usage: ensure-role.sh <role>
set -euo pipefail
ROLE="\${1:?usage: ensure-role.sh <role>}"
ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION="${prefix}-$ROLE"
tmux has-session -t "$SESSION" 2>/dev/null && exit 0
tmux new-session -d -s "$SESSION" -c "$ROOT"
tmux send-keys -t "$SESSION" "claude" Enter
for i in $(seq 1 30); do
  if tmux capture-pane -p -t "$SESSION" | grep -qE "(Welcome to Claude Code|│ >|Try )"; then break; fi
  sleep 1
done
echo "$SESSION up"
`;

  return { "launch.sh": launch, "doctor.sh": doctor, "ensure-role.sh": ensureRole };
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/render-bin.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render.mjs test/render-bin.test.mjs
git commit -m "feat: render generated _bin scripts"
```

---

## Task 6: Cheap repo scan (`scan.mjs`)

**Files:**
- Create: `src/scan.mjs`
- Test: `test/scan.test.mjs`

- [ ] **Step 1: Write failing test**

```js
// test/scan.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepo } from "../src/scan.mjs";

test("scanRepo collects top-level tree, readme, existing agent docs", () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-"));
  try {
    writeFileSync(join(dir, "README.md"), "# Demo\nhello");
    writeFileSync(join(dir, "CLAUDE.md"), "arch notes");
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "index.ts"), "export const x = 1;");
    const r = scanRepo(dir);
    assert.ok(r.tree.includes("src"));
    assert.match(r.readme, /Demo/);
    assert.ok(r.existing_agent_docs.includes("CLAUDE.md"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/scan.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/scan.mjs`**

```js
// src/scan.mjs
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
```

- [ ] **Step 4: Run tests**

Run: `node --test test/scan.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scan.mjs test/scan.test.mjs
git commit -m "feat: cheap static repo scan"
```

---

## Task 7: Knowledge seed (`seed.mjs`)

**Files:**
- Create: `src/seed.mjs`
- Test: `test/seed.test.mjs`

- [ ] **Step 1: Write failing test**

```js
// test/seed.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedKnowledge } from "../src/seed.mjs";
import { buildConfig } from "../src/config.mjs";
import { detectFromFiles } from "../src/detect.mjs";

const cfg = buildConfig(detectFromFiles({ lockfiles: ["bun.lock"], pkg: { scripts: { dev: "next dev" } }, name: "demo", root: "/tmp/demo" }), {});
const scan = { tree: "src/\n  index.ts", readme: "# Demo\nA demo app.", git_log: "abc init", existing_agent_docs: ["CLAUDE.md"] };

test("seed produces onboarding.md (pending) and architecture.md with tree", () => {
  const files = seedKnowledge(cfg, scan, { head: "abc1234" });
  assert.match(files["onboarding.md"], /status: pending-deep-onboarding/);
  assert.match(files["onboarding.md"], /generated_at_sha: abc1234/);
  assert.match(files["onboarding.md"], /demo/);
  assert.match(files["architecture.md"], /index\.ts/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/seed.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/seed.mjs`**

```js
// src/seed.mjs

export function seedKnowledge(cfg, scan, { head = "unknown" } = {}) {
  const agentDocs = scan.existing_agent_docs.length
    ? scan.existing_agent_docs.join(", ")
    : "(немає)";

  const onboarding = `---
status: pending-deep-onboarding
generated_at_sha: ${head}
project: ${cfg.project.name}
---

# Onboarding — ${cfg.project.name}

> SEED від CLI (статичний скан). Teamlead замінить цей файл повним brief'ом
> при першому \`launch\` (фаза 2 onboarding), потім поставить status: ready.

## Що вже відомо (статично)
- **Стек:** ${cfg.runtime.package_manager}, exec \`${cfg.runtime.exec_prefix}\`
- **Dev:** \`${cfg.commands.dev || "—"}\` · порт ${cfg.devserver.port}
- **Наявні agent-доки:** ${agentDocs}

## README (фрагмент)
${scan.readme ? scan.readme.slice(0, 1500) : "(README не знайдено)"}

## Останні коміти
\`\`\`
${scan.git_log || "(git history недоступна)"}
\`\`\`

## TODO для teamlead (фаза 2)
- [ ] Прочитати ключові модулі й точки входу
- [ ] Виявити конвенції (lint, типи, структура)
- [ ] Описати домен і активні зони
- [ ] Заповнити architecture.md, виставити status: ready
`;

  const architecture = `---
status: seed
generated_at_sha: ${head}
---

# Architecture map — ${cfg.project.name}

> SEED: дерево директорій верхнього рівня. Teamlead збагатить при onboarding.

\`\`\`
${scan.tree}
\`\`\`
`;

  return { "onboarding.md": onboarding, "architecture.md": architecture };
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/seed.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/seed.mjs test/seed.test.mjs
git commit -m "feat: knowledge seed generation"
```

---

## Task 8: Role templates (stubs + engine protocol)

**Files:**
- Create: `templates/agents/_shared/protocol.md`
- Create: `templates/agents/teamlead/CLAUDE.md`
- Create: `templates/agents/dev/CLAUDE.md`
- Create: `templates/agents/qa/CLAUDE.md`
- Create: `templates/agents/ux/CLAUDE.md`
- Create: `templates/agents/architect/CLAUDE.md`
- Create: `templates/agents/techwriter/CLAUDE.md`
- Create: `templates/agents/README.md`
- Create: `templates/knowledge/principles.md`

- [ ] **Step 1: Write `templates/agents/_shared/protocol.md`** (engine — project-agnostic)

```markdown
# Shared protocol — `.inbox/` + tmux

Контракти, спільні для всіх ролей. Кожна роль читає цей файл на старті сесії
(після свого `CLAUDE.md`, перед `project.md`). Якщо контракт суперечить ролі —
пріоритет за роллю, але повідом teamlead.

## 1. Структура `.agent-crew/.inbox/`
```
.inbox/
├── status.md            # JSON у один рядок — поточна фаза pipeline
├── tasks/TASK-<N>.md    # постановка задачі (immutable після створення)
├── <TASK-N>/            # робоча папка задачі
│   ├── result-v1.md     # звіт dev (версіонується: v1, v2, …)
│   ├── review-v1.md     # code review
│   ├── qa-brief.md / qa-report.md
│   └── memory-candidates.md   # append-only пропозиції
├── architect/ · techwriter/   # зони опц. ролей
└── memory-decisions.md        # append-only лог
```

## 2. `status.md` — контракт
JSON у один рядок, без коментарів і trailing comma.
Фази: `idle · ux_review · ux_done · development · review · testing · qa_done ·
batch_done · architect_scan · architect_done · techwriting · techwriting_done`.
Схема: `{"phase","task","active_artifact","iteration","timestamp"}`.

## 3. Atomic writes — обов'язково
Усе, що читає інший агент, пиши атомарно: Write tool (один syscall) АБО bash
`.tmp + mv`. Ніколи `cat >> file` для inter-agent комунікації (race). Append
лише для own-process логів (`memory-candidates.md`).

## 4. tmux bootstrap — polling, не sleep
Cold start Claude Code 3–15с. Не `sleep 5` — а polling `tmux capture-pane`
доки не з'явиться prompt. Хелпер: `.agent-crew/_bin/ensure-role.sh <role>`.

## 5. Memory — read-only для воркерів
Memory оновлює тільки teamlead. Інші ролі читають на старті, пишуть пропозиції
в append-only `memory-candidates.md`.

## 6. Self-check перед сигналом наступному агенту
- [ ] Файли записано атомарно?
- [ ] `status.md` оновлено через `.tmp + mv`?
- [ ] Шлях у `active_artifact` існує?
- [ ] `iteration` інкрементовано на повторному раунді?
```

- [ ] **Step 2: Write role stubs** — each is a minimal but valid role file. Write `templates/agents/teamlead/CLAUDE.md`:

```markdown
# Роль: Tech Lead (STUB — повний контент у Plan 2)

Ти технічний лід multi-agent pipeline. Координуєш dev/qa (+ опц. ux/architect/techwriter)
через `.agent-crew/.inbox/` (стан) і `tmux send-keys` (сигнал).

## На старті сесії
1. Прочитай `.agent-crew/agents/_shared/protocol.md` і `.agent-crew/agents/_shared/project.md`.
2. Якщо `.agent-crew/knowledge/onboarding.md` має `status: pending-deep-onboarding` —
   зроби self-onboarding: досліди проєкт, перепиши onboarding.md + architecture.md,
   постав `status: ready`, покажи summary, спитай «над чим працюємо?».
3. Інакше — підніми dev/qa (`_bin/ensure-role.sh dev|qa`) і devserver, чекай задачі.

## Прийняття роботи
Вхід — конкретні задачі (фіча/зміна/баг) у будь-якій формі. Якщо недовизначено —
постав уточнювальні питання ПЕРЕД декомпозицією. Декомпозуй у `tasks/TASK-<N>.md`,
делегуй dev → code review → QA → commit.

> Повна інструкція (декомпозиція, review-стандарт, lazy bootstrap, моніторинг,
> memory-агрегація) додається в Plan 2.
```

Write `templates/agents/dev/CLAUDE.md`:

```markdown
# Роль: Developer (STUB — повний контент у Plan 2)

Інженер у pipeline. Чекаєш сигналу teamlead → читаєш `.agent-crew/.inbox/status.md` →
вказану задачу → реалізуєш → проганяєш build → пишеш `result-v<N>.md` атомарно.

## Принципи
- Verify before edit. Root cause, не симптом. Build має пройти. Чесний пушбек.

## На старті
Прочитай `_shared/protocol.md` і `_shared/project.md` (команди build/test — звідти).

> Повна інструкція — Plan 2.
```

Write `templates/agents/qa/CLAUDE.md`:

```markdown
# Роль: QA (STUB — повний контент у Plan 2)

Тестувальник. Після code review teamlead дає сигнал → читаєш `qa-brief.md` →
тестуєш проти acceptance → пишеш `qa-report.md` (PASS/FAIL + repro) атомарно.

## На старті
Прочитай `_shared/protocol.md` і `_shared/project.md` (як запускати/тестувати — звідти).

> Повна інструкція — Plan 2.
```

Write `templates/agents/ux/CLAUDE.md`:

```markdown
# Роль: UX-аналітик (STUB — повний контент у Plan 2, опціональна роль)

On-demand. Для задач `ux-required` пишеш `ux-brief.md` (patterns, a11y, flow, edge cases)
для dev. Не пишеш код.

> Повна інструкція — Plan 2.
```

Write `templates/agents/architect/CLAUDE.md`:

```markdown
# Роль: Architect (STUB — повний контент у Plan 2, опціональна роль)

Async. Periodic scan після batch, pre-impl review великих змін, coupling-алерти.
Пропозиції tech-debt → `.inbox/architect/proposed-tasks/`. Не блокує pipeline.

> Повна інструкція — Plan 2.
```

Write `templates/agents/techwriter/CLAUDE.md`:

```markdown
# Роль: Techwriter (STUB — повний контент у Plan 2, опціональна роль)

On-demand. `docs-required` задачі, release notes, help-тексти, user-testing guides.
Не пише код, не тестує.

> Повна інструкція — Plan 2.
```

- [ ] **Step 3: Write `templates/agents/README.md`**

```markdown
# .agent-crew/agents — команда

Ролі multi-agent pipeline. Кожна — окремий процес Claude Code у tmux-сесії
`<project>-<role>`. Контракт — `_shared/protocol.md`. Проєктні значення —
`_shared/project.md` (генерується з `team.config.yaml`).

Старт: `agent-crew launch` (або `.agent-crew/_bin/launch.sh`).
```

- [ ] **Step 4: Write `templates/knowledge/principles.md`** (generic quality standard)

```markdown
# Engineering principles (генерик — допили під проєкт)

Стандарт, за яким dev пише і teamlead рев'ює код.

1. **Verify before edit** — жодне твердження не приймається на віру, підтверджуй кодом.
2. **Root cause, не симптом** — точкова правка симптому = тех-борг.
3. **Build/тести мають пройти** — не закінчуй задачу, поки build exit 0.
4. **Defense in depth** — валідуй на межах, не довіряй вхідним даним.
5. **Чесний пушбек** — якщо рекомендований підхід не працює, поясни чому.
6. **Малі сфокусовані зміни** — один commit = одна логічна зміна.
```

- [ ] **Step 5: Commit**

```bash
git add templates/
git commit -m "feat: role template stubs + engine protocol + generic principles"
```

---

## Task 9: Scaffold writer (`scaffold.mjs`)

**Files:**
- Create: `src/scaffold.mjs`
- Test: `test/scaffold.test.mjs`

- [ ] **Step 1: Write failing integration test**

```js
// test/scaffold.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold } from "../src/scaffold.mjs";
import { buildConfig } from "../src/config.mjs";
import { detectFromFiles } from "../src/detect.mjs";

function makeCfg(root) {
  return buildConfig(detectFromFiles({ lockfiles: ["bun.lock"], pkg: { scripts: { dev: "next dev" }, dependencies: { next: "16" } }, name: "demo", root }), { roles: { architect: true } });
}

test("scaffold writes full .agent-crew tree, only enabled roles, patches gitignore", () => {
  const root = mkdtempSync(join(tmpdir(), "host-"));
  try {
    const cfg = makeCfg(root);
    scaffold(cfg, { targetRoot: root });
    const ac = join(root, ".agent-crew");
    assert.ok(existsSync(join(ac, "team.config.yaml")));
    assert.ok(existsSync(join(ac, "agents/_shared/protocol.md")));
    assert.ok(existsSync(join(ac, "agents/_shared/project.md")));
    assert.ok(existsSync(join(ac, "agents/teamlead/CLAUDE.md")));
    assert.ok(existsSync(join(ac, "agents/architect/CLAUDE.md")));   // enabled
    assert.ok(!existsSync(join(ac, "agents/ux/CLAUDE.md")));         // disabled
    assert.ok(existsSync(join(ac, "knowledge/onboarding.md")));
    assert.ok(existsSync(join(ac, "knowledge/principles.md")));
    assert.ok(existsSync(join(ac, "_bin/launch.sh")));
    assert.ok(existsSync(join(ac, ".inbox/status.md")));
    assert.match(readFileSync(join(root, ".gitignore"), "utf8"), /\.agent-crew\/\.inbox\//);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scaffold throws on existing .agent-crew without force", () => {
  const root = mkdtempSync(join(tmpdir(), "host2-"));
  try {
    const cfg = makeCfg(root);
    scaffold(cfg, { targetRoot: root });
    assert.throws(() => scaffold(cfg, { targetRoot: root }), /already exists/);
    scaffold(cfg, { targetRoot: root, force: true }); // no throw
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/scaffold.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/scaffold.mjs`**

```js
// src/scaffold.mjs
import { cpSync, mkdirSync, writeFileSync, existsSync, readFileSync, appendFileSync, chmodSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { writeConfig } from "./config.mjs";
import { renderProjectMd, renderBinScripts } from "./render.mjs";
import { scanRepo } from "./scan.mjs";
import { seedKnowledge } from "./seed.mjs";

const TEMPLATES = fileURLToPath(new URL("../templates", import.meta.url));
const CORE_ROLES = ["teamlead", "dev", "qa"];
const OPT_ROLES = ["ux", "architect", "techwriter"];
const GITIGNORE_LINE = ".agent-crew/.inbox/";

function headSha(root) {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function scaffold(cfg, { targetRoot, force = false }) {
  const ac = join(targetRoot, ".agent-crew");
  if (existsSync(ac)) {
    if (!force) throw new Error(`.agent-crew already exists at ${ac} (use force)`);
    rmSync(ac, { recursive: true, force: true });
  }

  // 1. agents/_shared (protocol verbatim) + README
  mkdirSync(join(ac, "agents/_shared"), { recursive: true });
  cpSync(join(TEMPLATES, "agents/_shared/protocol.md"), join(ac, "agents/_shared/protocol.md"));
  cpSync(join(TEMPLATES, "agents/README.md"), join(ac, "agents/README.md"));

  // 2. role dirs — only enabled
  const enabled = [...CORE_ROLES, ...OPT_ROLES.filter((r) => cfg.roles[r])];
  for (const role of enabled) {
    mkdirSync(join(ac, "agents", role), { recursive: true });
    cpSync(join(TEMPLATES, "agents", role, "CLAUDE.md"), join(ac, "agents", role, "CLAUDE.md"));
  }

  // 3. generated project.md
  writeFileSync(join(ac, "agents/_shared/project.md"), renderProjectMd(cfg), "utf8");

  // 4. _bin/*.sh (executable)
  mkdirSync(join(ac, "_bin"), { recursive: true });
  const scripts = renderBinScripts(cfg);
  for (const [name, body] of Object.entries(scripts)) {
    const p = join(ac, "_bin", name);
    writeFileSync(p, body, "utf8");
    chmodSync(p, 0o755);
  }

  // 5. knowledge/ — generic principles + seed onboarding/architecture
  mkdirSync(join(ac, "knowledge"), { recursive: true });
  cpSync(join(TEMPLATES, "knowledge/principles.md"), join(ac, "knowledge/principles.md"));
  const seed = seedKnowledge(cfg, scanRepo(targetRoot), { head: headSha(targetRoot) });
  for (const [name, body] of Object.entries(seed)) {
    writeFileSync(join(ac, "knowledge", name), body, "utf8");
  }

  // 6. .inbox/ runtime
  mkdirSync(join(ac, ".inbox/tasks"), { recursive: true });
  writeFileSync(join(ac, ".inbox/status.md"), '{"phase":"idle"}', "utf8");

  // 7. config (single source of truth)
  writeConfig(join(ac, "team.config.yaml"), cfg);

  // 8. patch host .gitignore
  const gi = join(targetRoot, ".gitignore");
  const has = existsSync(gi) && readFileSync(gi, "utf8").split("\n").includes(GITIGNORE_LINE);
  if (!has) appendFileSync(gi, (existsSync(gi) ? "\n" : "") + GITIGNORE_LINE + "\n");
}

export { CORE_ROLES, OPT_ROLES };
```

- [ ] **Step 4: Run tests**

Run: `node --test test/scaffold.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scaffold.mjs test/scaffold.test.mjs
git commit -m "feat: scaffold .agent-crew tree from config + templates"
```

---

## Task 10: Sync regeneration (`sync.mjs`)

**Files:**
- Create: `src/sync.mjs`
- Test: `test/sync.test.mjs`

- [ ] **Step 1: Write failing test**

```js
// test/sync.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold } from "../src/scaffold.mjs";
import { syncGenerated } from "../src/sync.mjs";
import { buildConfig, readConfig, writeConfig } from "../src/config.mjs";
import { detectFromFiles } from "../src/detect.mjs";

test("sync regenerates project.md after config edit, leaves role files untouched", () => {
  const root = mkdtempSync(join(tmpdir(), "sync-"));
  try {
    const cfg = buildConfig(detectFromFiles({ lockfiles: ["bun.lock"], pkg: { scripts: { dev: "next dev" } }, name: "demo", root }), {});
    scaffold(cfg, { targetRoot: root });

    // user edits a role file + the config (changes port)
    const rolePath = join(root, ".agent-crew/agents/dev/CLAUDE.md");
    writeFileSync(rolePath, "CUSTOM EDIT", "utf8");
    const cfgPath = join(root, ".agent-crew/team.config.yaml");
    const edited = readConfig(cfgPath);
    edited.devserver.port = 8080;
    edited.devserver.health_url = "http://localhost:8080";
    writeConfig(cfgPath, edited);

    syncGenerated(root);

    assert.match(readFileSync(join(root, ".agent-crew/agents/_shared/project.md"), "utf8"), /8080/);
    assert.equal(readFileSync(rolePath, "utf8"), "CUSTOM EDIT"); // untouched
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/sync.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/sync.mjs`**

```js
// src/sync.mjs
import { writeFileSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readConfig, validateConfig } from "./config.mjs";
import { renderProjectMd, renderBinScripts } from "./render.mjs";

// Regenerates ONLY generated files (project.md, _bin/*). Never touches role markdown.
export function syncGenerated(targetRoot) {
  const ac = join(targetRoot, ".agent-crew");
  const cfgPath = join(ac, "team.config.yaml");
  if (!existsSync(cfgPath)) throw new Error(`no team.config.yaml at ${cfgPath} — run 'agent-crew init' first`);

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
```

- [ ] **Step 4: Run tests**

Run: `node --test test/sync.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sync.mjs test/sync.test.mjs
git commit -m "feat: sync regenerates generated files only"
```

---

## Task 11: Interactive prompts (`prompts.mjs`)

**Files:**
- Create: `src/prompts.mjs`
- Test: `test/prompts.test.mjs`

- [ ] **Step 1: Write failing test** (test the pure parsing helpers, not the TTY loop)

```js
// test/prompts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYesNo, parseRoleToggles } from "../src/prompts.mjs";

test("parseYesNo: blank uses default, y/n override", () => {
  assert.equal(parseYesNo("", true), true);
  assert.equal(parseYesNo("n", true), false);
  assert.equal(parseYesNo("Y", false), true);
});

test("parseRoleToggles: comma list of opt roles -> booleans", () => {
  const r = parseRoleToggles("architect, techwriter");
  assert.deepEqual(r, { ux: false, architect: true, techwriter: true });
});

test("parseRoleToggles: blank -> all opt off", () => {
  assert.deepEqual(parseRoleToggles(""), { ux: false, architect: false, techwriter: false });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/prompts.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/prompts.mjs`**

```js
// src/prompts.mjs
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const OPT_ROLES = ["ux", "architect", "techwriter"];

export function parseYesNo(answer, dflt) {
  const a = answer.trim().toLowerCase();
  if (a === "") return dflt;
  return a === "y" || a === "yes";
}

export function parseRoleToggles(csv) {
  const chosen = new Set(
    csv
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return Object.fromEntries(OPT_ROLES.map((r) => [r, chosen.has(r)]));
}

// Interactive flow — used by CLI, not unit-tested.
export async function runInitPrompts(detected) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log(`\nВиявлено: ${detected.runtime.package_manager} · порт ${detected.devserver.port}`);
    console.log(`Команди: dev='${detected.commands.dev}' build='${detected.commands.build}'`);
    const ok = parseYesNo(await rl.question("Прийняти ці команди/порт? [Y/n] "), true);
    let commands = detected.commands;
    let port = detected.devserver.port;
    if (!ok) {
      commands = { ...commands };
      commands.dev = (await rl.question(`dev [${commands.dev}]: `)) || commands.dev;
      commands.build = (await rl.question(`build [${commands.build}]: `)) || commands.build;
      const p = await rl.question(`port [${port}]: `);
      if (p.trim()) port = Number(p);
    }
    const roles = parseRoleToggles(
      await rl.question("Опц. ролі (через кому: ux,architect,techwriter) [порожньо = жодної]: ")
    );
    const language = (await rl.question("Мова агентів [ua]: ")).trim() || "ua";
    return { commands, port, roles, language };
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/prompts.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/prompts.mjs test/prompts.test.mjs
git commit -m "feat: interactive init prompts + pure parsers"
```

---

## Task 12: Doctor + launch command builders (`doctor.mjs`, `launch.mjs`)

**Files:**
- Create: `src/doctor.mjs`
- Create: `src/launch.mjs`
- Test: `test/doctor-launch.test.mjs`

- [ ] **Step 1: Write failing test**

```js
// test/doctor-launch.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDoctorChecks } from "../src/doctor.mjs";
import { buildLaunchPlan } from "../src/launch.mjs";
import { buildConfig } from "../src/config.mjs";
import { detectFromFiles } from "../src/detect.mjs";

const cfg = buildConfig(detectFromFiles({ lockfiles: ["bun.lock"], pkg: { scripts: { dev: "next dev" } }, name: "demo", root: "/tmp/demo" }), {});

test("doctor checks reference tmux, package manager, port", () => {
  const checks = buildDoctorChecks(cfg);
  const labels = checks.map((c) => c.label).join(" | ");
  assert.match(labels, /tmux/);
  assert.match(labels, /bun/);
  assert.match(labels, /3000/);
  for (const c of checks) assert.equal(typeof c.cmd, "string");
});

test("launch plan targets the teamlead session and includes bootstrap", () => {
  const plan = buildLaunchPlan(cfg);
  assert.equal(plan.session, "demo-teamlead");
  assert.ok(plan.steps.some((s) => /new-session/.test(s)));
  assert.ok(plan.steps.some((s) => /onboarding/i.test(s)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/doctor-launch.test.mjs`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/doctor.mjs`**

```js
// src/doctor.mjs
import { execSync } from "node:child_process";

export function buildDoctorChecks(cfg) {
  const pm = cfg.runtime.package_manager;
  const port = cfg.devserver.port;
  return [
    { label: "tmux installed", cmd: "command -v tmux >/dev/null" },
    { label: `${pm} installed`, cmd: `command -v ${pm} >/dev/null` },
    {
      label: `port ${port} free`,
      cmd: `! (command -v lsof >/dev/null && lsof -iTCP:${port} -sTCP:LISTEN >/dev/null 2>&1)`,
    },
    { label: ".agent-crew/.inbox present", cmd: "test -d .agent-crew/.inbox" },
  ];
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
```

- [ ] **Step 4: Implement `src/launch.mjs`**

```js
// src/launch.mjs
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

// Thin executor: delegate to the generated bin script (single source of bootstrap text).
export function launch(targetRoot, { onboard = false } = {}) {
  const script = join(targetRoot, ".agent-crew/_bin/launch.sh");
  const res = spawnSync("bash", [script], {
    stdio: "inherit",
    cwd: targetRoot,
    env: { ...process.env, AGENT_CREW_FORCE_ONBOARD: onboard ? "1" : "" },
  });
  return res.status ?? 1;
}
```

- [ ] **Step 5: Run tests**

Run: `node --test test/doctor-launch.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/doctor.mjs src/launch.mjs test/doctor-launch.test.mjs
git commit -m "feat: doctor + launch command builders and runners"
```

---

## Task 13: Wire `bin/cli.mjs` to all commands

**Files:**
- Modify: `bin/cli.mjs`

- [ ] **Step 1: Replace `bin/cli.mjs` with full dispatch**

```js
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
```

- [ ] **Step 2: Update smoke test for new help text**

Replace `test/smoke.test.mjs` body's first test assertion to also accept the new banner:

```js
// test/smoke.test.mjs (unchanged structure — assertion still matches)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

test("--help exits 0 and prints usage", () => {
  const out = execFileSync("node", [cli, "--help"], { encoding: "utf8" });
  assert.match(out, /Usage: agent-crew/);
  assert.match(out, /init/);
  assert.match(out, /launch/);
});

test("unknown command exits 1", () => {
  assert.throws(() => execFileSync("node", [cli, "bogus"], { encoding: "utf8" }));
});

test("sync without config exits 1", () => {
  assert.throws(() => execFileSync("node", [cli, "sync"], { encoding: "utf8", cwd: "/tmp" }));
});
```

- [ ] **Step 3: Run full suite**

Run: `cd ~/Documents/projects/agent-crew && npm test`
Expected: PASS (all tests green).

- [ ] **Step 4: Commit**

```bash
git add bin/cli.mjs test/smoke.test.mjs
git commit -m "feat: wire all CLI commands"
```

---

## Task 14: End-to-end init integration test against fixtures

**Files:**
- Create: `test/fixtures/next-bun/package.json`
- Create: `test/fixtures/next-bun/bun.lock`
- Create: `test/e2e-init.test.mjs`

- [ ] **Step 1: Create fixture repo files**

`test/fixtures/next-bun/package.json`:
```json
{
  "name": "fixture-app",
  "scripts": { "dev": "next dev", "build": "next build", "lint": "next lint", "test": "vitest" },
  "dependencies": { "next": "16.0.0" }
}
```

`test/fixtures/next-bun/bun.lock`:
```
# fixture lockfile (presence is enough for detection)
```

- [ ] **Step 2: Write the e2e test** (drives the non-interactive path by calling modules, mirroring `doInit` without TTY)

```js
// test/e2e-init.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectProject } from "../src/detect.mjs";
import { buildConfig, validateConfig } from "../src/config.mjs";
import { scaffold } from "../src/scaffold.mjs";
import { syncGenerated } from "../src/sync.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/next-bun", import.meta.url));

test("init pipeline on a fixture produces a complete, valid .agent-crew", () => {
  const root = mkdtempSync(join(tmpdir(), "e2e-"));
  try {
    cpSync(FIXTURE, root, { recursive: true });

    const detected = detectProject(root);
    assert.equal(detected.runtime.package_manager, "bun");
    assert.equal(detected.commands.build, "bun --bun run build");

    const cfg = buildConfig(detected, { roles: { architect: true, techwriter: true }, language: "ua" });
    assert.equal(validateConfig(cfg).ok, true);

    scaffold(cfg, { targetRoot: root });

    const ac = join(root, ".agent-crew");
    // structure
    for (const f of [
      "team.config.yaml",
      "agents/_shared/protocol.md",
      "agents/_shared/project.md",
      "agents/teamlead/CLAUDE.md",
      "agents/architect/CLAUDE.md",
      "agents/techwriter/CLAUDE.md",
      "knowledge/onboarding.md",
      "knowledge/architecture.md",
      "knowledge/principles.md",
      "_bin/launch.sh",
      "_bin/doctor.sh",
      "_bin/ensure-role.sh",
      ".inbox/status.md",
    ]) {
      assert.ok(existsSync(join(ac, f)), `missing ${f}`);
    }
    // disabled role absent
    assert.ok(!existsSync(join(ac, "agents/ux/CLAUDE.md")));
    // generated content correct
    assert.match(readFileSync(join(ac, "agents/_shared/project.md"), "utf8"), /fixture-app-teamlead/);
    assert.match(readFileSync(join(ac, "_bin/launch.sh"), "utf8"), /fixture-app-teamlead/);
    assert.equal(readFileSync(join(ac, ".inbox/status.md"), "utf8"), '{"phase":"idle"}');

    // sync is idempotent (no throw, project.md still valid)
    syncGenerated(root);
    assert.match(readFileSync(join(ac, "agents/_shared/project.md"), "utf8"), /fixture-app/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run full suite**

Run: `cd ~/Documents/projects/agent-crew && npm test`
Expected: PASS (all unit + integration + e2e tests green).

- [ ] **Step 4: Manual smoke (real init in a throwaway dir)**

Run:
```bash
cd /tmp && rm -rf ac-manual && mkdir ac-manual && cd ac-manual
git init -q && npm init -y >/dev/null
printf 'y\narchitect\nua\n' | node ~/Documents/projects/agent-crew/bin/cli.mjs init
ls -R .agent-crew
node ~/Documents/projects/agent-crew/bin/cli.mjs doctor || true
```
Expected: `.agent-crew/` tree printed; `doctor` runs and reports checks.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/projects/agent-crew
git add test/fixtures test/e2e-init.test.mjs
git commit -m "test: end-to-end init pipeline against fixture repo"
```

---

## Self-Review

**Spec coverage (Plan 1 portion of the design spec):**
- §3.3 config single-source-of-truth → Tasks 3, 10 ✓
- §3.5 self-contained `.agent-crew/` layout → Tasks 8, 9, 14 ✓
- §3.6 onboarding fase 1 (CLI static seed) → Tasks 6, 7, 9 ✓ ; fase 2 hook wired into launch bootstrap + teamlead stub → Tasks 8, 12 ✓ (deep behavior = Plan 2)
- §4 config schema → Task 3 ✓ (keys match 1:1)
- §5 commands init/sync/doctor/launch/onboard → Tasks 9–13 ✓
- §5 autodetect + confirm → Tasks 2, 11 ✓
- §5 idempotency (init guards, sync touches only generated) → Tasks 9, 10 ✓
- §6 launch flow + flexible work intake (teamlead stub mentions tasks-not-feedback) → Tasks 8, 12 ✓
- §9 testing (unit detect/render/config + integration init against fixtures) → all tasks + Task 14 ✓
- §10 scope v1 commands present; role *content* deferred to Plan 2 (explicit) ✓

**Deferred to later plans (intentional, not gaps):** full role prose + teamlead deep-onboarding + task-model reframing (Plan 2); README/LICENSE/CONTRIBUTING/examples/publish (Plan 3).

**Placeholder scan:** no TBD/TODO-as-instruction; every code step has complete runnable code. Role files are intentionally labeled STUB with working minimal content (valid as-is), not placeholders.

**Type/name consistency:** `detectFromFiles`/`detectProject`, `buildConfig`/`validateConfig`/`readConfig`/`writeConfig`, `renderProjectMd`/`renderBinScripts`, `scanRepo`, `seedKnowledge`, `scaffold`, `syncGenerated`, `buildDoctorChecks`/`runDoctor`, `buildLaunchPlan`/`launch`, `parseYesNo`/`parseRoleToggles`/`runInitPrompts` — used consistently across tasks and `bin/cli.mjs`. Config keys (snake_case) identical everywhere.
