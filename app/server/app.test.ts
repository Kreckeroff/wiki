import { afterEach, describe, expect, it } from 'vitest'
import request, { type Agent } from 'supertest'
import { v7 as uuidv7 } from 'uuid'
import { createApplication, type ApplicationContext } from './app.js'

const contexts: ApplicationContext[] = []

interface SearchResultId {
  id: string
}

async function setup(registrationEnabled = true) {
  const context = await createApplication({ registrationEnabled, inMemory: true })
  contexts.push(context)
  return context
}

async function register(context: ApplicationContext, email = 'owner@example.com') {
  const agent = request.agent(context.app)
  const response = await agent.post('/api/auth/register').send({
    name: 'Владелец',
    email,
    password: 'correct horse battery staple',
  })
  expect(response.status).toBe(201)
  return { agent, body: response.body }
}

function csrf(body: any) {
  return { 'x-csrf-token': body.csrfToken as string }
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(context => context.close()))
})

describe('учётная запись и workspace', () => {
  it('атомарно создаёт человека, workspace, владельца и первый проект', async () => {
    const context = await setup()
    const { body } = await register(context)

    expect(body.user.email).toBe('owner@example.com')
    expect(body.workspaces).toHaveLength(1)
    expect(body.pages).toHaveLength(1)
    expect(body.pages[0].isProject).toBe(true)

    const users = await context.db.query('SELECT email, password_hash FROM users')
    const memberships = await context.db.query('SELECT role FROM memberships')
    expect(users.rows).toHaveLength(1)
    expect(users.rows[0].password_hash).not.toContain('correct horse')
    expect(memberships.rows[0].role).toBe('owner')
  })

  it('не раскрывает, существует ли почта, и позволяет выйти', async () => {
    const context = await setup()
    const { agent, body } = await register(context)

    const missing = await agent.post('/api/auth/login').send({ email: 'none@example.com', password: 'wrong password' })
    const wrong = await agent.post('/api/auth/login').send({ email: 'owner@example.com', password: 'wrong password' })
    expect(missing.status).toBe(401)
    expect(wrong.status).toBe(401)
    expect(missing.body.error.code).toBe(wrong.body.error.code)
    expect(missing.body.error.message).toBe(wrong.body.error.message)

    expect((await agent.post('/api/auth/logout').set('x-csrf-token', body.csrfToken).send()).status).toBe(204)
    expect((await agent.get('/api/bootstrap')).status).toBe(401)
  })

  it('выключает только регистрацию', async () => {
    const context = await setup(false)
    const denied = await request(context.app).post('/api/auth/register').send({
      name: 'Новый', email: 'new@example.com', password: 'long enough password',
    })
    expect(denied.status).toBe(403)
    expect(denied.body.error.code).toBe('REGISTRATION_DISABLED')
  })

  it('нормализует почту и не создаёт дубликат', async () => {
    const context = await setup()
    await register(context, 'Owner@Example.com')
    const duplicate = await request(context.app).post('/api/auth/register').send({
      name: 'Другой', email: 'owner@example.COM', password: 'another long password',
    })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.error.code).toBe('EMAIL_TAKEN')
  })
})

describe('дерево страниц', () => {
  it('создаёт страницу один раз при повторе ключа', async () => {
    const context = await setup()
    const { agent, body } = await register(context)
    const payload = {
      workspaceId: body.workspaces[0].id,
      parentId: body.pages[0].id,
      title: 'План запуска',
    }
    const headers = { ...csrf(body), 'idempotency-key': 'create-page-1' }

    const first = await agent.post('/api/pages').set(headers).send(payload)
    const replay = await agent.post('/api/pages').set(headers).send(payload)
    expect(first.status).toBe(201)
    expect(replay.status).toBe(200)
    expect(replay.body.id).toBe(first.body.id)
    const pages = await context.db.query('SELECT id FROM pages WHERE title = $1', ['План запуска'])
    expect(pages.rows).toHaveLength(1)
  })

  it('обновляет название и оформление страницы', async () => {
    const context = await setup()
    const { agent, body } = await register(context)
    const pageId = body.pages[0].id
    const renamed = await agent.patch(`/api/pages/${pageId}`).set(csrf(body)).send({ title: 'Новое название' })
    expect(renamed.status).toBe(200)
    expect(renamed.body.title).toBe('Новое название')
    const appearance = await agent.patch(`/api/pages/${pageId}`).set(csrf(body)).send({ icon: '◈', coverUrl: null })
    expect(appearance.status).toBe(200)
    expect(appearance.body.icon).toBe('◈')
  })

  it('переносит и упорядочивает, но запрещает цикл', async () => {
    const context = await setup()
    const { agent, body } = await register(context)
    const workspaceId = body.workspaces[0].id
    const rootId = body.pages[0].id
    const create = async (title: string) => (await agent.post('/api/pages')
      .set(csrf(body)).send({ workspaceId, parentId: rootId, title })).body

    const first = await create('Первая')
    const second = await create('Вторая')
    const moved = await agent.post(`/api/pages/${second.id}/move`).set(csrf(body)).send({ parentId: first.id, index: 0 })
    expect(moved.status).toBe(200)
    expect(moved.body.parentId).toBe(first.id)

    const cycle = await agent.post(`/api/pages/${first.id}/move`).set(csrf(body)).send({ parentId: second.id, index: 0 })
    expect(cycle.status).toBe(409)
    expect(cycle.body.error.code).toBe('TREE_CYCLE')

    const unchanged = await agent.get('/api/bootstrap').query({ workspaceId })
    expect(unchanged.body.pages.find((page: any) => page.id === first.id).parentId).toBe(rootId)
  })

  it('закрывает чужой workspace и возвращает 404', async () => {
    const context = await setup()
    const owner = await register(context, 'owner@example.com')
    const outsider = await register(context, 'outsider@example.com')

    const denied = await outsider.agent.patch(`/api/pages/${owner.body.pages[0].id}`)
      .set(csrf(outsider.body)).send({ title: 'Чужое' })
    expect(denied.status).toBe(404)
    expect(denied.body.error.code).toBe('PAGE_NOT_FOUND')
  })
})

async function insertSearchPage(context: ApplicationContext, input: {
  workspaceId: string
  userId: string
  title: string
  parentId?: string | null
  markdown?: string
  icon?: string | null
  updatedAt?: string
}) {
  const id = uuidv7()
  await context.db.query(
    `INSERT INTO pages (id, workspace_id, parent_id, title, icon, markdown, position, is_project, created_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 1000, $7, $8, $9::timestamptz)`,
    [
      id,
      input.workspaceId,
      input.parentId ?? null,
      input.title,
      input.icon ?? null,
      input.markdown ?? '',
      !input.parentId,
      input.userId,
      input.updatedAt ?? '2026-11-05T12:00:00.000Z',
    ],
  )
  return id
}

describe('поиск страниц', () => {
  it('ищет без учёта регистра по названию и тексту, обрезает q и возвращает путь и ограниченный DTO', async () => {
    const context = await setup()
    const { agent, body } = await register(context)
    const workspaceId = body.workspaces[0].id
    const rootId = body.pages[0].id
    const parentId = await insertSearchPage(context, {
      workspaceId,
      userId: body.user.id,
      parentId: rootId,
      title: 'Квантовый запуск',
      icon: '◈',
      updatedAt: '2026-11-05T12:00:00.000Z',
    })
    const contentId = await insertSearchPage(context, {
      workspaceId,
      userId: body.user.id,
      parentId,
      title: 'Черновик',
      markdown: 'Перед запуском сверить КВАНТОВЫЙ список. Полный Markdown не должен попасть в DTO.',
      updatedAt: '2026-11-05T13:00:00.000Z',
    })

    const response = await agent.get('/api/search').query({ workspaceId, q: '  кВаНт  ' })

    expect(response.status).toBe(200)
    expect(response.body.query).toBe('кВаНт')
    expect(response.body.results.map((result: any) => result.id)).toEqual([parentId, contentId])
    expect(response.body.results[0].matchedIn).toBe('title')
    const content = response.body.results[1]
    expect(content.matchedIn).toBe('content')
    expect(content.snippet).toContain('КВАНТОВЫЙ')
    expect(content.path).toEqual([
      { id: rootId, title: 'Мой первый проект' },
      { id: parentId, title: 'Квантовый запуск' },
    ])
    expect(Object.keys(content).sort()).toEqual([
      'icon', 'id', 'isProject', 'matchedIn', 'path', 'snippet', 'title', 'updatedAt',
    ])
    expect(content).not.toHaveProperty('markdown')
    expect(content).not.toHaveProperty('yjs_state')
  })

  it('обрабатывает %, _ и ! как литеральные символы', async () => {
    const context = await setup()
    const { agent, body } = await register(context)
    const workspaceId = body.workspaces[0].id
    const common = { workspaceId, userId: body.user.id }
    const percentId = await insertSearchPage(context, { ...common, title: '100% готово' })
    await insertSearchPage(context, { ...common, title: '100 готово' })
    const underscoreId = await insertSearchPage(context, { ...common, title: 'черновик_2' })
    await insertSearchPage(context, { ...common, title: 'черновик 2' })
    const escapeId = await insertSearchPage(context, { ...common, title: 'Важно!' })
    await insertSearchPage(context, { ...common, title: 'Важно' })

    const percent = await agent.get('/api/search').query({ workspaceId, q: '%' })
    const underscore = await agent.get('/api/search').query({ workspaceId, q: '_' })
    const escape = await agent.get('/api/search').query({ workspaceId, q: '!' })

    expect(percent.status).toBe(200)
    expect(percent.body.results.map((result: SearchResultId) => result.id)).toEqual([percentId])
    expect(underscore.status).toBe(200)
    expect(underscore.body.results.map((result: SearchResultId) => result.id)).toEqual([underscoreId])
    expect(escape.status).toBe(200)
    expect(escape.body.results.map((result: SearchResultId) => result.id)).toEqual([escapeId])
  })

  it('не интерпретирует OR, кавычки и минус как операторы', async () => {
    const context = await setup()
    const { agent, body } = await register(context)
    const workspaceId = body.workspaces[0].id
    const common = { workspaceId, userId: body.user.id }
    const orId = await insertSearchPage(context, { ...common, title: 'План OR черновик' })
    await insertSearchPage(context, { ...common, title: 'План' })
    await insertSearchPage(context, { ...common, title: 'Черновик' })
    const quotedId = await insertSearchPage(context, { ...common, title: 'Совсем "точно"' })
    await insertSearchPage(context, { ...common, title: 'Совсем точно' })
    const minusId = await insertSearchPage(context, { ...common, title: 'Задача -срочно' })
    await insertSearchPage(context, { ...common, title: 'Задача срочно' })

    const or = await agent.get('/api/search').query({ workspaceId, q: 'OR' })
    const quoted = await agent.get('/api/search').query({ workspaceId, q: '"точно"' })
    const minus = await agent.get('/api/search').query({ workspaceId, q: '-срочно' })

    expect(or.body.results.map((result: SearchResultId) => result.id)).toEqual([orId])
    expect(quoted.body.results.map((result: SearchResultId) => result.id)).toEqual([quotedId])
    expect(minus.body.results.map((result: SearchResultId) => result.id)).toEqual([minusId])
  })

  it('ставит совпадения в названии первыми и сортирует группы по updatedAt DESC и id', async () => {
    const context = await setup()
    const { agent, body } = await register(context)
    const workspaceId = body.workspaces[0].id
    const common = { workspaceId, userId: body.user.id }
    const sameTime = '2026-11-05T13:00:00.000Z'
    const tiedTitleIds = [
      await insertSearchPage(context, { ...common, title: 'Ранг один', updatedAt: sameTime }),
      await insertSearchPage(context, { ...common, title: 'Ранг два', updatedAt: sameTime }),
    ].sort()
    const olderTitleId = await insertSearchPage(context, { ...common, title: 'Ранг старый', updatedAt: '2026-11-05T12:00:00.000Z' })
    const contentId = await insertSearchPage(context, { ...common, title: 'Документ', markdown: 'Свежий текст со словом РАНГ', updatedAt: '2026-11-05T14:00:00.000Z' })

    const response = await agent.get('/api/search').query({ workspaceId, q: 'ранг' })

    expect(response.status).toBe(200)
    expect(response.body.results.map((result: SearchResultId) => result.id)).toEqual([
      ...tiedTitleIds,
      olderTitleId,
      contentId,
    ])
  })

  it('возвращает не более 20 результатов', async () => {
    const context = await setup()
    const { agent, body } = await register(context)
    const workspaceId = body.workspaces[0].id
    for (let index = 0; index < 22; index += 1) {
      await insertSearchPage(context, {
        workspaceId,
        userId: body.user.id,
        title: `Общий результат ${index}`,
        updatedAt: `2026-11-05T12:${String(index).padStart(2, '0')}:00.000Z`,
      })
    }

    const response = await agent.get('/api/search').query({ workspaceId, q: 'общий' })

    expect(response.status).toBe(200)
    expect(response.body.results).toHaveLength(20)
    expect(new Set(response.body.results.map((result: SearchResultId) => result.id)).size).toBe(20)
  })

  it('пускает участника, возвращает 404 для чужого workspace и 401 без сессии', async () => {
    const context = await setup()
    const owner = await register(context, 'owner@example.com')
    const outsider = await register(context, 'outsider@example.com')
    const workspaceId = owner.body.workspaces[0].id
    const pageId = await insertSearchPage(context, {
      workspaceId,
      userId: owner.body.user.id,
      title: 'Доступная страница',
    })
    await insertSearchPage(context, {
      workspaceId: outsider.body.workspaces[0].id,
      userId: outsider.body.user.id,
      title: 'Доступная страница чужого workspace',
    })

    const allowed = await owner.agent.get('/api/search').query({ workspaceId, q: 'доступная' })
    const denied = await outsider.agent.get('/api/search').query({ workspaceId, q: 'доступная' })
    const anonymous = await request(context.app).get('/api/search').query({ workspaceId, q: 'доступная' })

    expect(allowed.status).toBe(200)
    expect(allowed.body.results.map((result: SearchResultId) => result.id)).toEqual([pageId])
    expect(denied.status).toBe(404)
    expect(denied.body.error.code).toBe('WORKSPACE_NOT_FOUND')
    expect(denied.body).not.toHaveProperty('results')
    expect(anonymous.status).toBe(401)
  })

  it('проверяет q и workspaceId на границе API', async () => {
    const context = await setup()
    const { agent, body } = await register(context)
    const workspaceId = body.workspaces[0].id

    const blank = await agent.get('/api/search').query({ workspaceId, q: '   ' })
    const long = await agent.get('/api/search').query({ workspaceId, q: 'а'.repeat(201) })
    const invalidWorkspace = await agent.get('/api/search').query({ workspaceId: 'not-a-uuid', q: 'текст' })

    expect(blank.status).toBe(400)
    expect(blank.body.error.code).toBe('INVALID_INPUT')
    expect(long.status).toBe(400)
    expect(invalidWorkspace.status).toBe(400)
  })
})
