import { cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sandbox = path.join(appRoot, '..', '.mutation-check-block-operations')
const target = path.join(sandbox, 'src/lib/block-operations.ts')

const mutations = [
  {
    name: 'пропущена проверка границы позиции',
    from: 'if (!Number.isInteger(pos) || pos < 0 || pos >= editor.state.doc.content.size) return false',
    to: 'if (!Number.isInteger(pos) || pos < 0) return false',
  },
  {
    name: 'позиция дубликата смещена внутрь следующего блока',
    from: 'insertContentAt(pos + node.nodeSize, node.toJSON())',
    to: 'insertContentAt(pos + node.nodeSize + 2, node.toJSON())',
  },
  {
    name: 'дубликат теряет тип и форматирование',
    from: 'insertContentAt(pos + node.nodeSize, node.toJSON())',
    to: "insertContentAt(pos + node.nodeSize, { type: 'paragraph' })",
  },
  {
    name: 'удаление имеет пустой диапазон',
    from: 'deleteRange({ from: pos, to: pos + node.nodeSize })',
    to: 'deleteRange({ from: pos, to: pos })',
  },
  {
    name: 'превращение пропускает неподдерживаемый блок',
    from: 'if (!node?.isTextblock) return false',
    to: 'if (false) return false',
  },
  {
    name: 'уровень заголовка всегда первый',
    from: 'Number(target.slice(1))',
    to: '1',
  },
  {
    name: 'типы списков перепутаны',
    from: "target === 'bullet' ? 'bulletList' : 'orderedList'",
    to: "target !== 'bullet' ? 'bulletList' : 'orderedList'",
  },
  {
    name: 'новая задача уже отмечена',
    from: 'attrs: { checked: false }',
    to: 'attrs: { checked: true }',
  },
  {
    name: 'блок кода теряет текст',
    from: 'text: node.textContent',
    to: "text: ''",
  },
]

await rm(sandbox, { recursive: true, force: true })
await mkdir(sandbox, { recursive: true })
await cp(appRoot, sandbox, {
  recursive: true,
  filter: source => {
    const relative = path.relative(appRoot, source)
    return !relative.split(path.sep).some(part => ['node_modules', 'dist', '.git', '.mutation-check-block-operations', 'data', 'uploads'].includes(part))
  },
})
await symlink(path.join(appRoot, 'node_modules'), path.join(sandbox, 'node_modules'), 'dir')

const original = await readFile(target, 'utf8')
const survivors = []

try {
  for (const mutation of mutations) {
    const index = original.indexOf(mutation.from)
    if (index < 0) throw new Error(`Не найдена точка мутации: ${mutation.name}`)
    const mutated = original.slice(0, index) + mutation.to + original.slice(index + mutation.from.length)
    await writeFile(target, mutated)
    const result = spawnSync('npm', ['test', '--', 'src/lib/block-operations.test.ts'], {
      cwd: sandbox,
      encoding: 'utf8',
      env: { ...process.env, CI: '1' },
    })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    const tests = output.match(/Tests\s+(.+)/)?.[1]?.trim() ?? 'результат не распознан'
    if (result.status === 0) {
      survivors.push(mutation.name)
      console.log(`ВЫЖИЛ: ${mutation.name} — ${tests}`)
    } else {
      console.log(`УБИТ:  ${mutation.name} — ${tests}`)
    }
  }
} finally {
  await rm(sandbox, { recursive: true, force: true })
}

if (survivors.length) {
  console.error(`\nВыживших мутаций: ${survivors.length}/${mutations.length}`)
  process.exit(1)
}
console.log(`\nВсе мутации убиты: ${mutations.length}/${mutations.length}`)
