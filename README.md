# Wiki

Клиент-серверный редактор страниц для человека и, позже, для агентов. В `app/` работают workspace и проекты, дерево страниц, Markdown, совместная правка, операции с блоками и поиск по страницам.

## Запуск

```bash
cd app
npm install
npm run dev
```

Откройте `http://localhost:3000`. Настройки, production-запуск и проверки описаны в [app/README.md](app/README.md).

Агенту начинать с [AGENTS.md](AGENTS.md). Процесс и локальные скиллы — [docs/agent/WORKFLOW.md](docs/agent/WORKFLOW.md), файлы скиллов в `.cursor/skills/`.
