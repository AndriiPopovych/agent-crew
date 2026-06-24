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
