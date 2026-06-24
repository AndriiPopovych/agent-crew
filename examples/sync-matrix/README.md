# sync-matrix — worked example

`agent-crew` was extracted and generalized from **sync-matrix**, a real combat-operations planning app built on React 19 / Next.js / Supabase with a Ukrainian UI. This directory preserves the representative `team.config.yaml` that drove the original crew.

## What this shows

| Key | Value | Why it matters |
|-----|-------|----------------|
| `runtime.exec_prefix` | `bun --bun` | System Node is 18; the framework needs ≥20.9 — the flag forces Bun's own runtime |
| `roles` | all six `true` | Full crew: teamlead + dev + qa + ux + architect + techwriter |
| `sources_of_truth` | 3 entries | Shows glob patterns and bilingual `what`/`how` descriptions |
| `quality_standard` | `docs/principles.md` | Project-specific review standard overrides the generic fallback |
| `gotchas` | 3 entries | Project-specific traps agents must know before touching code |

## Important

**The values here (Supabase, Next.js, `bun --bun`) are illustrative — specific to sync-matrix.**

When you run `agent-crew init` in your own repository, the tool autodetects your stack (lockfile → package manager, `package.json` scripts → commands, framework → dev-server port). You do not copy or adapt this file — you get a freshly generated `team.config.yaml` tuned to your project.

See [`docs/config-reference.md`](../../docs/config-reference.md) for the full schema.
