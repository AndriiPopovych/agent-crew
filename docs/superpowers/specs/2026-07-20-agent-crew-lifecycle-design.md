# agent-crew - Lifecycle commands (status / attach / stop / resume) - Design Spec

**Дата:** 2026-07-20
**Статус:** Approved (brainstorming) → next: implementation plan
**Пакет:** 1 з 4 (далі: per-role модель, upgrade, worktrees)

---

## 1. Проблема й мета

Зараз єдина точка взаємодії з запущеною crew - attach у tmux вручну. Щоб зрозуміти,
що відбувається, треба знати назви сесій і читати `.inbox/status.md` очима. Зупинка -
ручне `tmux kill-session` для кожної сесії. Після ребута машини стан у `.inbox/` живий,
але немає способу сказати "продовж з того місця".

**Мета:** чотири lifecycle-команди CLI - `status`, `attach`, `stop`, `resume` - які
закривають щоденний цикл роботи з crew і повністю тестуються в CI (без живого tmux).

## 2. Ключові рішення (зафіксовані при брейнштормі)

| Рішення | Вибір | Чому |
|---|---|---|
| Scope `status` | Сесії + фаза + задача (один екран) | Швидкий погляд; артефакти/історія - YAGNI |
| `stop` при активній задачі | Попередження + підтвердження y/N, `--force` для скриптів | Стан у `.inbox/` зберігається, resume можливий |
| Семантика `resume` | Підняти лише teamlead з resume-промптом | Teamlead сам відновлює воркерів - без дублювання оркестрації в CLI |
| Реалізація | Node CLI (`src/lifecycle.mjs`), без нових `_bin`-скриптів | Чисті функції тестуються в CI; менше згенерованої поверхні для майбутнього `upgrade` |

## 3. Архітектура

Новий модуль `src/lifecycle.mjs` за наявним патерном "чисті build-функції + тонкі
обгортки зі side-effects" (як `doctor.mjs`, `launch.mjs`):

- `parseSessions(prefix, tmuxLsOutput)` - з виводу `tmux ls -F "#{session_name}"`
  виділяє сесії crew: ролі (`<prefix>-<role>`), devserver (`<prefix>-server`),
  інші сесії з тим самим префіксом (кастомні ролі)
- `readPipelineState(inboxDir)` - безпечний парс JSON зі `status.md`;
  розрізняє: файлу нема / валідний JSON / битий вміст
- `buildStatusReport(cfg, sessions, state, { health })` - чистий рендер зведення в текст
- `buildStopPlan(cfg, sessions, state)` - `{ sessions: [...], needsConfirm: bool, reason }`

tmux викликається напряму через `child_process` (`spawnSync`) - префікс і ролі відомі
з `team.config.yaml`. Нових згенерованих скриптів немає, `sync` не змінюється.

## 4. Поведінка команд

### 4.1. `agentcrew status`

Один екран:

- назва проєкту (з config)
- таблиця ролей (лише активні в `roles`): стан сесії - `up` / `down`;
  для опціональних ролей down показується як `не запущена (lazy-роль)` -
  без претензії на історію (ми не відрізняємо "ніколи не стартувала" від "померла")
- devserver: стан сесії `<prefix>-server` + health-пінг `devserver.health_url`
  (таймаут 2с; недоступний → позначка, не помилка)
- pipeline зі `status.md`: фаза, задача, ітерація, час останньої зміни
  (абсолютний + відносний, напр. "14 хв тому")

Працює і без запущеного tmux-сервера: всі сесії `down`, стан pipeline - з файлу.
Exit code 0 (це звіт, не перевірка); нема `.agent-crew/` → повідомлення, exit 1.

### 4.2. `agentcrew attach [role]`

- без аргумента → `teamlead`
- роль вимкнена в config → пояснення + список активних ролей, exit 1
- сесія мертва → підказка: для teamlead - `agentcrew launch`;
  для воркерів - "воркерів піднімає teamlead" , exit 1
- інакше → `tmux attach -t <prefix>-<role>` (stdio inherit)

### 4.3. `agentcrew stop [--force]`

1. Зібрати живі сесії crew (`parseSessions`). Нема живих → "нічого зупиняти", exit 0.
2. Прочитати `status.md`. Якщо фаза не `idle` і не `batch_done` → показати фазу
   і задачу, підтвердження y/N (той самий readline-патерн, що в `prompts.mjs`).
   `--force` пропускає підтвердження. Відмова → exit 0, нічого не зроблено.
3. `tmux kill-session -t <session>` для кожної сесії crew, включно з `server`.
4. Звіт: перелік зупинених. `.inbox/` НЕ чіпається - стан лишається для `resume`.

### 4.4. `agentcrew resume`

- вимагає наявний `.inbox/status.md`; нема → підказка використати `launch`, exit 1
- виконує `_bin/launch.sh` з env `AGENT_CREW_RESUME=1`
  (за зразком наявного `AGENT_CREW_FORCE_ONBOARD`)
- `launch.sh` при `AGENT_CREW_RESUME=1` підставляє альтернативний bootstrap-промпт:
  прочитай роль/протокол/project.md, потім `.inbox/status.md` і артефакти поточної
  TASK; підніми воркерів і devserver; покажи користувачу зведення стану;
  продовж з поточної фази
- teamlead-сесія вже жива → просто attach (наявна логіка `launch.sh` без змін)

## 5. Зміни у файлах

| Файл | Зміна |
|---|---|
| `src/lifecycle.mjs` | NEW - parseSessions, readPipelineState, buildStatusReport, buildStopPlan |
| `test/lifecycle.test.mjs` | NEW - фікстури виводу tmux + зразки status.md |
| `bin/cli.mjs` | команди `status`, `attach`, `stop`, `resume` + help |
| `src/render.mjs` | `launch.sh`: гілка resume-промпту через `AGENT_CREW_RESUME` |
| `templates/agents/teamlead/CLAUDE.md` | короткий generic-розділ "Відновлення після рестарту" |
| `README.md`, `docs/how-it-works.md` | таблиця команд + опис lifecycle |
| `test/render-bin.test.mjs` | покриття resume-гілки launch.sh |

## 6. Обробка помилок

- нема `.agent-crew/` (не той cwd) → зрозуміле повідомлення, exit 1
- нема tmux → наявний `preflightMessage` (launch.mjs), reuse
- `tmux ls` при незапущеному tmux-сервері (exit 1, "no server running") →
  трактується як нуль сесій, не помилка
- битий `status.md` → показати сирий вміст з позначкою "не парситься", не падати
- `attach` зсередини tmux → tmux сам поверне помилку про nested sessions; наш exit code = tmux'ів

## 7. Тестування

Все в CI, без живого tmux (unit + snapshot, `node:test`):

- `parseSessions`: порожній вивід, чужі сесії, повний набір ролей, кастомний префікс
  з дефісами, вивід "no server running"
- `readPipelineState`: нема файлу / валідний JSON / битий JSON
- `buildStatusReport`: snapshot на фікстурах (все up / все down / lazy-ролі / битий стан)
- `buildStopPlan`: idle → без підтвердження; активна фаза → needsConfirm; нема сесій
- `render-bin`: launch.sh містить resume-гілку, обидва промпти; sync ідемпотентний
- guard-тест generic-ності шаблонів проходить без змін (додаток у teamlead - generic)

Не покривається CI (як і раніше): живий tmux-прогін - manual dogfood.

## 8. Scope

- ✅ **В цьому пакеті:** 4 команди; resume-гілка launch.sh; розділ у teamlead;
  docs; тести. Версія 0.2.0 (нові команди - minor bump). Гілка `feat/lifecycle-commands`.
- ⏳ **Не в цьому пакеті:** артефакти/історія задач у status (YAGNI до запиту);
  нотифікації (окрема ідея A3); авто-resume після ребута (launchd/systemd);
  зупинка окремої ролі (`stop <role>`).
