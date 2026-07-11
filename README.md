# agent-crew

Drop a proven multi-agent Claude Code crew into any repo with one command.

![npm](https://img.shields.io/npm/v/@adnrii/agentcrew)
![license](https://img.shields.io/npm/l/@adnrii/agentcrew)

> npm package: `@adnrii/agentcrew` — installs the `agentcrew` command (the brand/repo is `agent-crew`)

---

## What it is

`agent-crew` scaffolds a **6-role, tmux-based Claude Code crew** into any repository. Each role is a persistent Claude Code process running in its own tmux session:

| Role | Always on | Responsibility |
|---|---|---|
| **teamlead** | yes | Requirements elicitation, task decomposition, orchestration, memory |
| **dev** | yes | Implementation, code changes |
| **qa** | yes | Functional testing, QA reports |
| **architect** | optional | Architecture review, tech-debt scanning |
| **ux** | optional | UX briefs, accessibility, interaction patterns |
| **techwriter** | optional | Documentation, release notes |

Roles coordinate through a `.agent-crew/.inbox/` **file protocol**: a `status.md` state machine, versioned artifacts (`result-v1.md`, `result-v2.md`, ...), and atomic writes via POSIX `mv`. No message broker, no daemon -- just files and tmux.

Extracted and generalized from a real production project ([sync-matrix](examples/sync-matrix/)), where this crew has been running in production.

---

## Why tmux and not native subagents

Native Claude Code subagents are ephemeral -- they spin up, do one thing, and exit. `agent-crew` runs **persistent, parallel agents with isolated context windows** that live for hours. Each agent accumulates context about its role across the full session. The teamlead keeps a persistent memory (`knowledge/`) across relaunches. This is the core value -- tmux is not an implementation detail, it is the architecture.

---

## Quickstart

To get started run these commands in your project directory:

    npm i -g @adnrii/agentcrew   # install the agentcrew command
    cd your-project
    agentcrew init          # autodetect stack, confirm commands/port, scaffold .agent-crew/
    agentcrew doctor        # check tmux, package manager, port
    agentcrew launch        # start the teamlead; it self-onboards on first run

Then talk only to the teamlead. Give it a task in plain language. It clarifies any ambiguities, decomposes the work, and delegates through the pipeline: dev -> code review -> QA -> commit. You get a report when it is done; push to remote when you have confirmed.

---

## Commands

| Command | What it does |
|---|---|
| `init` | Scan repo, scaffold `.agent-crew/` into the current project |
| `launch` | Start the teamlead tmux session (self-onboards on first run) |
| `onboard` | Run/refresh the deep project onboarding |
| `sync` | Regenerate generated files from `team.config.yaml` |
| `doctor` | Check preconditions (tmux, package manager, port, env) |

---

## How it works

The crew is split into three layers:

**1. Engine protocol** (`templates/agents/_shared/protocol.md`) -- project-agnostic. Defines the `.inbox/` file contract, `status.md` state machine, atomic write rules, tmux bootstrap pattern (polling, not `sleep`), and memory protocol. Shared by all roles; copied verbatim into `.agent-crew/`.

**2. Role definitions** (`templates/agents/<role>/CLAUDE.md`) -- the behavioral spec for each role. Describes philosophy, responsibilities, the review cycle, and escalation paths. Kept clean of any project-specific detail.

**3. `team.config.yaml`** -- single source of truth about *your* project. The CLI generates two things from it: `agents/_shared/project.md` (what every agent reads at bootstrap -- stack, commands, paths, gotchas, language) and `_bin/*.sh` (the launch/doctor/ensure-role scripts with your actual session prefix and commands).

To reconfigure a project: edit `team.config.yaml`, run `agentcrew sync`. Role `CLAUDE.md` files stay clean.

**Pipeline:**

    teamlead -> [architect] -> [ux] -> dev -> review -> qa -> commit -> [techwriter]

Bracketed roles are optional and lazy -- the teamlead boots them on demand, only when a task needs them.

---

## What lands in your repo

`init` creates a single self-contained directory:

    .agent-crew/
    team.config.yaml              # single source of truth (CLI generates, you edit)
    agents/
      _shared/
        protocol.md               # engine -- copied verbatim, project-agnostic
        project.md                # GENERATED from config (commands, paths, gotchas, language)
      teamlead/CLAUDE.md
      dev/CLAUDE.md
      qa/CLAUDE.md
      {ux,architect,techwriter}/CLAUDE.md   # only selected optional roles
    knowledge/                    # structured project knowledge (onboarding output)
      onboarding.md               # brief: domain, architecture, conventions, active zones
      architecture.md             # module map, entry points, key paths
    _bin/                         # GENERATED: launch.sh, doctor.sh, ensure-role.sh
    .inbox/                       # runtime state -- gitignored automatically

`.inbox/` is added to `.gitignore` by `init`. The rest of `.agent-crew/` is yours to commit, review, and edit. Delete the whole directory with `rm -rf .agent-crew` to remove the crew entirely.

---

## Onboarding

`init` runs a **static seed** (no LLM): it scans the file tree, `package.json`/lockfile, `git log`, README, and any existing `CLAUDE.md`/`AGENTS.md`, then writes `agents/_shared/project.md` and a default `sources_of_truth` list. No hardcoded assumptions -- everything comes from what is actually in the repo.

On the first `launch`, the teamlead runs a **deep self-onboarding** before accepting any task: it reads key modules, entry points, tests, and conventions, then writes `knowledge/onboarding.md` and `knowledge/architecture.md`. It shows you a summary of what it understands about your project (stack, architecture, active zones, risks) and asks what to work on.

This is a one-time step. The onboarding files are committed and reused across sessions. If the codebase drifts significantly, run `agentcrew onboard --refresh` to regenerate.

---

## Requirements

- Node >= 20
- tmux (https://github.com/tmux/tmux)
- Claude Code CLI (`claude` on PATH)
- git
- **gstack** (optional, recommended) — QA uses gstack's `/qa-only` skill by default; `init` offers to install it if not found. Configurable via the `qa_command` field in `team.config.yaml`.

---

## Limitations

CI tests the scaffolder -- `detect`, `render`, `config` validation, and `sync` idempotency against fixture repos. It does **not** test live agents: those require a real Claude Code session and tmux, which CI cannot provide. Manual dogfooding on `examples/sync-matrix/` covers that path.

`init` is interactive. It shows detected values (package manager, commands, port) and asks for confirmation before writing anything.

---

## Docs

- `docs/how-it-works.md` -- engine architecture: `.inbox/`, tmux, lazy bootstrap, atomic writes
- `docs/config-reference.md` -- full `team.config.yaml` schema
- `docs/customizing.md` -- editing role definitions, adding custom roles
- `CONTRIBUTING.md` -- engine vs roles vs CLI separation, test conventions
- `examples/sync-matrix/` -- a real worked example with config and walkthrough

---

## License

MIT -- see LICENSE.
