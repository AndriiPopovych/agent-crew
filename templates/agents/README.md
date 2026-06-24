# .agent-crew/agents — команда

Ролі multi-agent pipeline. Кожна — окремий процес Claude Code у tmux-сесії
`<project>-<role>`. Контракт — `_shared/protocol.md`. Проєктні значення —
`_shared/project.md` (генерується з `team.config.yaml`).

Старт: `agentcrew launch` (або `.agent-crew/_bin/launch.sh`).
