# Процесс работы

Снят с процесса IT Algo Desktop 2026-11-03 и положен локально. Продукт здесь — wiki, не терминал и не брокеры. Скиллы лежат в `.cursor/skills/`. Открывай `SKILL.md` и выполняй его. Имя пачки ниже — папка.

Правило, которое висит на каждом шаге: `.cursor/rules/delivery-workflow.mdc`.

## Шаги

0. **Найти фичу.** Искать по названию и синонимам в `docs/work/BACKLOG.md`, `docs/work/FEATURE_BEHAVIOR.md`, `docs/work/**`, `docs/research/**`. Готово: названа существующая фича со ссылкой на строку бэклога — или перечислено, где искал, и сказано, что её нет.
1. **Масштаб.** А — только документы, один агент. Б — баг или правка без нового продуктового решения. В — поведение меняется, дальше шаги 2–8. Готово: в бэклоге есть строка.
2. **Требования.** Скилл `mattpocock/grill-with-docs`. Короткий вопрос без новых документов — `mattpocock/grilling`. Каждое решение владельца — строка бэклога в этом же шаге. Новый термин — в `CONTEXT.md`. Вопрос владельцу: что сейчас, варианты с примером, рекомендация. Готово: дерево решений пусто, владелец подтвердил итог, есть ответ «меняется ли экран».
3. **Макет**, если экран меняется. Скиллы `design/design-system`, `design/design-critique`, `design/ux-copy`, `design/accessibility-review`. Макет в Figma — `figma/figma-use` до любого вызова Figma, дальше скилл под задачу (`figma/figma-generate-design`, `figma/figma-design-to-code`). Готово: владелец согласовал макет, каждый элемент сопоставлен существующему компоненту или помечен как новый.
4. **Документы до кода.** SA — `mattpocock/to-spec` по `docs/templates/FEATURE_SA_SPEC_TEMPLATE.md` в `docs/work/`. План — `mattpocock/to-tickets` в `docs/superpowers/plans/`. Готово: владелец поставил SA статус **Согласовано**.
5. **Реализация.** Субагент на шаг плана со скиллом `mattpocock/implement`. Крупный модуль — `arxitect/architect`, затем ревью `arxitect/oo-design-review`, `arxitect/clean-architecture-review`, `arxitect/api-design-review`. Шаг идёт так: красный тест, минимальный код, зелёный тест. Скиллы сервера из таблицы ниже называются в промпте субагента до первой строки кода. Готово: шаги плана сделаны, тесты шага зелёные.
6. **Тесты.** Юнит на каждое FR. Для критичной логики каждой фичи обязательна мутационная проверка: целенаправленно сломать ветвления, границы и побочные эффекты, убедиться, что тесты ловят каждую мутацию, затем восстановить код и повторить полный прогон. Выжившая мутация — пробел теста, а не примечание. Проверить реальный пользовательский сценарий в браузере; только юнитов и красно-зелёного цикла недостаточно. Совместная правка, поиск по большому дереву, много одновременных сессий — отдельный прогон, когда фича это трогает. Расчёт, который можно сверить с эталоном, — на одном и том же наборе до и после. Готово: каждое FR закрыто тестом или пунктом ручной проверки, мутации критичной логики убиты, исходный код восстановлен.
7. **QA.** Другой агент, скилл `qa-bug-hunter`. Сверяет экран с макетом и FR из SA. Список расхождений пустой — шаг готов. Повтор после каждого исправления. Diff с ключами, доступом или внешними вызовами — дополнительно пройти `backend-design/security-discipline`.
8. **Документы после.** Статус SA, бэклог, `FEATURE_BEHAVIOR.md`, если изменился жест. Готово: бэклог совпадает с тем, что сделано.

Баг из бэклога идёт путём Б: `mattpocock/tdd`, красный тест по названной причине, потом фикс. Баг без воспроизведения — сначала `mattpocock/diagnosing-bugs`.

Коммит, push и tag — по явной просьбе владельца.

## Какой скилл когда

Путь к файлу: `.cursor/skills/<пачка>/<имя>/SKILL.md`. У `qa-bug-hunter` файл лежит прямо в папке пачки.

| Когда | Скилл |
|---|---|
| Новое продуктовое решение | `mattpocock/grill-with-docs` |
| Короткий вопрос владельцу | `mattpocock/grilling` |
| SA после grilling | `mattpocock/to-spec` |
| План шагов | `mattpocock/to-tickets` |
| Баг из бэклога | `mattpocock/tdd` |
| Баг без воспроизведения, просадка скорости | `mattpocock/diagnosing-bugs` |
| Факты чужого API и справки | `mattpocock/research` |
| Границы модуля | `mattpocock/codebase-design` |
| Термин или ADR | `mattpocock/domain-modeling` |
| Ревью ветки | `mattpocock/code-review` |
| Правка `AGENTS.md` и правил | `mattpocock/writing-for-agents` |
| Реализация шага | `mattpocock/implement` |
| Крупный модуль | `arxitect/architect` |
| Макет и тексты экрана | `design/design-system`, `design/design-critique`, `design/ux-copy`, `design/accessibility-review` |
| Работа в Figma | `figma/figma-use` и скилл задачи из `.cursor/skills/figma/` |
| Любой серверный код, до первой строки | `backend-design/think-before-coding`, `backend-design/error-handling-as-design` |
| Запись, которая меняет состояние, повтор, заявка | `backend-design/idempotency-and-side-effects` |
| Новый внешний вызов, поток, воркер | `backend-design/observability-by-default` |
| Ключи, доступ, данные человека | `backend-design/security-discipline` |
| Файл или схема на диске | `backend-design/data-modeling-discipline`, `backend-design/migration-safety` |
| Лимиты, большие деревья, совместная правка | `backend-design/performance-and-scaling` |
| Выбор базы, очереди, числа сервисов | `backend-design/boring-by-default` |
| Тест сервера | `backend-design/testing-with-discernment` |
| Сбой на стыке с внешним сервисом | `backend-design/debugging-discipline` |
| Вход, сессия, роль | `backend-design/auth-and-authorization` |
| Проверка после реализации | `qa-bug-hunter` |
| Слои модуля | `clean-architecture/check`, `clean-architecture/review` |
| План уже написан, выполнение в этой сессии | `superpowers/subagent-driven-development` |
| План в отдельной сессии | `superpowers/executing-plans` |
| Перед заявлением «готово» | `superpowers/verification-before-completion` |
| Идея до спеки | `superpowers/brainstorming` |

Остальные файлы `SKILL.md` в `.cursor/skills/` — те же пачки целиком: mattpocock, backend-design, design, figma, superpowers, arxitect, clean-architecture, qa-bug-hunter. Бери по имени папки, когда задача совпадает с первой строкой файла.

Скиллы скопированы 2026-11-03 из локальных пакетов Cursor, которыми пользуется IT Algo. Это не документы продукта wiki.
