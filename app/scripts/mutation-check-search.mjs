import { cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sandbox = path.join(appRoot, '..', '.mutation-check-search')
const files = {
  server: 'server/search.ts',
  gate: 'src/lib/search-state.ts',
  recent: 'src/lib/recent-pages.ts',
}
const testFiles = {
  server: ['server/app.test.ts'],
  gate: ['src/lib/search-state.test.ts'],
  recent: ['src/lib/recent-pages.test.ts'],
}

const mutations = [
  {
    set: 'server',
    name: 'отсутствует отказ при отсутствии membership',
    from: "if (!membership.rows[0]) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace не найден.')",
    to: "if (false) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace не найден.')",
  },
  {
    set: 'server',
    name: 'поиск не ограничен tenant',
    from: 'WHERE p.workspace_id = $1',
    to: 'WHERE $1 IS NOT NULL',
  },
  {
    set: 'server',
    name: 'отключено совпадение по названию',
    from: "lower(p.title) LIKE lower($3) ESCAPE '!'\n           OR lower(p.markdown)",
    to: "FALSE\n           OR lower(p.markdown)",
  },
  {
    set: 'server',
    name: 'отключено совпадение по содержимому',
    from: "OR lower(p.markdown) LIKE lower($3) ESCAPE '!'",
    to: "OR FALSE",
  },
  {
    set: 'server',
    name: 'не экранируется escape-символ !',
    from: ".replaceAll('!', '!!')",
    to: '',
  },
  {
    set: 'server',
    name: 'не экранируется %',
    from: ".replaceAll('%', '!%')",
    to: ".replaceAll('%', '%')",
  },
  {
    set: 'server',
    name: 'не экранируется _',
    from: ".replaceAll('_', '!_')",
    to: ".replaceAll('_', '_')",
  },
  {
    set: 'server',
    name: 'лимит увеличен с 20 до 21',
    from: 'LIMIT 20',
    to: 'LIMIT 21',
  },
  {
    set: 'server',
    name: 'совпадения в названии не имеют приоритета',
    from: 'ORDER BY matches.match_rank, matches.updated_at DESC, matches.id ASC',
    to: 'ORDER BY matches.updated_at DESC, matches.id ASC',
  },
  {
    set: 'server',
    name: 'дата внутри группы сортируется по возрастанию',
    from: 'ORDER BY matches.match_rank, matches.updated_at DESC, matches.id ASC',
    to: 'ORDER BY matches.match_rank, matches.updated_at ASC, matches.id ASC',
  },
  {
    set: 'server',
    name: 'id вместо стабилизации по возрастанию сортируется по убыванию',
    from: 'ORDER BY matches.match_rank, matches.updated_at DESC, matches.id ASC',
    to: 'ORDER BY matches.match_rank, matches.updated_at DESC, matches.id DESC',
  },
  {
    set: 'server',
    name: 'путь начинается с самой страницы вместо родителя',
    from: 'JOIN pages parent ON parent.id = matches.parent_id AND parent.workspace_id = $1',
    to: 'JOIN pages parent ON parent.id = matches.id AND parent.workspace_id = $1',
  },
  {
    set: 'server',
    name: 'путь собирается от ближайшего родителя к корню',
    from: "jsonb_agg(jsonb_build_object('id', id, 'title', title) ORDER BY depth DESC)",
    to: "jsonb_agg(jsonb_build_object('id', id, 'title', title) ORDER BY depth ASC)",
  },
  {
    set: 'gate',
    name: 'новый запрос не отменяет прежний fetch',
    from: 'begin() {\n      controller?.abort()',
    to: 'begin() {',
  },
  {
    set: 'gate',
    name: 'прежняя версия ответа считается актуальной',
    from: 'return candidate === version',
    to: 'return candidate <= version',
  },
  {
    set: 'gate',
    name: 'invalidate не отменяет fetch',
    from: 'invalidate() {\n      controller?.abort()\n      controller = null',
    to: 'invalidate() {\n      controller = null',
  },
  {
    set: 'gate',
    name: 'invalidate не меняет версию ответа',
    from: 'invalidate() {\n      controller?.abort()\n      controller = null\n      version += 1',
    to: 'invalidate() {\n      controller?.abort()\n      controller = null',
  },
  {
    set: 'recent',
    name: 'недавние не разделены по человеку',
    from: 'return `${STORAGE_PREFIX}${userId}:${workspaceId}`',
    to: 'return `${STORAGE_PREFIX}${workspaceId}`',
  },
  {
    set: 'recent',
    name: 'недавние не разделены по workspace',
    from: 'return `${STORAGE_PREFIX}${userId}:${workspaceId}`',
    to: 'return `${STORAGE_PREFIX}${userId}`',
  },
  {
    set: 'recent',
    name: 'лимит недавних увеличен с 10 до 11',
    from: 'const RECENT_PAGES_LIMIT = 10',
    to: 'const RECENT_PAGES_LIMIT = 11',
  },
]

const originals = {}
for (const [key, relative] of Object.entries(files)) {
  originals[key] = await readFile(path.join(appRoot, relative), 'utf8')
}

function runTests(sets) {
  return spawnSync(process.execPath, [
    'node_modules/vitest/vitest.mjs',
    'run',
    ...sets.flatMap(set => testFiles[set]),
  ], {
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
    return !relative.split(path.sep).some(part => ['node_modules', 'dist', '.git', 'coverage', 'data', 'uploads', '.mutation-check-search'].includes(part))
  },
})
await symlink(path.join(appRoot, 'node_modules'), path.join(sandbox, 'node_modules'), 'dir')

const survivors = []
const totals = Object.fromEntries(Object.keys(files).map(key => [key, 0]))
const killed = Object.fromEntries(Object.keys(files).map(key => [key, 0]))

try {
  const baseline = runTests(Object.keys(files))
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

    const result = runTests([mutation.set])
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
