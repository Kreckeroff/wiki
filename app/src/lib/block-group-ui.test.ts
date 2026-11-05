import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { editorExtensions } from '../../shared/editor'
import { createBlockGroup, moveBlockGroup, resolveBlockGroup } from './block-group-operations'
import {
  blockGroupCursorPosition, blockGroupCursorSelection, blockGroupDropTarget, blockGroupForDrag,
  blockStartAtParentDepth, blockStartAtSelection, getAwarenessSelection, mapBlockGroup,
  shouldExitBlockGroupOnTrigger,
} from './block-group-ui'

const editors: Editor[] = []

function createEditor(content: object) {
  const editor = new Editor({ extensions: editorExtensions, content })
  editors.push(editor)
  return editor
}

afterEach(() => {
  editors.splice(0).forEach(editor => editor.destroy())
})

describe('жесты группы блоков', () => {
  it('находит текущий корневой блок для входа по Esc', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Первый' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Второй' }] },
      ],
    })
    const second = editor.state.doc.nodeAt(0)!.nodeSize
    editor.commands.setTextSelection(second + 3)

    expect(blockStartAtSelection(editor)).toBe(second)
  })

  it('выбирает пункт списка, а не его внутренний абзац', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Первый' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Второй' }] }] },
        ],
      }],
    })
    editor.commands.setTextSelection(1)

    expect(blockStartAtSelection(editor)).toBe(1)
    expect(editor.state.doc.nodeAt(1)?.type.name).toBe('listItem')
  })

  it('маппит только позиции и сохраняет исходные узлы группы', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const anchor = editor.state.doc.nodeAt(0)!.nodeSize
    const group = createBlockGroup(editor, anchor, anchor)!
    const inserted = editor.schema.nodes.paragraph.createAndFill()!
    const tr = editor.state.tr.insert(0, inserted)

    const mapped = mapBlockGroup(group, tr.mapping)

    expect(mapped).toEqual({
      anchor: anchor + inserted.nodeSize,
      head: anchor + inserted.nodeSize,
      anchorNode: group.anchorNode,
      headNode: group.headNode,
    })
    expect(mapped.anchorNode).toBe(group.anchorNode)
    expect(mapped.headNode).toBe(group.headNode)
  })

  it('при протягивании поднимается только до уровня якоря', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Первый' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Второй' }] }] },
        ],
      }],
    })
    const firstItem = 1
    const secondItem = firstItem + editor.state.doc.nodeAt(firstItem)!.nodeSize

    expect(blockStartAtParentDepth(editor, secondItem + 3, 1)).toBe(secondItem)
    expect(blockStartAtParentDepth(editor, secondItem + 3, 0)).toBe(0)
  })

  it('вычисляет блочную цель drop из позиции внутри текста', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй', 'Третий', 'Четвёртый'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const firstSize = editor.state.doc.nodeAt(0)!.nodeSize
    const secondSize = editor.state.doc.nodeAt(firstSize)!.nodeSize
    const group = createBlockGroup(editor, firstSize, firstSize + secondSize)!

    expect(blockGroupDropTarget(editor, group, 2)).toBe(0)
    expect(blockGroupDropTarget(editor, group, editor.state.doc.content.size - 1)).toBe(editor.state.doc.content.size)
  })

  it('запускает групповой drag только для захвата внутри валидной группы', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй', 'Третий', 'Четвёртый'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const positions: number[] = []
    editor.state.doc.forEach((_node, offset) => positions.push(offset))
    const group = createBlockGroup(editor, positions[1], positions[2])!

    expect(blockGroupForDrag(editor, group, positions[1])).toBe(group)
    expect(blockGroupForDrag(editor, group, positions[2])).toBe(group)
    expect(blockGroupForDrag(editor, group, positions[0])).toBeNull()
    expect(blockGroupForDrag(editor, group, positions[3])).toBeNull()
    expect(blockGroupForDrag(editor, { ...group, anchor: positions[0] }, positions[1])).toBeNull()
  })

  it.each([
    ['image', { type: 'image', attrs: { src: 'https://example.com/image.png' } }],
    ['horizontalRule', { type: 'horizontalRule' }],
  ])('находит выбранный atom-блок %s для входа по Esc', (_type, node) => {
    const editor = createEditor({
      type: 'doc',
      content: [node, { type: 'paragraph', content: [{ type: 'text', text: 'После' }] }],
    })
    editor.commands.setNodeSelection(0)

    const start = blockStartAtSelection(editor)

    expect(start).toBe(0)
    expect(createBlockGroup(editor, start!, start!)).not.toBeNull()
  })

  it('публикует пустой текстовый курсор вместо диапазона группы', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй', 'Третий'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const firstSize = editor.state.doc.nodeAt(0)!.nodeSize
    const secondSize = editor.state.doc.nodeAt(firstSize)!.nodeSize
    const group = createBlockGroup(editor, firstSize, firstSize + secondSize)!
    const selection = resolveBlockGroup(editor, group)!.selection
    editor.view.dispatch(editor.state.tr.setSelection(selection))

    const published = getAwarenessSelection(editor.state)

    expect(published.empty).toBe(true)
    expect(published.anchor).toBe(published.head)
    expect(published.$from.parent.isTextblock).toBe(true)
    expect(published.toJSON()).toEqual({ type: 'text', anchor: published.anchor, head: published.head })
  })

  it.each([
    ['image', { type: 'image', attrs: { src: 'https://example.com/image.png' } }],
    ['horizontalRule', { type: 'horizontalRule' }],
  ])('публикует пустой TextSelection для группы, начинающейся с %s', (_type, node) => {
    const editor = createEditor({
      type: 'doc',
      content: [node, { type: 'paragraph', content: [{ type: 'text', text: 'После' }] }],
    })
    const group = createBlockGroup(editor, 0, 0)!
    editor.view.dispatch(editor.state.tr.setSelection(resolveBlockGroup(editor, group)!.selection))

    const published = getAwarenessSelection(editor.state)

    expect(published).toBeInstanceOf(TextSelection)
    expect(published.empty).toBe(true)
    expect(published.anchor).toBe(published.head)
  })

  it.each([
    ['image', { type: 'image', attrs: { src: 'https://example.com/image.png' } }],
    ['horizontalRule', { type: 'horizontalRule' }],
  ])('публикует пустой TextSelection для %s в документе без текстовых блоков', (_type, node) => {
    const editor = createEditor({ type: 'doc', content: [node] })
    const group = createBlockGroup(editor, 0, 0)!
    editor.view.dispatch(editor.state.tr.setSelection(resolveBlockGroup(editor, group)!.selection))

    const published = getAwarenessSelection(editor.state)

    expect(published).toBeInstanceOf(TextSelection)
    expect(published.empty).toBe(true)
    expect(published.anchor).toBe(published.head)
  })

  it('не меняет обычное текстовое выделение для awareness', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Обычный текст' }] }],
    })
    editor.commands.setTextSelection({ from: 2, to: 8 })

    expect(getAwarenessSelection(editor.state)).toBe(editor.state.selection)
  })

  it('возвращает курсор к фактически перемещённой группе, а не к старой цели drop', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй', 'Третий', 'Четвёртый'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const positions: number[] = []
    editor.state.doc.forEach((_node, offset) => positions.push(offset))
    const group = createBlockGroup(editor, positions[1], positions[2])!
    const oldTarget = editor.state.doc.content.size
    const cursorTarget = blockGroupCursorPosition(editor, group, oldTarget)
    expect(moveBlockGroup(editor, group, oldTarget)).toBe(true)
    let movedStart = -1
    editor.state.doc.forEach((node, offset) => {
      if (node.textContent === 'Второй') movedStart = offset
    })

    const selection = blockGroupCursorSelection(editor, cursorTarget!)
    expect(cursorTarget).toBe(movedStart)
    expect(selection).toBeInstanceOf(TextSelection)
    expect(selection!.from).toBe(movedStart + 1)
    expect(selection!.$from.parent.textContent).toBe('Второй')
  })

  it.each([
    ['image', { type: 'image', attrs: { src: 'https://example.com/image.png' } }],
    ['horizontalRule', { type: 'horizontalRule' }],
  ])('выбирает сам перемещённый atom-блок %s после drop', (type, node) => {
    const editor = createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'До' }] },
        node,
        { type: 'image', attrs: { src: 'https://example.com/neighbor.png' } },
      ],
    })
    const atomStart = editor.state.doc.nodeAt(0)!.nodeSize
    const group = createBlockGroup(editor, atomStart, atomStart)!
    const target = 0
    const cursorTarget = blockGroupCursorPosition(editor, group, target)!
    expect(moveBlockGroup(editor, group, target)).toBe(true)

    const selection = blockGroupCursorSelection(editor, cursorTarget)

    expect(selection).toBeInstanceOf(NodeSelection)
    expect(selection!.from).toBe(cursorTarget)
    expect((selection as NodeSelection).node.type.name).toBe(type)
    expect(editor.state.doc.nodeAt(cursorTarget)?.type.name).toBe(type)
  })

  it('снимает группу по Escape на захвате только после закрытия меню', () => {
    expect(shouldExitBlockGroupOnTrigger('Escape', true)).toBe(true)
    expect(shouldExitBlockGroupOnTrigger('Escape', false)).toBe(false)
    expect(shouldExitBlockGroupOnTrigger('Enter', true)).toBe(false)
  })

  it('отклоняет drop target за пределами документа', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Текст' }] }],
    })
    const group = createBlockGroup(editor, 0, 0)!

    expect(blockGroupDropTarget(editor, group, editor.state.doc.content.size + 1)).toBeNull()
  })

  it('маппит вставку точно в anchor в сторону группы и сохраняет разные узлы краёв', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй', 'Третий'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const positions: number[] = []
    editor.state.doc.forEach((_node, offset) => positions.push(offset))
    const group = createBlockGroup(editor, positions[0], positions[1])!
    const inserted = editor.schema.nodes.paragraph.createAndFill()!
    const tr = editor.state.tr.insert(group.anchor, inserted)

    const mapped = mapBlockGroup(group, tr.mapping)

    expect(mapped.anchor).toBe(group.anchor + inserted.nodeSize)
    expect(mapped.head).toBe(group.head + inserted.nodeSize)
    expect(mapped.anchorNode).toBe(group.anchorNode)
    expect(mapped.headNode).toBe(group.headNode)
    expect(mapped.anchorNode).not.toBe(mapped.headNode)
  })

  it('публикует текстовый курсор перед отдельным atom NodeSelection в конце документа', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'До' }] },
        { type: 'image', attrs: { src: 'https://example.com/image.png' } },
      ],
    })
    const atomStart = editor.state.doc.nodeAt(0)!.nodeSize
    editor.commands.setNodeSelection(atomStart)

    const published = getAwarenessSelection(editor.state)

    expect(published).toBeInstanceOf(TextSelection)
    expect(published.empty).toBe(true)
    expect(published.$from.parent.isTextblock).toBe(true)
    expect(published.$from.parent.textContent).toBe('До')
  })

  it('не возвращает позицию курсора для drop внутри исходной группы', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй', 'Третий', 'Четвёртый'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const positions: number[] = []
    editor.state.doc.forEach((_node, offset) => positions.push(offset))
    const group = createBlockGroup(editor, positions[1], positions[2])!
    const resolved = resolveBlockGroup(editor, group)!

    expect(blockGroupCursorPosition(editor, group, positions[2])).toBeNull()
    expect(blockGroupCursorPosition(editor, group, resolved.to)).toBeNull()
  })

  it('отклоняет курсор после drop на границе и за пределами документа', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Текст' }] }],
    })

    expect(blockGroupCursorSelection(editor, editor.state.doc.content.size)).toBeNull()
    expect(blockGroupCursorSelection(editor, editor.state.doc.content.size + 1)).toBeNull()
  })
})
