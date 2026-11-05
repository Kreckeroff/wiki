import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { MarkdownManager } from '@tiptap/markdown'
import { Tiptap } from '@hocuspocus/transformer'
import * as Y from 'yjs'

export const editorExtensions = [
  StarterKit.configure({
    undoRedo: false,
    link: { openOnClick: false, autolink: true },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Image.configure({ allowBase64: false }),
  Table.configure({ resizable: true, renderWrapper: true }),
  TableRow,
  TableHeader,
  TableCell,
]

export const markdownManager = new MarkdownManager({ extensions: editorExtensions })

export const WELCOME_MARKDOWN = `## Начните с этого места

Это ваш первый проект. Создавайте страницы слева, а здесь записывайте всё важное.

- [x] Открыть редактор
- [ ] Написать первую страницу
- [ ] Открыть её вместе с участником

> Введите / в пустой строке, чтобы выбрать блок.
`

export function markdownToYjs(markdown: string): Uint8Array {
  const json = markdownManager.parse(markdown)
  const document = new Tiptap().extensions(editorExtensions).toYdoc(json, 'default', editorExtensions)
  const state = Y.encodeStateAsUpdate(document)
  document.destroy()
  return state
}

export function yjsToMarkdown(state: Uint8Array): string {
  const document = new Y.Doc()
  try {
    Y.applyUpdate(document, state)
    const json = new Tiptap().extensions(editorExtensions).fromYdoc(document, 'default')
    return markdownManager.serialize(json)
  } finally {
    document.destroy()
  }
}
