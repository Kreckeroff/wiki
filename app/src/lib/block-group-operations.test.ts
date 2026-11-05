import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { Transaction } from '@tiptap/pm/state'
import { editorExtensions } from '../../shared/editor'
import { createBlockGroup, deleteBlockGroup, duplicateBlockGroup, moveBlockGroup, moveBlockGroupBoundary, resolveBlockGroup } from './block-group-operations'

const editors: Editor[] = []

function createEditor(content: object) {
  const editor = new Editor({ extensions: editorExtensions, content })
  editors.push(editor)
  return editor
}

function makeGroup(editor: Editor, anchor: number, head: number) {
  const group = createBlockGroup(editor, anchor, head)
  if (!group) throw new Error('Ожидалась валидная группа')
  return group
}

function blockPositions(editor: Editor, type = 'paragraph') {
  const positions: number[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === type) positions.push(pos)
  })
  return positions
}

function blockTexts(editor: Editor, type = 'paragraph') {
  const texts: string[] = []
  editor.state.doc.descendants(node => {
    if (node.type.name === type) texts.push(node.textContent)
  })
  return texts
}

function textRuns(editor: Editor) {
  const runs: { text: string, marks: string[] }[] = []
  editor.state.doc.descendants(node => {
    if (node.isText) runs.push({ text: node.text ?? '', marks: node.marks.map(mark => mark.type.name) })
  })
  return runs
}

afterEach(() => {
  vi.restoreAllMocks()
  editors.splice(0).forEach(editor => editor.destroy())
})

describe('непрерывная группа блоков', () => {
  it('вычисляет sibling-range и двигает подвижный край с остановкой у родителя', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй', 'Третий', 'Четвёртый'].map(text => ({
        type: 'paragraph',
        content: [{ type: 'text', text }],
      })),
    })
    const [first, second, third, fourth] = blockPositions(editor)
    const resolved = resolveBlockGroup(editor, makeGroup(editor, second, fourth))

    expect(resolved).toMatchObject({ from: second, to: editor.state.doc.content.size, depth: 0 })
    expect(resolved?.selection.ranges.map(range => range.$from.nodeAfter?.textContent)).toEqual([
      'Второй', 'Третий', 'Четвёртый',
    ])

    let group = makeGroup(editor, second, second)
    group = moveBlockGroupBoundary(editor, group, 'down')!
    expect(group).toEqual(makeGroup(editor, second, third))
    group = moveBlockGroupBoundary(editor, group, 'down')!
    expect(group).toEqual(makeGroup(editor, second, fourth))
    expect(moveBlockGroupBoundary(editor, group, 'down')).toEqual(group)
    group = moveBlockGroupBoundary(editor, group, 'up')!
    expect(group).toEqual(makeGroup(editor, second, third))
    group = moveBlockGroupBoundary(editor, group, 'up')!
    expect(group).toEqual(makeGroup(editor, second, second))
    group = moveBlockGroupBoundary(editor, group, 'up')!
    expect(group).toEqual(makeGroup(editor, second, first))
    expect(moveBlockGroupBoundary(editor, group, 'up')).toEqual(group)
  })

  it('дублирует группу после источника одной транзакцией без потери содержимого', () => {
    const originals = [
      {
        type: 'heading', attrs: { level: 2 },
        content: [{ type: 'text', text: 'Глава', marks: [{ type: 'bold' }] }],
      },
      {
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Пункт', marks: [{ type: 'italic' }] }] },
            {
              type: 'bulletList',
              content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Вложенный' }] }] }],
            },
          ],
        }],
      },
    ]
    const tail = { type: 'paragraph', content: [{ type: 'text', text: 'После' }] }
    const editor = createEditor({ type: 'doc', content: [...originals, tail] })
    const anchor = blockPositions(editor, 'heading')[0]
    const head = blockPositions(editor, 'bulletList')[0]
    let transactions = 0
    editor.on('transaction', () => { transactions += 1 })

    expect(duplicateBlockGroup(editor, makeGroup(editor, anchor, head))).toBe(true)

    expect(editor.getJSON().content).toEqual([...originals, ...originals, tail])
    expect(transactions).toBe(1)
  })

  it('удаляет только группу и ставит фокус в следующий оставшийся блок', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй', 'Третий', 'Четвёртый'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const positions = blockPositions(editor)

    expect(deleteBlockGroup(editor, makeGroup(editor, positions[1], positions[2]))).toBe(true)

    expect(editor.state.doc.textContent).toBe('ПервыйЧетвёртый')
    expect(editor.state.selection.$from.parent.textContent).toBe('Четвёртый')
  })

  it('ставит фокус в предыдущий блок, если следующего не осталось', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй', 'Третий', 'Четвёртый'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const positions = blockPositions(editor)

    expect(deleteBlockGroup(editor, makeGroup(editor, positions[2], positions[3]))).toBe(true)

    expect(editor.state.doc.textContent).toBe('ПервыйВторой')
    expect(editor.state.selection.$from.parent.textContent).toBe('Второй')
  })

  it('оставляет пустой абзац с курсором после удаления всего содержимого', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Глава' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Текст' }] },
      ],
    })

    expect(deleteBlockGroup(editor, makeGroup(editor, 0, blockPositions(editor)[0]))).toBe(true)

    expect(editor.getJSON().content).toEqual([{ type: 'paragraph' }])
    expect(editor.state.selection.from).toBe(1)
  })

  it('перемещает всю группу одной транзакцией с сохранением порядка', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй', 'Третий', 'Четвёртый'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const positions = blockPositions(editor)
    let transactions = 0
    editor.on('transaction', () => { transactions += 1 })

    expect(moveBlockGroup(
      editor,
      makeGroup(editor, positions[2], positions[1]),
      editor.state.doc.content.size,
    )).toBe(true)

    expect(blockTexts(editor)).toEqual(['Первый', 'Четвёртый', 'Второй', 'Третий'])
    expect(transactions).toBe(1)
  })

  it('отклоняет цель внутри группы, тексте и невалидные границы без транзакции', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй', 'Третий', 'Четвёртый'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const positions = blockPositions(editor)
    const group = makeGroup(editor, positions[1], positions[2])
    const before = editor.getJSON()
    let transactions = 0
    editor.on('transaction', () => { transactions += 1 })

    expect(moveBlockGroup(editor, group, positions[2])).toBe(false)
    expect(moveBlockGroup(editor, group, positions[3] + 2)).toBe(false)
    expect(moveBlockGroup(editor, group, 999)).toBe(false)
    expect(moveBlockGroup(editor, { ...group, anchor: 1 }, 0)).toBe(false)

    expect(editor.getJSON()).toEqual(before)
    expect(transactions).toBe(0)
  })

  it('ограничивает диапазон соседями одного списка и отклоняет смешанные уровни', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'До списка' }] },
        {
          type: 'bulletList',
          content: ['Первый', 'Второй', 'Третий'].map(text => ({
            type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
          })),
        },
      ],
    })
    const items = blockPositions(editor, 'listItem')

    const resolved = resolveBlockGroup(editor, makeGroup(editor, items[2], items[1]))
    expect(resolved).toMatchObject({ from: items[1], depth: 1 })
    expect(resolved?.selection.ranges.map(range => range.$from.nodeAfter?.textContent)).toEqual(['Второй', 'Третий'])
    expect(moveBlockGroupBoundary(editor, makeGroup(editor, items[2], items[2]), 'down')).toEqual(
      makeGroup(editor, items[2], items[2]),
    )
    expect(createBlockGroup(editor, 0, items[0])).toBeNull()
    expect(resolveBlockGroup(editor, {
      ...makeGroup(editor, items[0], items[0]), head: items[0] + 2,
    })).toBeNull()
  })

  it('удаляет соседние пункты одного списка и фокусирует следующий пункт', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: ['Первый', 'Второй', 'Третий', 'Четвёртый'].map(text => ({
          type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        })),
      }],
    })
    const items = blockPositions(editor, 'listItem')

    expect(deleteBlockGroup(editor, makeGroup(editor, items[1], items[2]))).toBe(true)

    expect(editor.state.doc.textContent).toBe('ПервыйЧетвёртый')
    expect(editor.state.selection.$from.parent.textContent).toBe('Четвёртый')
    expect(editor.state.selection.from).toBe(items[1] + 2)
  })

  it('дублирует соседние пункты внутри их списка в прежнем порядке', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{
        type: 'orderedList',
        content: ['Первый', 'Второй', 'Третий'].map(text => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'bold' }] }] }],
        })),
      }],
    })
    const items = blockPositions(editor, 'listItem')

    expect(duplicateBlockGroup(editor, makeGroup(editor, items[0], items[1]))).toBe(true)

    expect(editor.state.doc.firstChild?.childCount).toBe(5)
    expect(textRuns(editor)).toEqual([
      { text: 'Первый', marks: ['bold'] },
      { text: 'Второй', marks: ['bold'] },
      { text: 'Первый', marks: ['bold'] },
      { text: 'Второй', marks: ['bold'] },
      { text: 'Третий', marks: ['bold'] },
    ])
  })

  it('перемещает соседние пункты только внутри допустимого родителя', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: ['Первый', 'Второй', 'Третий', 'Четвёртый'].map(text => ({
          type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        })),
      }],
    })
    const listPos = blockPositions(editor, 'bulletList')[0]
    const list = editor.state.doc.nodeAt(listPos)!
    const items = blockPositions(editor, 'listItem')

    expect(moveBlockGroup(
      editor,
      makeGroup(editor, items[1], items[2]),
      listPos + list.nodeSize - 1,
    )).toBe(true)

    expect(blockTexts(editor, 'listItem')).toEqual(['Первый', 'Четвёртый', 'Второй', 'Третий'])
  })

  it('не перемещает корневые абзацы в список, который их не принимает', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Первый' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Второй' }] },
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Пункт' }] }] }],
        },
      ],
    })
    const before = editor.getJSON()
    const item = blockPositions(editor, 'listItem')[0]

    expect(moveBlockGroup(editor, makeGroup(editor, 0, blockPositions(editor)[1]), item)).toBe(false)

    expect(editor.getJSON()).toEqual(before)
  })

  it('перемещает группу к позиции перед источником', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй', 'Третий', 'Четвёртый'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const positions = blockPositions(editor)

    expect(moveBlockGroup(editor, makeGroup(editor, positions[1], positions[2]), 0)).toBe(true)

    expect(blockTexts(editor)).toEqual(['Второй', 'Третий', 'Первый', 'Четвёртый'])
  })

  it('не выполняет команды по устаревшим после живой правки границам', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const stale = makeGroup(editor, blockPositions(editor)[1], blockPositions(editor)[1])
    editor.commands.insertContentAt(0, {
      type: 'paragraph', content: [{ type: 'text', text: 'Добавлено' }],
    })
    const before = editor.getJSON()
    let transactions = 0
    editor.on('transaction', () => { transactions += 1 })

    expect(duplicateBlockGroup(editor, stale)).toBe(false)
    expect(deleteBlockGroup(editor, stale)).toBe(false)
    expect(moveBlockGroup(editor, stale, editor.state.doc.content.size)).toBe(false)

    expect(editor.getJSON()).toEqual(before)
    expect(transactions).toBe(0)
  })

  it.each(['resolve', 'boundary', 'duplicate', 'delete', 'move'] as const)(
    'отклоняет старую группу после удаления предшественника: %s',
    action => {
      const editor = createEditor({
        type: 'doc',
        content: ['A', 'B', 'C'].map(text => ({
          type: 'paragraph', content: [{ type: 'text', text }],
        })),
      })
      const stale = makeGroup(editor, blockPositions(editor)[1], blockPositions(editor)[1])
      editor.commands.deleteRange({ from: 0, to: stale.anchor })
      const before = editor.getJSON()
      let transactions = 0
      editor.on('transaction', () => { transactions += 1 })

      const result = action === 'resolve'
        ? resolveBlockGroup(editor, stale)
        : action === 'boundary'
          ? moveBlockGroupBoundary(editor, stale, 'down')
          : action === 'duplicate'
            ? duplicateBlockGroup(editor, stale)
            : action === 'delete'
              ? deleteBlockGroup(editor, stale)
              : moveBlockGroup(editor, stale, 0)

      if (action === 'resolve' || action === 'boundary') expect(result).toBeNull()
      else expect(result).toBe(false)
      expect(editor.getJSON()).toEqual(before)
      expect(transactions).toBe(0)
    },
  )

  it('не dispatch-ит удаление при принудительном сбое insert после него', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['A', 'B', 'C', 'D'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const positions = blockPositions(editor)
    const before = editor.getJSON()
    let transactions = 0
    editor.on('transaction', () => { transactions += 1 })
    const originalInsert = Transaction.prototype.insert
    vi.spyOn(Transaction.prototype, 'insert').mockImplementation(function (this: Transaction, ...args) {
      if (this.steps.length > 0) throw new Error('Принудительный сбой после delete')
      return originalInsert.apply(this, args)
    })

    expect(moveBlockGroup(
      editor,
      makeGroup(editor, positions[1], positions[2]),
      editor.state.doc.content.size,
    )).toBe(false)

    expect(editor.getJSON()).toEqual(before)
    expect(transactions).toBe(0)
  })

  it('отклоняет позиции вне документа без исключения или транзакции', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const group = makeGroup(editor, 0, 0)
    const before = editor.getJSON()
    let transactions = 0
    editor.on('transaction', () => { transactions += 1 })

    expect(createBlockGroup(editor, editor.state.doc.content.size + 1, editor.state.doc.content.size + 1)).toBeNull()
    expect(moveBlockGroup(editor, group, -1)).toBe(false)
    expect(editor.getJSON()).toEqual(before)
    expect(transactions).toBe(0)
  })

  it('отклоняет разные родительские уровни даже при прямом resolve с настоящими узлами', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Корень' }] },
        {
          type: 'bulletList',
          content: ['Первый', 'Второй'].map(text => ({
            type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
          })),
        },
      ],
    })
    const head = blockPositions(editor, 'listItem')[1]
    const mixedGroup = {
      anchor: 0,
      head,
      anchorNode: editor.state.doc.nodeAt(0)!,
      headNode: editor.state.doc.nodeAt(head)!,
    }

    expect(resolveBlockGroup(editor, mixedGroup)).toBeNull()
  })

  it('проверяет идентичность обоих краёв после изменения их позиций', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй', 'Третий', 'Четвёртый'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const positions = blockPositions(editor)
    const group = makeGroup(editor, positions[1], positions[2])

    expect(resolveBlockGroup(editor, { ...group, anchor: positions[0] })).toBeNull()
    expect(resolveBlockGroup(editor, { ...group, head: positions[3] })).toBeNull()
  })

  it('останавливает подвижный край на первом пункте вложенного списка', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: ['Первый', 'Второй'].map(text => ({
          type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        })),
      }],
    })
    const first = blockPositions(editor, 'listItem')[0]
    const group = makeGroup(editor, first, first)

    expect(moveBlockGroupBoundary(editor, group, 'up')).toEqual(group)
  })

  it('оставляет исходные узлы на месте, а их копии вставляет после группы', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй', 'После'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const positions = blockPositions(editor)
    const group = makeGroup(editor, positions[0], positions[1])

    expect(duplicateBlockGroup(editor, group)).toBe(true)

    expect(blockTexts(editor)).toEqual(['Первый', 'Второй', 'Первый', 'Второй', 'После'])
    expect(editor.state.doc.nodeAt(positions[0])).toBe(group.anchorNode)
    expect(editor.state.doc.nodeAt(positions[1])).toBe(group.headNode)
  })

  it('фокусирует предыдущий пункт списка после удаления хвоста перед следующим корневым блоком', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: ['Первый', 'Второй', 'Третий'].map(text => ({
            type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
          })),
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'После списка' }] },
      ],
    })
    const items = blockPositions(editor, 'listItem')

    expect(deleteBlockGroup(editor, makeGroup(editor, items[1], items[2]))).toBe(true)

    expect(blockTexts(editor, 'listItem')).toEqual(['Первый'])
    expect(editor.state.selection.$from.parent.textContent).toBe('Первый')
  })

  it('возвращает DOM-фокус подключённому редактору после удаления группы', () => {
    const editor = createEditor({
      type: 'doc',
      content: ['Первый', 'Второй'].map(text => ({
        type: 'paragraph', content: [{ type: 'text', text }],
      })),
    })
    const viewGetter = Object.getOwnPropertyDescriptor(Editor.prototype, 'view')!.get!
    const focus = vi.fn()
    vi.spyOn(editor, 'view', 'get').mockImplementation(() => new Proxy(viewGetter.call(editor), {
      get: (view, property, receiver) => {
        if (property === 'dom') return { isConnected: true }
        if (property === 'focus') return focus
        return Reflect.get(view, property, receiver)
      },
    }))
    editor.isInitialized = true
    const positions = blockPositions(editor)

    expect(deleteBlockGroup(editor, makeGroup(editor, positions[0], positions[0]))).toBe(true)

    expect(focus).toHaveBeenCalledOnce()
  })
})
