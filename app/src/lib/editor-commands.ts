export const EDITOR_COMMAND_GROUPS = [
  { id: 'text', label: 'Текст' },
  { id: 'lists', label: 'Списки' },
  { id: 'formatting', label: 'Оформление' },
  { id: 'structure', label: 'Структура' },
  { id: 'media', label: 'Медиа' },
] as const

export type EditorCommandGroup = typeof EDITOR_COMMAND_GROUPS[number]['id']
export type EditorCommandIcon = 'type' | 'heading1' | 'heading2' | 'heading3' | 'bullet' | 'ordered' | 'task' | 'quote' | 'code' | 'divider' | 'table' | 'image'

export interface EditorCommand {
  id: string
  group: EditorCommandGroup
  label: string
  description: string
  aliases: readonly string[]
  icon: EditorCommandIcon
}

export const EDITOR_COMMANDS: readonly EditorCommand[] = [
  { id: 'text', group: 'text', label: 'Текст', description: 'Обычный абзац', aliases: ['text', 'plain', 'paragraph', 'текст', 'абзац'], icon: 'type' },
  { id: 'h1', group: 'text', label: 'Заголовок 1', description: 'Крупная глава', aliases: ['h1', 'heading 1', 'heading1', 'header 1', 'header1', '#', 'заголовок 1', 'заголовок1'], icon: 'heading1' },
  { id: 'h2', group: 'text', label: 'Заголовок 2', description: 'Средняя глава', aliases: ['h2', 'heading', 'heading 2', 'heading2', 'header', 'header 2', 'header2', '##', 'заголовок', 'заголовок 2', 'заголовок2'], icon: 'heading2' },
  { id: 'h3', group: 'text', label: 'Заголовок 3', description: 'Малая глава', aliases: ['h3', 'heading 3', 'heading3', 'header 3', 'header3', '###', 'заголовок 3', 'заголовок3'], icon: 'heading3' },
  { id: 'bullet', group: 'lists', label: 'Маркированный список', description: 'Простой список', aliases: ['bullet', 'bulleted', 'ul', 'list', 'список', 'маркированный'], icon: 'bullet' },
  { id: 'ordered', group: 'lists', label: 'Нумерованный список', description: 'Шаги по порядку', aliases: ['num', 'number', 'numbered', 'ordered', 'ol', 'нумерованный', 'номер'], icon: 'ordered' },
  { id: 'task', group: 'lists', label: 'Список дел', description: 'Задачи с отметками', aliases: ['todo', 'to-do', 'task', 'checkbox', 'check', 'дела', 'задачи', 'чекбокс'], icon: 'task' },
  { id: 'quote', group: 'formatting', label: 'Цитата', description: 'Выделенная мысль', aliases: ['quote', 'blockquote', 'цитата'], icon: 'quote' },
  { id: 'code', group: 'formatting', label: 'Код', description: 'Блок без форматирования', aliases: ['code', 'codeblock', 'код'], icon: 'code' },
  { id: 'divider', group: 'formatting', label: 'Разделитель', description: 'Линия между частями', aliases: ['div', 'divider', 'hr', 'separator', 'разделитель', 'линия'], icon: 'divider' },
  { id: 'table', group: 'structure', label: 'Таблица', description: 'Три строки и три колонки', aliases: ['table', 'grid', 'таблица'], icon: 'table' },
  { id: 'image', group: 'media', label: 'Картинка', description: 'По ссылке', aliases: ['image', 'img', 'picture', 'картинка', 'изображение', 'фото'], icon: 'image' },
] as const

export function normalizeCommandQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru')
}

export function parseSlashQuery(textBeforeCaret: string) {
  const match = /^\/([\p{L}\p{N}# -]*)$/u.exec(textBeforeCaret)
  return match ? normalizeCommandQuery(match[1]) : null
}

export function filterEditorCommands(query: string) {
  const normalized = normalizeCommandQuery(query)
  if (!normalized) return [...EDITOR_COMMANDS]
  const exact = EDITOR_COMMANDS.filter(command =>
    [command.id, command.label, ...command.aliases].some(value => normalizeCommandQuery(value) === normalized)
  )
  if (exact.length) return [...exact]
  return EDITOR_COMMANDS.filter(command =>
    [command.id, command.label, ...command.aliases].some(value => normalizeCommandQuery(value).includes(normalized))
  )
}

export function slashOptionId(command: EditorCommand) {
  return `slash-command-${command.id}`
}

export function groupEditorCommands(commands: readonly EditorCommand[]) {
  return EDITOR_COMMAND_GROUPS.map(group => ({
    ...group,
    commands: commands.filter(command => command.group === group.id),
  })).filter(group => group.commands.length > 0)
}

export function moveActiveIndex(current: number, delta: number, count: number) {
  if (count === 0) return 0
  return (current + delta + count) % count
}
