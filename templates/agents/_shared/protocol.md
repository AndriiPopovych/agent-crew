# Shared protocol — `.agent-crew/.inbox/` + tmux

Цей файл описує контракти, які діляться між teamlead, dev, QA, UX, architect і techwriter. Кожна роль читає його на старті сесії (після свого `CLAUDE.md`, перед `project.md`). Якщо контракт у цьому файлі суперечить ролі — пріоритет за роллю, але повідом teamlead'а.

---

## 1. Структура `.agent-crew/.inbox/`

```
.agent-crew/.inbox/
├── status.md                    # Поточна фаза pipeline (один файл, JSON)
├── tasks/
│   └── TASK-<N>.md              # Постановка задачі (immutable після створення)
├── <TASK-N>/                    # Робоча папка задачі (створює teamlead при делегуванні)
│   ├── ux-request.md            # (опц.) Запит від teamlead до UX, якщо задача ux-required
│   ├── ux-brief.md              # (опц.) Brief від UX для dev (a11y, patterns, flow)
│   ├── result-v1.md             # Перший звіт dev
│   ├── review-v1.md             # Code review #1 (якщо повернули)
│   ├── result-v2.md             # Другий звіт dev (після review)
│   ├── ...
│   ├── qa-brief.md              # Контекст для QA
│   ├── qa-report.md             # Звіт QA
│   └── memory-candidates.md     # Append-only: пропозиції від dev/QA/UX
├── architect/                   # Зона architect-агента
│   ├── proposed-tasks/          # Tech-debt task drafts (teamlead schedule's у tasks/)
│   ├── review-request.md        # (опц.) Запит на pre-impl review
│   ├── review-response.md       # (опц.) Відповідь architect
│   └── memory-candidates.md     # Append-only: memory пропозиції від architect
├── techwriter/                  # Зона techwriter-агента
│   ├── doc-request.md           # (опц.) Запит від teamlead на документацію
│   ├── doc-report.md            # (опц.) Звіт techwriter про написані/оновлені docs
│   └── memory-candidates.md     # Append-only: memory пропозиції від techwriter
├── memory-decisions.md          # Append-only log: які memory candidates прийняті/відхилені
```

**Чому версіонування?** Один файл `result.md` перезаписувався при кожному review-циклі — губилася історія, неможливо було побачити «що саме змінили після review #1». Тепер `result-v1.md` immutable, `result-v2.md` — після першого review, тощо.

**Файли поза `<TASK-N>/`:**
- `status.md` — глобальний state pipeline (одна задача in-flight за замовчуванням, див. teamlead §4.1 для паралелізму)
- `memory-decisions.md` — глобальний append-only лог
- `tasks/TASK-<N>.md` — постановка, не змінюється після створення

---

## 2. `status.md` — контракт

JSON у одному рядку. Жодних коментарів, жодних trailing comma — інакше parse може зламатися.

### Дозволені фази

| Phase | Хто пише | Що означає |
|---|---|---|
| `idle` | teamlead | Pipeline вільний, очікує наступну задачу |
| `ux_review` | teamlead | Делеговано UX (тільки для `ux-required` задач) |
| `ux_done` | UX | UX написав `ux-brief.md`, можна переходити до development |
| `development` | teamlead | Делеговано dev, він пише код |
| `review` | dev | Dev написав `result-vN.md`, чекає code review |
| `testing` | teamlead | Code review пройшов, QA брифінг готовий |
| `qa_done` | QA | QA написав `qa-report.md` |
| `batch_done` | teamlead | Весь поточний batch оброблено |
| `architect_scan` | teamlead | Делеговано architect (periodic scan після batch) |
| `architect_done` | architect | Architect завершив scan/review |
| `techwriting` | teamlead | Делеговано techwriter (docs / release notes) |
| `techwriting_done` | techwriter | Techwriter завершив документацію і написав doc-report |

### Схема

```json
{
  "phase": "<phase>",
  "task": ".agent-crew/.inbox/tasks/TASK-<N>.md",
  "active_artifact": ".agent-crew/.inbox/TASK-<N>/result-v<X>.md",
  "iteration": <N>,
  "timestamp": "<ISO-8601>"
}
```

`iteration` починається з 1 і інкрементується при кожному поверненні після review.

### Atomic write

**Жоден агент не пише у `status.md` напряму через `>`.** Завжди через temp + rename:

```bash
echo '{"phase":"review","task":"...","active_artifact":"...","iteration":1,"timestamp":"2026-05-17T10:32:00Z"}' \
  > .agent-crew/.inbox/status.md.tmp && mv .agent-crew/.inbox/status.md.tmp .agent-crew/.inbox/status.md
```

POSIX гарантує атомарність `mv` у межах однієї FS — інший агент ніколи не побачить пів-записаний `status.md`.

---

## 3. Atomic writes — обов'язковий патерн

**Все що інший агент читатиме — пиши атомарно.** Це стосується:

- `.agent-crew/.inbox/status.md`
- `.agent-crew/.inbox/<TASK-N>/result-v<N>.md`
- `.agent-crew/.inbox/<TASK-N>/review-v<N>.md`
- `.agent-crew/.inbox/<TASK-N>/qa-brief.md`
- `.agent-crew/.inbox/<TASK-N>/qa-report.md`
- `.agent-crew/.inbox/techwriter/doc-request.md`
- `.agent-crew/.inbox/techwriter/doc-report.md`

### Patterns

**Через Write tool (Claude Code):** пиши одразу у фінальний шлях. Write tool створює файл одним системним викликом — інший процес або бачить старий вміст, або новий, не пів-записаний. Це безпечно для одиничних writes.

**Через bash (`echo`, `cat`, heredoc):** ОБОВ'ЯЗКОВО через `.tmp + mv`:

```bash
cat > .agent-crew/.inbox/TASK-7/result-v2.md.tmp <<'EOF'
# Result — TASK-7 (iteration 2)
...
EOF
mv .agent-crew/.inbox/TASK-7/result-v2.md.tmp .agent-crew/.inbox/TASK-7/result-v2.md
```

**Жодного `cat >> file`** для inter-agent комунікації (race на append). Append дозволено тільки для **own-process логів** (`memory-candidates.md`, `memory-decisions.md`) — один писач.

---

## 4. tmux bootstrap — polling, не sleep

Cold start Claude Code займає 3–15 сек залежно від cache. `sleep 5` ламається коли довше.

### Pattern для нової tmux-сесії з Claude Code

```bash
# Завантажити роль через хелпер (встановлює правильний cwd і environment)
.agent-crew/_bin/ensure-role.sh dev

# Або вручну:
tmux new-session -d -s <project>-dev -c <project-root>
tmux send-keys -t <project>-dev "claude" Enter

# Polling: чекаємо доки Claude Code не виведе свій prompt
for i in $(seq 1 30); do
  if tmux capture-pane -p -t <project>-dev | grep -qE "(Welcome to Claude Code|│ >|Try ")"; then
    break
  fi
  sleep 1
done

# Тільки тепер шлемо bootstrap-промпт
tmux send-keys -t <project>-dev 'Read agents/dev/CLAUDE.md and agents/_shared/protocol.md...' Enter
```

Якщо за 30 секунд prompt не з'явився — щось не так (`tmux capture-pane -p -t <session> | tail -20` подивитись що там).

### Pattern для bash-сесії (фоновий процес)

```bash
tmux new-session -d -s <project>-server -c <project-root>
tmux send-keys -t <project>-server "<start-command> 2>&1 | tee /tmp/server.log" Enter

# Polling: чекаємо готовності сервісу, а не фіксований sleep
for i in $(seq 1 30); do
  curl -sf -o /dev/null http://localhost:<port> && break
  sleep 2
done
```

Хелпер `.agent-crew/_bin/ensure-role.sh <role>` інкапсулює bootstrap конкретної ролі — дивись його код для деталей.

---

## 5. Lifecycle вхідного запиту

Вхідний запит — це **конкретна задача або прохання** у будь-якому вигляді: текст у чаті, посилання на issue, шлях до файлу, TODO-пункт. Teamlead не вгадує що саме виконувати — якщо вхід є файлом, user вказує шлях явно; інакше задача передається безпосередньо у промпті.

**Правила:**
- Teamlead **не перейменовує** і **не видаляє** вхідний артефакт (якщо він є). Він лишається як артефакт.
- Teamlead **не вгадує** що є поточним запитом. Якщо user не вказав — питай: «Яку задачу обробляємо?».
- Після делегування dev/QA/architect — вхідний артефакт лишається у `tasks/TASK-<N>.md` (immutable). Оригінальний файл-запит (якщо був) лишається там де user його поклав.

---

## 6. Memory — read-only для dev / QA / UX / architect

Memory оновлює **тільки teamlead**. Інші ролі читають на старті сесії, але пишуть пропозиції в append-only файли:
- Dev / QA / UX → `.agent-crew/.inbox/<TASK-N>/memory-candidates.md`
- Architect → `.agent-crew/.inbox/architect/memory-candidates.md` (бо architect не привʼязаний до конкретного TASK-N)
- Techwriter → `.agent-crew/.inbox/techwriter/memory-candidates.md` (бо docs-знахідки часто batch-level, не task-level)

Teamlead агрегує через `memory-decisions.md` (div. teamlead §9).

Шлях до memory вказано в `_shared/project.md` (`memory.path`) — не хардкодь його тут.

---

## 7. Швидкий self-check перед сигналом наступному агенту

Перед `tmux send-keys` на іншу сесію:

- [ ] Файли results/reviews/briefs/doc-reports записано атомарно (через Write tool або `.tmp + mv`)?
- [ ] `status.md` оновлено через `.tmp + mv`?
- [ ] Шлях у `status.md.active_artifact` існує? (`test -f` перевіряє)
- [ ] `iteration` інкрементовано якщо це повторний раунд?

Якщо хоч одне «ні» — не сигналь. Інший агент прочитає inconsistent state.
