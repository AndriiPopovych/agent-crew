# How agent-crew works

This document explains the engine internals: the `.inbox/` protocol, the tmux session model, the two-phase onboarding sequence, and the memory protocol.

---

## 1. The `.agent-crew/.inbox/` protocol

All inter-agent communication flows through the file system under `.agent-crew/.inbox/`. Agents never talk to each other directly — they read and write files, then send a tmux signal to wake the target role.

### Directory layout

```
.agent-crew/.inbox/
├── status.md                        # Global pipeline state (one JSON line)
├── tasks/
│   └── TASK-<N>.md                  # Task brief (immutable after creation)
├── <TASK-N>/                        # Per-task working folder (created by teamlead)
│   ├── ux-request.md                # (opt.) UX consultation request
│   ├── ux-brief.md                  # (opt.) UX response for dev
│   ├── result-v1.md                 # Dev's first report
│   ├── review-v1.md                 # Code review #1 (if returned)
│   ├── result-v2.md                 # Dev's second report (after review)
│   ├── ...
│   ├── qa-brief.md                  # QA context
│   ├── qa-report.md                 # QA outcome
│   └── memory-candidates.md         # Append-only: dev/QA/UX proposals
├── architect/
│   ├── proposed-tasks/              # Tech-debt drafts for teamlead to schedule
│   ├── review-request.md            # (opt.) Pre-impl review request
│   ├── review-response.md           # (opt.) Architect's response
│   └── memory-candidates.md         # Append-only: architect memory proposals
├── techwriter/
│   ├── doc-request.md               # (opt.) Documentation request
│   ├── doc-report.md                # (opt.) Techwriter's completion report
│   └── memory-candidates.md         # Append-only: techwriter memory proposals
└── memory-decisions.md              # Append-only global log of accepted/rejected candidates
```

`.agent-crew/.inbox/` is gitignored — it is runtime state, not source control.

---

## 2. `status.md` — the state machine

`status.md` holds one JSON line. It is the single source of truth for what the pipeline is doing right now. All agents poll it; no agent sends a signal to another before updating it.

### Schema

```json
{
  "phase": "<phase>",
  "task": ".agent-crew/.inbox/tasks/TASK-<N>.md",
  "active_artifact": ".agent-crew/.inbox/TASK-<N>/result-v<X>.md",
  "iteration": 1,
  "timestamp": "<ISO-8601>"
}
```

`iteration` starts at 1 and increments on every review-return cycle.

### Phases

| Phase | Written by | Meaning |
|---|---|---|
| `idle` | teamlead | Pipeline free, waiting for next task |
| `ux_review` | teamlead | Delegated to UX (only for `ux-required` tasks) |
| `ux_done` | UX | UX wrote `ux-brief.md`; ready for development |
| `development` | teamlead | Delegated to dev |
| `review` | dev | Dev wrote `result-vN.md`; waiting for code review |
| `testing` | teamlead | Review passed; QA brief ready |
| `qa_done` | QA | QA wrote `qa-report.md` |
| `batch_done` | teamlead | Entire current batch processed |
| `architect_scan` | teamlead | Delegated to architect (periodic scan or pre-impl review) |
| `architect_done` | architect | Architect finished scan/review |
| `techwriting` | teamlead | Delegated to techwriter |
| `techwriting_done` | techwriter | Techwriter finished and wrote doc-report |

### Atomic writes

**No agent ever writes `status.md` directly with `>`**. Every write must go through a temp file + atomic rename:

```bash
echo '{"phase":"review","task":"...","active_artifact":"...","iteration":1,"timestamp":"2026-05-17T10:32:00Z"}' \
  > .agent-crew/.inbox/status.md.tmp && \
  mv .agent-crew/.inbox/status.md.tmp .agent-crew/.inbox/status.md
```

POSIX guarantees that `mv` within the same filesystem is atomic — another agent will never read a half-written `status.md`.

The same rule applies to every file another agent will read: `result-vN.md`, `review-vN.md`, `qa-brief.md`, `qa-report.md`, `doc-request.md`, `doc-report.md`. The only exception is append-only single-writer logs (`memory-candidates.md`, `memory-decisions.md`) where `>>` is safe because only one agent ever writes to each file.

---

## 3. Versioned artifacts: `result-vN` / `review-vN`

Each review cycle produces a new numbered file rather than overwriting the previous one:

- `result-v1.md` — dev's first submission
- `review-v1.md` — teamlead's first code review (if returned)
- `result-v2.md` — dev's fix after review #1
- `review-v2.md` — teamlead's second review (if returned again)
- ...

**Why?** Overwriting a single `result.md` on each cycle erases the history of what changed between iterations, making it impossible to see whether a review note was actually addressed. With numbered files, every iteration is immutable and auditable. `status.md` tracks the current `active_artifact` path so agents always know which version is live.

---

## 4. The tmux session model

Each role runs as a separate Claude Code process in its own named tmux session. The session naming convention is `<project.name>-<role>`, e.g. `myapp-teamlead`, `myapp-dev`, `myapp-qa`.

| Session | Role | When active |
|---|---|---|
| `<prefix>-teamlead` | Orchestrator | Always (this is the entry point) |
| `<prefix>-dev` | Developer | Every task |
| `<prefix>-qa` | QA | After each review pass |
| `<prefix>-ux` | UX analyst | On-demand: `ux-required` tasks only |
| `<prefix>-architect` | Architect | Async: periodic scan after batch; pre-impl review for large changes |
| `<prefix>-techwriter` | Tech writer | On-demand: `docs-required` tasks or complex batches |
| `<prefix>-server` | Dev server (shell, not Claude) | While QA is active |

The session prefix comes from `project.name` in `team.config.yaml`, which flows into `_shared/project.md` at init/sync time.

### Bootstrap polling

Claude Code takes 3–15 seconds to start depending on cache. A fixed `sleep` is brittle. Instead, the generated `_bin/launch.sh` and `_bin/ensure-role.sh` poll the tmux pane for Claude Code's ready markers before sending any prompt:

```bash
for i in $(seq 1 30); do
  if tmux capture-pane -p -t "$SESSION" | grep -qE "(Welcome to Claude Code|│ >|Try )"; then
    break
  fi
  sleep 1
done
# only now send the bootstrap prompt
```

If the marker never appears within 30 seconds, something is wrong — inspect with `tmux capture-pane -p -t <session> | tail -20`.

### Lazy bootstrap of optional roles

UX, architect, and techwriter are **not started at init time**. Teamlead boots them on-demand via `ensure_ux`, `ensure_architect`, and `ensure_techwriter` helpers (defined in the teamlead `CLAUDE.md`) — only when the first task tagged `ux-required`, `architect-review`, or `docs-required` arrives. This avoids idle Claude Code processes consuming resources and context.

Core roles (teamlead, dev, QA) are started eagerly after onboarding completes.

---

## 5. Two-phase onboarding

### Phase 1 — CLI static seed (at `agentcrew init`)

When you run `agentcrew init`, the CLI:

1. Detects the project (package manager, framework, scripts) via `src/detect.mjs`.
2. Prompts for confirmation / overrides via `src/prompts.mjs`.
3. Builds the full config via `buildConfig()` in `src/config.mjs`.
4. Calls `scaffold()` in `src/scaffold.mjs` which:
   - Copies `templates/agents/_shared/protocol.md` verbatim into `.agent-crew/agents/_shared/`.
   - Copies each enabled role's `CLAUDE.md` from `templates/agents/<role>/`.
   - Generates `_shared/project.md` from config via `renderProjectMd()`.
   - Generates `_bin/launch.sh`, `_bin/doctor.sh`, `_bin/ensure-role.sh` via `renderBinScripts()`.
   - Copies `templates/knowledge/principles.md` as the generic quality standard.
   - Seeds `knowledge/onboarding.md` with `status: pending-deep-onboarding` via `seedKnowledge()`.
   - Creates `.inbox/` with `status.md` set to `{"phase":"idle"}`.
   - Writes `team.config.yaml` as the single source of truth.
   - Adds `.agent-crew/.inbox/` to `.gitignore`.

This phase is fast and fully automated. It produces a correct scaffold but shallow project knowledge.

### Phase 2 — Teamlead deep self-onboarding (at first `agentcrew launch`)

On first launch, the generated `launch.sh` sends a bootstrap prompt that instructs the teamlead agent to check `knowledge/onboarding.md`. Because `status` is `pending-deep-onboarding`, teamlead:

1. Explores the repository: entry points, modules, config files.
2. Detects conventions: lint, type config, test framework, naming patterns.
3. Reads existing docs (`README.md`, `CLAUDE.md`, `docs/`).
4. Reviews git history (`git log --oneline -50`) to identify active zones and risks.
5. Writes `knowledge/onboarding.md` (with `status: ready`) and `knowledge/architecture.md`.
6. Shows the user a 3–5 line summary and asks: "What are we working on?"

On subsequent launches (when `onboarding.md` already has `status: ready`), teamlead skips the exploration and goes straight to starting dev/QA and the dev server.

---

## 6. Memory protocol

Memory is stored at the path defined by `memory.path` in `team.config.yaml` (default: `~/.claude/projects/<slug>/memory/MEMORY.md`).

**Teamlead is the only agent that writes to memory.** All other roles (dev, QA, UX, architect, techwriter) read memory at session start but never write to it directly. Instead they append proposals to their role's `memory-candidates.md` file inside `.agent-crew/.inbox/`:

- Dev / QA / UX append to `.agent-crew/.inbox/<TASK-N>/memory-candidates.md`
- Architect appends to `.agent-crew/.inbox/architect/memory-candidates.md`
- Techwriter appends to `.agent-crew/.inbox/techwriter/memory-candidates.md`

After QA completes each task, teamlead reviews the candidates and records each decision in `.agent-crew/.inbox/memory-decisions.md` (append-only global log):

```markdown
## TASK-7 candidate #1 — accepted
**From:** dev
**Finding:** "..."
**Decision:** accepted, written to <memory file>
**Date:** 2026-05-17
```

This keeps memory curated (only teamlead decides what persists) while letting every role contribute findings.
