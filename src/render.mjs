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
