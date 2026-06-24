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
