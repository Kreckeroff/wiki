import { cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sandbox = path.join(appRoot, '..', '.mutation-check-group-blocks')
const files = {
  operations: 'src/lib/block-group-operations.ts',
  ui: 'src/lib/block-group-ui.ts',
}
const testFiles = [
  'src/lib/block-group-operations.test.ts',
  'src/lib/block-group-ui.test.ts',
]

const mutations = [
  {
    set: 'operations',
    name: 'позиция блока не ограничена размером документа',
    from: 'if (!Number.isInteger(pos) || pos < 0 || pos >= editor.state.doc.content.size) return null',
    to: 'if (!Number.isInteger(pos) || pos < 0) return null',
  },
  {
    set: 'operations',
    name: 'resolve не проверяет общего родителя',
    from: `  const anchor = blockAtStart(editor, group.anchor)\n  const head = blockAtStart(editor, group.head)\n  if (!anchor || !head || !anchor.$pos.sameParent(head.$pos)) return null`,
    to: `  const anchor = blockAtStart(editor, group.anchor)\n  const head = blockAtStart(editor, group.head)\n  if (!anchor || !head) return null`,
  },
  {
    set: 'operations',
    name: 'потеряна идентичность anchor-узла',
    from: 'if (anchor.node !== group.anchorNode || head.node !== group.headNode) return null',
    to: 'if (head.node !== group.headNode) return null',
  },
  {
    set: 'operations',
    name: 'потеряна идентичность head-узла',
    from: 'if (anchor.node !== group.anchorNode || head.node !== group.headNode) return null',
    to: 'if (anchor.node !== group.anchorNode) return null',
  },
  {
    set: 'operations',
    name: 'начало диапазона выбрано по дальнему краю',
    from: 'const from = Math.min(group.anchor, group.head)',
    to: 'const from = Math.max(group.anchor, group.head)',
  },
  {
    set: 'operations',
    name: 'конец диапазона использует узел противоположного края',
    from: 'const to = from === group.anchor ? group.head + head.node.nodeSize : group.anchor + anchor.node.nodeSize',
    to: 'const to = from === group.anchor ? group.head + anchor.node.nodeSize : group.anchor + head.node.nodeSize',
  },
  {
    set: 'operations',
    name: 'непрерывность диапазона проверяется со сдвигом на один блок',
    from: 'if (ranges.length !== Math.abs(anchor.index - head.index) + 1) return null',
    to: 'if (ranges.length !== Math.abs(anchor.index - head.index)) return null',
  },
  {
    set: 'operations',
    name: 'направления движения подвижного края перепутаны',
    from: "let headIndex = head.index + (direction === 'down' ? 1 : -1)",
    to: "let headIndex = head.index + (direction === 'down' ? -1 : 1)",
  },
  {
    set: 'operations',
    name: 'нижняя граница подвижного края ошибочно начинается со второго sibling',
    from: 'headIndex = Math.max(0, Math.min(parent.childCount - 1, headIndex))',
    to: 'headIndex = Math.max(1, Math.min(parent.childCount - 1, headIndex))',
  },
  {
    set: 'operations',
    name: 'подвижный край не ограничен последним sibling',
    from: 'headIndex = Math.max(0, Math.min(parent.childCount - 1, headIndex))',
    to: 'headIndex = Math.max(0, headIndex)',
  },
  {
    set: 'operations',
    name: 'якорь движется вместе с подвижным краем',
    from: 'return { anchor: group.anchor, head: headPos, anchorNode: group.anchorNode, headNode: nextHead.node }',
    to: 'return { anchor: headPos, head: headPos, anchorNode: group.anchorNode, headNode: nextHead.node }',
  },
  {
    set: 'operations',
    name: 'подвижный край сохраняет узел прежнего head',
    from: 'return { anchor: group.anchor, head: headPos, anchorNode: group.anchorNode, headNode: nextHead.node }',
    to: 'return { anchor: group.anchor, head: headPos, anchorNode: group.anchorNode, headNode: group.headNode }',
  },
  {
    set: 'operations',
    name: 'дубликаты вставляются перед исходной группой',
    from: 'return editor.chain().insertContentAt(resolved.to, nodes.map(node => node.toJSON())).run()',
    to: 'return editor.chain().insertContentAt(resolved.from, nodes.map(node => node.toJSON())).run()',
  },
  {
    set: 'operations',
    name: 'порядок дубликатов обращён',
    from: 'return editor.chain().insertContentAt(resolved.to, nodes.map(node => node.toJSON())).run()',
    to: 'return editor.chain().insertContentAt(resolved.to, nodes.slice().reverse().map(node => node.toJSON())).run()',
  },
  {
    set: 'operations',
    name: 'дублирование разбито на отдельные транзакции',
    from: 'return editor.chain().insertContentAt(resolved.to, nodes.map(node => node.toJSON())).run()',
    to: `let insertAt = resolved.to\n  for (const node of nodes) {\n    if (!editor.chain().insertContentAt(insertAt, node.toJSON()).run()) return false\n    insertAt += node.nodeSize\n  }\n  return true`,
  },
  {
    set: 'operations',
    name: 'удаление группы имеет пустой диапазон',
    from: 'tr.delete(resolved.from, resolved.to)\n    tr.setSelection',
    to: 'tr.delete(resolved.from, resolved.from)\n    tr.setSelection',
  },
  {
    set: 'operations',
    name: 'после удаления всегда выбирается следующий блок',
    from: 'const bias = hasNext || first.index === 0 ? 1 : -1',
    to: 'const bias = 1',
  },
  {
    set: 'operations',
    name: 'после удаления всегда выбирается предыдущий блок',
    from: 'const bias = hasNext || first.index === 0 ? 1 : -1',
    to: 'const bias = -1',
  },
  {
    set: 'operations',
    name: 'DOM-фокус не возвращается редактору после удаления',
    from: 'if (applied && editor.isInitialized && editor.view.dom.isConnected) editor.view.focus()',
    to: 'if (false && applied && editor.isInitialized && editor.view.dom.isConnected) editor.view.focus()',
  },
  {
    set: 'operations',
    name: 'цель перемещения не защищена от отрицательной позиции',
    from: 'if (!resolved || !Number.isInteger(target) || target < 0 || target > editor.state.doc.content.size) return false',
    to: 'if (!resolved || !Number.isInteger(target) || target > editor.state.doc.content.size) return false',
  },
  {
    set: 'operations',
    name: 'цель перемещения не ограничена размером документа',
    from: 'if (!resolved || !Number.isInteger(target) || target < 0 || target > editor.state.doc.content.size) return false',
    to: 'if (!resolved || !Number.isInteger(target) || target < 0) return false',
  },
  {
    set: 'operations',
    name: 'разрешена цель перемещения внутри самой группы',
    from: 'if (target >= resolved.from && target <= resolved.to) return false',
    to: 'if (false) return false',
  },
  {
    set: 'operations',
    name: 'проверка текстового родителя цели инвертирована',
    from: 'if ($target.parent.isTextblock || $target.parent.inlineContent) return false',
    to: 'if (!$target.parent.isTextblock && !$target.parent.inlineContent) return false',
  },
  {
    set: 'operations',
    name: 'предварительная проверка схемы отклоняет допустимые цели',
    from: 'if (!$target.parent.canReplace($target.index(), $target.index(), content)) return false',
    to: 'if ($target.parent.canReplace($target.index(), $target.index(), content)) return false',
  },
  {
    set: 'operations',
    name: 'цель после удаления источника не проходит через mapping',
    from: 'tr.insert(tr.mapping.map(target), content)',
    to: 'tr.insert(target, content)',
  },
  {
    set: 'operations',
    name: 'сбой подготовки транзакции пробрасывается наружу',
    from: `    } catch {\n      return null\n    }\n  })()`,
    to: `    } catch (error) {\n      throw error\n    }\n  })()`,
  },
  {
    set: 'operations',
    name: 'сбой подготовки перемещения сообщается как успех',
    from: 'if (!prepared) return false',
    to: 'if (!prepared) return true',
  },
  {
    set: 'operations',
    name: 'delete dispatch-ится до завершения подготовки перемещения',
    from: 'tr.delete(resolved.from, resolved.to)\n      tr.insert(tr.mapping.map(target), content)',
    to: 'tr.delete(resolved.from, resolved.to)\n      editor.view.dispatch(tr)\n      tr.insert(tr.mapping.map(target), content)',
  },
  {
    set: 'operations',
    name: 'применяется только часть подготовленных шагов перемещения',
    from: 'for (const step of prepared.steps) tr.step(step)',
    to: 'for (const step of prepared.steps.slice(1)) tr.step(step)',
  },
  {
    set: 'ui',
    name: 'drop target не поднимается из текста к границе блока',
    from: 'return dropPoint(editor.state.doc, mousePos, resolved.selection.content()) ?? mousePos',
    to: 'return mousePos',
  },
  {
    set: 'ui',
    name: 'mousePos drop не ограничен размером документа',
    from: 'if (!resolved || !Number.isInteger(mousePos) || mousePos < 0 || mousePos > editor.state.doc.content.size) return null',
    to: 'if (!resolved || !Number.isInteger(mousePos) || mousePos < 0) return null',
  },
  {
    set: 'ui',
    name: 'групповой drag требует совпадения захвата со всеми диапазонами',
    from: 'return resolved?.selection.ranges.some(range => range.$from.pos === pos) ? group : null',
    to: 'return resolved?.selection.ranges.every(range => range.$from.pos === pos) ? group : null',
  },
  {
    set: 'ui',
    name: 'mapping anchor использует обратную assoc',
    from: 'anchor: mapping.map(group.anchor, 1)',
    to: 'anchor: mapping.map(group.anchor, -1)',
  },
  {
    set: 'ui',
    name: 'mapping подменяет сохранённый anchor-узел',
    from: `    ...group,\n    anchor: mapping.map(group.anchor, 1),`,
    to: `    ...group,\n    anchorNode: group.headNode,\n    anchor: mapping.map(group.anchor, 1),`,
  },
  {
    set: 'ui',
    name: 'atom NodeSelection не входит в блочный режим по Esc',
    from: 'if (selection instanceof NodeSelection && selection.node.isBlock) return selection.from',
    to: 'if (false) return selection.from',
  },
  {
    set: 'ui',
    name: 'awareness не санитизирует отдельный atom NodeSelection',
    from: 'if (!(selection instanceof NodeRangeSelection) && !(selection instanceof NodeSelection)) return selection',
    to: 'if (!(selection instanceof NodeRangeSelection)) return selection',
  },
  {
    set: 'ui',
    name: 'awareness не ищет текстовый курсор перед atom в конце документа',
    from: `  return TextSelection.findFrom($anchor, 1, true)\n    ?? TextSelection.findFrom($anchor, -1, true)\n    ?? TextSelection.create(state.doc, selection.anchor, selection.anchor)`,
    to: `  return TextSelection.findFrom($anchor, 1, true)\n    ?? TextSelection.create(state.doc, selection.anchor, selection.anchor)`,
  },
  {
    set: 'ui',
    name: 'курсор после drop разрешён внутри исходной группы',
    from: 'if (target >= resolved.from && target <= resolved.to) return null',
    to: 'if (false) return null',
  },
  {
    set: 'ui',
    name: 'курсор после drop не учитывает удалённый исходный диапазон',
    from: 'return target > resolved.to ? target - (resolved.to - resolved.from) : target',
    to: 'return target',
  },
  {
    set: 'ui',
    name: 'после drop atom получает текстовый вместо NodeSelection',
    from: 'if (node?.isBlock && node.isAtom && NodeSelection.isSelectable(node)) {',
    to: 'if (node?.isBlock && !node.isAtom && NodeSelection.isSelectable(node)) {',
  },
  {
    set: 'ui',
    name: 'позиция курсора после drop не ограничена размером документа',
    from: 'if (!Number.isInteger(pos) || pos < 0 || pos >= editor.state.doc.content.size) return null',
    to: 'if (!Number.isInteger(pos) || pos < 0) return null',
  },
  {
    set: 'ui',
    name: 'Escape на захвате снимает группу независимо от клавиши и режима',
    from: "return group && key === 'Escape'",
    to: "return group || key === 'Escape'",
  },
]

const originals = {}
for (const [key, relative] of Object.entries(files)) {
  originals[key] = await readFile(path.join(appRoot, relative), 'utf8')
}

function runTests() {
  return spawnSync('npm', ['test', '--', ...testFiles], {
    cwd: sandbox,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
  })
}

await rm(sandbox, { recursive: true, force: true })
await mkdir(sandbox, { recursive: true })
await cp(appRoot, sandbox, {
  recursive: true,
  filter: source => {
    const relative = path.relative(appRoot, source)
    return !relative.split(path.sep).some(part => ['node_modules', 'dist', '.git', 'coverage', 'data', 'uploads'].includes(part))
  },
})
await symlink(path.join(appRoot, 'node_modules'), path.join(sandbox, 'node_modules'), 'dir')

const survivors = []
const totals = { operations: 0, ui: 0 }
const killed = { operations: 0, ui: 0 }

try {
  const baseline = runTests()
  if (baseline.status !== 0) {
    console.error(`${baseline.stdout ?? ''}${baseline.stderr ?? ''}`)
    throw new Error('Исходные тесты в sandbox не прошли; мутации не запускались')
  }
  console.log('Базовый прогон в sandbox: зелёный')

  for (const mutation of mutations) {
    totals[mutation.set] += 1
    for (const [key, relative] of Object.entries(files)) {
      await writeFile(path.join(sandbox, relative), originals[key])
    }
    const original = originals[mutation.set]
    const index = original.indexOf(mutation.from)
    if (index < 0 || index !== original.lastIndexOf(mutation.from)) {
      throw new Error(`Точка мутации не найдена или не уникальна: ${mutation.name}`)
    }
    const mutated = original.slice(0, index) + mutation.to + original.slice(index + mutation.from.length)
    await writeFile(path.join(sandbox, files[mutation.set]), mutated)

    const result = runTests()
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    if (process.env.MUTATION_DEBUG && mutation.name.includes(process.env.MUTATION_DEBUG)) console.log(output)
    const tests = output.match(/Tests\s+(.+)/)?.[1]?.trim() ?? `exit=${result.status}, signal=${result.signal ?? 'нет'}`
    if (result.status === 0) {
      survivors.push(mutation)
      console.log(`ВЫЖИЛ [${mutation.set}]: ${mutation.name} — ${tests}`)
    } else {
      killed[mutation.set] += 1
      console.log(`УБИТ  [${mutation.set}]: ${mutation.name} — ${tests}`)
    }
  }
} finally {
  await rm(sandbox, { recursive: true, force: true })
  for (const [key, relative] of Object.entries(files)) {
    const current = await readFile(path.join(appRoot, relative), 'utf8')
    if (current !== originals[key]) throw new Error(`Исходный файл изменился во время проверки: ${relative}`)
  }
}

for (const set of Object.keys(files)) {
  console.log(`ИТОГ [${set}]: убито ${killed[set]}/${totals[set]}, выжило ${totals[set] - killed[set]}`)
}
console.log(`Sandbox удалён: ${sandbox}`)
console.log('Исходные production-файлы не изменены')

if (survivors.length) {
  console.error(`\nВыживших мутаций: ${survivors.length}/${mutations.length}`)
  for (const mutation of survivors) console.error(`- [${mutation.set}] ${mutation.name}`)
  process.exit(1)
}
console.log(`\nВсе мутации убиты: ${mutations.length}/${mutations.length}`)
