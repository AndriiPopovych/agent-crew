# agent-crew — Design Spec

**Дата:** 2026-06-24
**Статус:** Approved (brainstorming) → next: implementation plan
**Походження:** генерикація multi-agent pipeline з проєкту `sync-matrix` (`agents/`) у переносний open-source інструмент.

---

## 1. Проблема й мета

У проєкті `sync-matrix` є робоча команда з 6 агентів (teamlead, dev, qa, ux, architect, techwriter), кожен — окремий персистентний процес Claude Code у власній tmux-сесії, що координуються через файловий протокол `.inbox/`. Система якісна, але **жорстко прив'язана** до sync-matrix: імена сесій (`sync-matrix-*`), шляхи (`/root/projects/sync-matrix`), стек (`bun --bun`, Supabase, порт 3000), джерела правди (PRD.pdf, feedback-файли, `docs/principles.md`), модель «client feedback batch».

**Мета:** витягти універсальне ядро в окремий продукт `agent-crew` — CLI-скафолдер, який однією командою підключає цю команду до будь-якого проєкту. Публікація на GitHub, open source (MIT).

## 2. Ключові рішення (зафіксовані при брейнстормі)

| Рішення | Вибір | Чому |
|---|---|---|
| Транспорт | **Зберігаємо tmux** (не нативні сабагенти) | Персистентні паралельні агенти з ізольованим контекстом, що живуть годинами — секретний соус системи. Нативні сабагенти ефемерні. |
| Дистрибуція | **CLI-скафолдер** (`npx agent-crew`) | Стандарт для open source, plug-and-play. |
| Склад команди | **Модульно: core + opt** | Core завжди: teamlead, dev, qa. Опціональні (вибір при init): ux, architect, techwriter. |
| Конфігурація | **Автодетект + підтвердження** | Сканує package.json/lockfile/фреймворк, вгадує команди й порт, показує на підтвердження. |
| Нейм | **agent-crew** | npm-пакет + repo + префікс tmux-сесій. |
| Ліцензія | **MIT** | Максимум adoption. |

## 3. Архітектура: три шари

Універсалізація = розщеплення злитого в sync-matrix на три шари.

### 3.1. Движок (project-agnostic, у шаблон майже дослівно)
Це і є цінність, і вона вже універсальна:
- протокол `.inbox/`: `status.md` як стейт-машина, версіоновані артефакти (`result-v1.md`, `result-v2.md`…), atomic writes (`.tmp + mv`)
- tmux bootstrap з polling (не sleep), lazy bootstrap опціональних ролей
- memory-протокол (read-only для воркерів, агрегує лише teamlead)
- proactive monitoring живості сесій / devserver
- структура pipeline: teamlead → [architect] → [ux] → dev → review → qa → commit → [techwriter]

### 3.2. Визначення ролей (шаблони з плейсхолдерами)
6 файлів `CLAUDE.md`. Опис ролі, філософія, цикл review — універсальні й лишаються. Усе sync-matrix-специфічне витягується в конфіг.

### 3.3. Конфіг (єдине джерело правди про проєкт)
Один `team.config.yaml`. З нього генеруються:
- `agents/_shared/project.md` — агенто-читабельний рендер (команди, шляхи, джерела правди, gotchas). Кожна роль читає його на bootstrap **після** `protocol.md`.
- `agents/_bin/*.sh` — реальні shell-хелпери (tmux-сесії, запуск devserver, doctor) з підставленим префіксом і командами.

**Чому конфіг, а не пряма підстановка в кожен CLAUDE.md:** переналаштувати проєкт = редагувати один yaml + `agent-crew sync`, а не правити 6 файлів. Markdown ролей лишається чистим від проєктних деталей → легше підтримувати в open source і апгрейдити шаблони.

## 4. Схема `team.config.yaml`

```yaml
project:
  name: sync-matrix          # → префікс сесій: sync-matrix-teamlead, -dev, …
  root: /root/projects/sync-matrix
  language: ua               # мова спілкування агентів

runtime:
  package_manager: bun       # автодетект з lockfile
  exec_prefix: "bun --bun"   # gotcha-обгортка перед скриптами (опц.)

commands:                    # автодетект зі scripts package.json, з підтвердженням
  dev:   "bun --bun run dev"
  build: "bun --bun run build"
  lint:  "bun --bun run lint"
  test:  "bun --bun run test"
  e2e:   "bun --bun run test:e2e"   # опц.

devserver:
  port: 3000
  health_url: http://localhost:3000

roles:                       # core завжди on; опц. вибираються при init
  teamlead: true
  dev: true
  qa: true
  ux: false
  architect: true
  techwriter: true

sources_of_truth:            # узагальнена таблиця «джерел правди»
  - path: docs/principles.md
    what: методологія + стандарт code review
    how: read повністю на старті
  - path: CLAUDE.md
    what: архітектура, конвенції
    how: read один раз
  - path: docs/qa/**/*.md
    what: минулі QA-звіти
    how: grep перед декомпозицією

quality_standard: docs/principles.md   # «бібла» для review; якщо нема — init кладе генерик-шаблон

memory:
  path: "~/.claude/projects/{slug}/memory/MEMORY.md"   # slug рахується з root

gotchas:                     # вільний список проєктних граблів
  - "Завжди bun --bun, не npm — системний Node=18, Next 16 потребує >=20.9"
```

**Нюанси:**
- `quality_standard` — у sync-matrix code review тримається на `docs/principles.md`. Якщо в проєкті такого нема, `init` кладе якісний дженерик-шаблон інженерних принципів (verify-before-edit, root cause, build exit 0, defense-in-depth), який юзер допилює. Команда має стандарт якості «з коробки».
- `sources_of_truth` — замість захардкоженого PRD.pdf це список. `init` сідить дефолтами (README, CLAUDE.md, docs/), юзер додає своє.
- `language: ua` — код мови, з якого `project.md` бере мову спілкування агентів.

## 5. CLI-скафолдер

**Пакет:** Node.js, ESM, мінімум залежностей (вбудований `readline`, легкий рендерер шаблонів). Публікується в npm → `npx agent-crew`. Шаблони всередині пакета.

| Команда | Що робить |
|---|---|
| `npx agent-crew init` | Автодетект стека → підтвердження команд/порту → вибір опц. ролей і мови → пише `team.config.yaml` → генерує `agents/` (ролі + `_shared/project.md` + `_bin/*.sh`) → скафолдить `.inbox/`, дописує `.gitignore` → друкує інструкцію запуску |
| `agent-crew sync` | Перегенерує згенеровані файли (`project.md`, `_bin/`) з `team.config.yaml`. Після правки конфіга або апгрейду пакета |
| `agent-crew doctor` | Preconditions: tmux/package-manager встановлені, порт вільний, env на місці, `.inbox/` валідний |
| `agent-crew launch` | Обгортка над tmux+claude: піднімає сесію teamlead, polling, вставляє bootstrap-промпт, `tmux attach` |

**Автодетект (init):**
- package manager — з lockfile (`bun.lock`→bun, `pnpm-lock.yaml`→pnpm, `yarn.lock`→yarn, інакше npm)
- команди dev/build/lint/test/e2e — зі `scripts` package.json
- порт/health-url — з фреймворку (next/vite/astro дефолти) або зі скрипта dev
- фолбек: не-Node проєкт (Python/Go/Rust) → мінімальний дженерик, команди вручну

Все вгадане показується на підтвердження. Жодного магічного запису.

**Ідемпотентність:** `init` не перетирає наосліп — якщо `agents/` вже є, питає (overwrite / merge-config / abort). `sync` чіпає лише згенеровані файли, не торкає кастомні правки в `CLAUDE.md` ролей.

## 6. UX роботи з командою (end-to-end)

Разовий setup:
```bash
cd ~/projects/my-app
npx agent-crew init
agent-crew doctor
```

Старт:
```bash
agent-crew launch     # tmux new-session teamlead → claude → polling → bootstrap-промпт → attach
```
Тімлід сам піднімає `my-app-dev`, `my-app-qa`, `my-app-devserver`; ux/architect/techwriter — lazy.

Робочий цикл — користувач спілкується **лише з тімлідом**:
```
Ти: «Обробляй фідбек у NEW_FEEDBACK.md»
  → тімлід: декомпозує → TASK-1..N → dev → code review → QA → commit
  → тімлід: «Batch готовий, звіт у docs/user-testing/<дата>.md»
Ти: тестуєш, пушиш у remote коли підтвердив
```
`launch` НЕ запускає headless-процес — це лише зручний старт tmux+claude. Уся оркестрація — в `CLAUDE.md` тімліда.

## 7. Структура repo

```
agent-crew/
├── README.md              # що це, quickstart, діаграма pipeline, asciinema/GIF
├── LICENSE                # MIT
├── CONTRIBUTING.md
├── package.json           # "bin": { "agent-crew": "bin/cli.mjs" }
├── bin/cli.mjs            # entry: парс команд → init/sync/doctor/launch
├── src/
│   ├── detect.mjs         # автодетект стека
│   ├── prompts.mjs        # інтерактивні питання (readline)
│   ├── render.mjs         # рендер шаблонів з config
│   ├── config.mjs         # читання/валідація team.config.yaml
│   ├── doctor.mjs         # preconditions
│   └── launch.mjs         # tmux + claude bootstrap
├── templates/
│   ├── agents/
│   │   ├── README.md
│   │   ├── _shared/protocol.md          # движок, дослівно-агностичний
│   │   ├── teamlead/CLAUDE.md
│   │   ├── dev/CLAUDE.md
│   │   ├── qa/CLAUDE.md
│   │   ├── ux/CLAUDE.md
│   │   ├── architect/CLAUDE.md
│   │   └── techwriter/CLAUDE.md
│   ├── _shared/project.md.tmpl          # рендериться з config
│   ├── _bin/{launch,doctor,ensure-role}.sh.tmpl
│   ├── principles.md.tmpl               # генерик quality_standard
│   └── team.config.yaml.tmpl
├── docs/
│   ├── how-it-works.md    # архітектура движка (.inbox, tmux, lazy bootstrap)
│   ├── customizing.md     # як правити ролі, додавати свої
│   └── config-reference.md
├── examples/
│   └── sync-matrix/       # реальний worked example (config + опис)
└── test/
```

## 8. Open-source пакування
- **MIT** ліцензія.
- README з діаграмою pipeline + asciinema-записом `init`→`launch` (вручну при публікації).
- `examples/sync-matrix/` — реальний приклад на живому коді.
- CONTRIBUTING з чітким поділом «движок vs ролі vs CLI».

## 9. Тестування
- **Unit:** `detect` (фікстури package.json/lockfile → очікувані команди), `render` (snapshot згенерованих `project.md`/`_bin`), валідація config.
- **Integration:** прогін `init` проти fixture-репо (Next+bun, Vite+pnpm, generic) → assert `agents/` і `team.config.yaml`; `sync` ідемпотентний; `init` не перетирає кастомні правки.
- **Не покривається CI:** живий tmux-прогін потребує реального Claude Code → manual/dogfood на `examples/sync-matrix`. README чесно це зазначає: CI тестує скафолдер, не живих агентів.

## 10. Scope v1 (YAGNI)
- ✅ **В v1:** `init` + `sync` + `doctor` + `launch`; core 3 ролі + 3 опц.; автодетект Node/bun-екосистеми + generic-фолбек; MIT; README; `examples/sync-matrix`; генерик-principles.
- ⏳ **Відкладаємо:** Claude Code plugin-пакування, глибокий автодетект Python/Go/Rust, web-UI, телеметрія, кастомні pipeline-стадії.

## 11. Ризики / найбільша частина роботи
Найбільший обсяг — **не CLI, а акуратна генерикація 6 файлів ролей** (~3500 рядків промптів): вичистити sync-matrix-специфіку, не зламавши логіку. Делікатний рефакторинг, який варто робити з верифікацією (порівнювати поведінку/структуру до/після), а не наосліп.
