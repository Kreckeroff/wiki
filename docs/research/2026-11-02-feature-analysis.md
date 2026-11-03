# Аналитика фич

Дата: 2026-11-02. Стек не выбирался. Это разбор уже названных фич и сверка тех мест, где от чужого продукта зависит наше решение.

Поведение экранов, собранное после этого разбора, лежит в `docs/work/FEATURE_BEHAVIOR.md`. Предложения оттуда по `О-7`, `О-9` и `О-10` в бэклоге не закрыты. Стек — в `2026-11-02-stack.md`, тоже не выбран.

Первичные источники, страницы открыты в этот день:

- Notion, доступ: https://www.notion.com/help/sharing-and-permissions
- Notion, совместная работа: https://www.notion.com/help/collaborate-within-a-workspace и https://www.notion.com/help/collaborate-with-people
- Notion, боковая панель: https://www.notion.com/help/navigate-with-the-sidebar
- Notion, комментарии: https://www.notion.com/help/comments-mentions-and-reminders
- Notion, подстраница: https://www.notion.com/help/create-a-subpage
- Notion, скиллы: https://www.notion.com/help/create-and-manage-skills
- Notion, свои агенты: https://www.notion.com/help/custom-agents
- Docmost, обзор и страницы: https://docmost.com/docs/ и https://docmost.com/docs/user-guide/pages
- Docmost, workspace: https://docmost.com/docs/user-guide/workspace
- Docmost, права страницы (платная лицензия): https://docmost.com/docs/user-guide/pages/page-permissions
- Outline, шаринг, коллекции, поиск, комментарии, навигация: https://docs.getoutline.com/s/guide/doc/sharing-LG2sGOLIpl , https://docs.getoutline.com/s/guide/doc/collections-l9o3LD22sV , https://docs.getoutline.com/s/guide/doc/search-NIKPvYrx06 , https://docs.getoutline.com/s/guide/doc/commenting-z7eSWvI5TI , https://docs.getoutline.com/s/guide/doc/navigation-Nxnr2lWbck

AFFiNE и AppFlowy в этот проход не открывались. Сравнительная страница Docmost про Outline не использовалась: это их реклама, не справка.

## Что уже решено у нас

Первый код — редактор: дерево страниц, полный Markdown, перетаскивание, плавное движение, живые правки другого человека. Страница одна: текст и дочерние страницы. Глава — заголовок внутри текста. Иконка и фон относятся к странице.

Дальше по продукту, не в этом коде: сильный поиск, три круга доступа, права «смотреть» и «смотреть и править», входящие из трёх событий приглашения, регистрация и несколько workspace, потолок пять участников вместе с владельцем.

Позже: агенты и MCP, поиск для моделей, рейтинг доверия, граф, агент-продукт-менеджер, сводка по агентам, ключ задачи, режим организации с чужим SSO, приложения Windows и macOS, плагины BPMN и PlantUML, библиотека скиллов.

## Пять выводов

1. Живая правка не живёт без входа. Чтобы второй человек был виден на странице, нужны два аккаунта и одна общая страница. Круги доступа, поиск и лента приглашений могут идти следом. Способ входа по-прежнему не выбран.

2. Круг «любой зарегистрированный» шире, чем у Notion. У Notion общий доступ такой: только приглашённые; все в этом workspace; любой в интернете по ссылке. Смотреть по ссылке можно без аккаунта Notion, комментировать и править — только войдя (https://www.notion.com/help/sharing-and-permissions). Отдельного круга «любой аккаунт всего сервиса» у них нет. Наш средний круг пускает на страницу человека из другого workspace, если он просто зарегистрирован на том же сервере.

3. У Notion «править» и «делиться» разведены. `Full access` — править и приглашать других. `Can edit` — править содержимое, но не делиться. Отдельно `Can comment` и `Can view` (та же страница справки). У нас названы только «смотреть» и «смотреть и править». Кто может звать людей на страницу — не сказано. Комментарий отдельным правом не назван.

4. Комментарии названы и никуда не положены. В Notion комментарий вешается на выделение или блок, по нему отвечают, его закрывают, и он приходит во входящие (https://www.notion.com/help/comments-mentions-and-reminders, https://www.notion.com/help/collaborate-with-people). У Outline комментарий есть на документ и на выделение, а на публичной ссылке комментариев не видно (https://docs.getoutline.com/s/guide/doc/commenting-z7eSWvI5TI). Наши входящие пока только про приглашения: отправил, получил, принял. Комментарию там места нет.

5. Скилл в Notion — это страница, не отдельный вид объекта. Инструкция живёт как страница, её помечают «use as a skill», библиотека скиллов лежит в боковой панели. Страницу можно скачать локальному агенту (Cursor, Claude Code и другие) файлом `SKILL.md` (https://www.notion.com/help/create-and-manage-skills). Свой агент — другое: раздел `Agents` в боковой панели, свои инструкции, доступ, инструменты и триггеры (https://www.notion.com/help/custom-agents). Когда дойдём до скиллов, отдельную сущность заводить не из чего: это страница с пометкой.

## Как устроена живая правка у Notion

Лимита на число людей на одной странице нет. Аватар стоит у блока, который человек смотрит или правит. Блок не запирается, пока его правит другой. На странице остаётся последнее изменение. Часы сверху показывают, что добавили (синим) и что стёрли (серым зачёркиванием). Клик по аватарке переносит к месту, где этот человек читает или печатает (https://www.notion.com/help/collaborate-within-a-workspace, https://www.notion.com/help/sharing-and-permissions).

Для нас из этого следуют две дыры. Что происходит, когда двое правят одно слово: правки сливаются или побеждает последний. И нужна ли история страницы, или хватает живой картинки.

## Доступ, которого у нас нет и который мы не обещали

Notion дополнительно умеет: гостя на одну страницу без членства в workspace; разделы `Private` и `Shared` в боковой панели; перенос страницы в `Private` снимает чужой доступ с этой страницы, но не с её подстраниц; подстраница при создании копирует права родителя; если доступ пришёл двумя путями, побеждает более широкий (https://www.notion.com/help/sharing-and-permissions).

Docmost по умолчанию другой формы: workspace, внутри space, внутри страницы. Роли workspace — owner, admin, member. У space свои Full Access, Can Edit, Can View. Право на отдельную страницу (Open или Restricted, Can View или Can Edit) — платная лицензия, и более узкое из роли space и роли страницы побеждает (https://docmost.com/docs/user-guide/workspace, https://docmost.com/docs/user-guide/pages/page-permissions). Публичная ссылка умеет включать дочерние страницы и запрещается на весь workspace или на один space (https://docmost.com/docs/user-guide/pages).

Outline держит права на коллекции (View, View + Edit, Admin). Отдельный документ можно дополнительно пригласить смотреть или править, дети уходят вместе с ним. Публикация в интернет включает дочерние документы (https://docs.getoutline.com/s/guide/doc/collections-l9o3LD22sV, https://docs.getoutline.com/s/guide/doc/sharing-LG2sGOLIpl).

Потолка «пять человек» ни в одной из этих справок нет. Гость Notion и публичная ссылка Docmost закрывают сценарий «шестой смотрит, но не сидит в workspace». У нас шестой попадает только через ссылку или через круг «любой зарегистрированный».

## Поиск

Notion: окно поиска из боковой панели и `cmd/ctrl + K`, недавние страницы и текст. Страницу, открытую всему workspace, можно спрятать из поиска (https://www.notion.com/help/navigate-with-the-sidebar, https://www.notion.com/help/sharing-and-permissions).

Outline: минус-слово, фраза в кавычках, `OR`. Ответы модели — только в облаке и лицензии, и только по документам, которые этот человек и так может открыть (https://docs.getoutline.com/s/guide/doc/search-NIKPvYrx06).

Docmost в открытой поставке: полнотекст по страницам, фильтр по space и типу. Поиск по вложениям PDF и DOCX — в платной поставке (https://docmost.com/docs/).

Наш порог «не фильтр по заголовку» этим ещё не расшифрован: текст страницы, операторы, недавние, спрятать из выдачи.

## Входящие

У Notion входящие в правом верхнем углу боковой панели, спрятать или перенести нельзя. Туда падают правки на страницах, упоминания, новые назначения. Красный значок — непрочитанные упоминания (https://www.notion.com/help/navigate-with-the-sidebar). Просьба сменить право на страницу тоже приходит во входящие (https://www.notion.com/help/sharing-and-permissions).

Наши входящие уже определены узко: приглашение отправлено, получено, принято. Это ближе к почте приглашений, чем к входящим Notion.

## Что не проверялось

Иконка и обложка страницы Notion, состав блоков Markdown, AFFiNE, AppFlowy. Диаграммы Docmost (Draw.io, Excalidraw, Mermaid) перечислены в обзоре https://docmost.com/docs/ и относятся к нашим будущим плагинам, в первый редактор не входят.
