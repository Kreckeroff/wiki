import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { editorExtensions } from '../../shared/editor'
import { deleteBlock, duplicateBlock, turnBlock } from './block-operations'

const editors: Editor[] = []

function createEditor(content: object) {
  const editor = new Editor({ extensions: editorExtensions, content })
  editors.push(editor)
  return editor
}

afterEach(() => {
  editors.splice(0).forEach(editor => editor.destroy())
})

describe('действия с блоком', () => {
  it('дублирует блок со всем форматированием сразу после источника', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Первый', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Второй' }] },
      ],
    })

    expect(duplicateBlock(editor, 0)).toBe(true)

    expect(editor.getJSON().content).toEqual([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Первый', marks: [{ type: 'bold' }] }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Первый', marks: [{ type: 'bold' }] }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Второй' }] },
    ])
  })

  it('удаляет только выбранный блок', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Первый' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Второй' }] },
      ],
    })

    expect(deleteBlock(editor, 0)).toBe(true)

    expect(editor.getJSON().content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Второй' }] },
    ])
  })

  it('оставляет пустой абзац после удаления последнего блока', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Единственный' }] }],
    })

    expect(deleteBlock(editor, 0)).toBe(true)

    expect(editor.getJSON().content).toEqual([{ type: 'paragraph' }])
  })

  it('превращает абзац в заголовок и сохраняет форматирование текста', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Глава', marks: [{ type: 'bold' }] }] }],
    })

    expect(turnBlock(editor, 0, 'h2')).toBe(true)

    expect(editor.getJSON().content).toEqual([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Глава', marks: [{ type: 'bold' }] }] },
    ])
  })

  it.each([
    ['text', 'paragraph'],
    ['h1', 'heading'],
    ['h3', 'heading'],
    ['bullet', 'bulletList'],
    ['ordered', 'orderedList'],
    ['task', 'taskList'],
    ['quote', 'blockquote'],
    ['code', 'codeBlock'],
  ] as const)('превращает абзац через %s в %s', (target, expectedType) => {
    const editor = createEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Содержимое' }] }],
    })

    expect(turnBlock(editor, 0, target)).toBe(true)

    expect(editor.state.doc.firstChild?.type.name).toBe(expectedType)
    expect(editor.state.doc.firstChild?.textContent).toBe('Содержимое')
  })

  it('создаёт задачу неотмеченной', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Новая задача' }] }],
    })

    expect(turnBlock(editor, 0, 'task')).toBe(true)

    expect(editor.getJSON().content?.[0]).toEqual({
      type: 'taskList',
      content: [{
        type: 'taskItem',
        attrs: { checked: false },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Новая задача' }] }],
      }],
    })
  })

  it('не превращает разделитель и не меняет документ', () => {
    const editor = createEditor({ type: 'doc', content: [{ type: 'horizontalRule' }] })
    const before = editor.getJSON()

    expect(turnBlock(editor, 0, 'h1')).toBe(false)

    expect(editor.getJSON()).toEqual(before)
  })

  it('не выполняет операцию по устаревшей позиции', () => {
    const editor = createEditor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Текст' }] }] })
    const before = editor.getJSON()

    expect(duplicateBlock(editor, 999)).toBe(false)
    expect(deleteBlock(editor, 999)).toBe(false)
    expect(turnBlock(editor, 999, 'text')).toBe(false)

    expect(editor.getJSON()).toEqual(before)
  })
})
