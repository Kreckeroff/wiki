import { performance } from 'node:perf_hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { v7 as uuidv7 } from 'uuid'
import { createApplication, type ApplicationContext } from './app.js'

const contexts: ApplicationContext[] = []

interface SearchResultId {
  id: string
}

interface ExplainPlan {
  Plans?: ExplainPlan[]
  'Actual Rows'?: number
  'Actual Total Time'?: number
  'Node Type'?: string
}

interface ExplainRow {
  'QUERY PLAN': Array<{ Plan: ExplainPlan }>
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(contexts.splice(0).map(context => context.close()))
})

function planNodes(plan: ExplainPlan): ExplainPlan[] {
  return [plan, ...(plan.Plans ?? []).flatMap(child => planNodes(child))]
}

describe('нагрузочный сценарий поиска', () => {
  it('на 1000 страницах ограничивает DTO, сохраняет порядок и пути и выполняет постоянное число SQL-запросов', async () => {
    const context = await createApplication({ inMemory: true })
    contexts.push(context)
    const agent = request.agent(context.app)
    const registration = await agent.post('/api/auth/register').send({
      name: 'Владелец',
      email: 'load@example.com',
      password: 'correct horse battery staple',
    })
    expect(registration.status).toBe(201)
    const workspaceId = registration.body.workspaces[0].id as string
    const userId = registration.body.user.id as string
    const rootId = registration.body.pages[0].id as string
    const parentId = uuidv7()
    const branchId = uuidv7()
    const records = [
      {
        id: parentId,
        workspace_id: workspaceId,
        parent_id: rootId,
        title: 'Корпус',
        markdown: 'Служебный узел',
        position: 1,
        is_project: false,
        created_by: userId,
        updated_at: '2026-11-04T12:00:00.000Z',
      },
      {
        id: branchId,
        workspace_id: workspaceId,
        parent_id: parentId,
        title: 'Раздел',
        markdown: 'Служебный раздел',
        position: 2,
        is_project: false,
        created_by: userId,
        updated_at: '2026-11-04T12:00:00.000Z',
      },
      ...Array.from({ length: 998 }, (_, index) => ({
        id: uuidv7(),
        workspace_id: workspaceId,
        parent_id: branchId,
        title: `Нагрузка ${String(index).padStart(4, '0')}`,
        markdown: `${index === 0 ? 'уникальный-текст ' : ''}Текст страницы ${index}. ${'Материал корпуса. '.repeat(12)}FULL-MARKDOWN-MARKER-${index}`,
        position: index + 3,
        is_project: false,
        created_by: userId,
        updated_at: new Date(Date.UTC(2026, 10, 5, 12, 0, index)).toISOString(),
      })),
    ]
    expect(records).toHaveLength(1000)

    await context.db.query(
      `INSERT INTO pages (id, workspace_id, parent_id, title, markdown, position, is_project, created_by, updated_at)
       SELECT id, workspace_id, parent_id, title, markdown, position, is_project, created_by, updated_at
       FROM jsonb_to_recordset($1::jsonb) AS page(
         id uuid, workspace_id uuid, parent_id uuid, title text, markdown text,
         position double precision, is_project boolean, created_by uuid, updated_at timestamptz
       )`,
      [JSON.stringify(records)],
    )
    await context.db.query('ANALYZE pages')

    const querySpy = vi.spyOn(context.db, 'query')
    const startedAt = performance.now()
    const first = await agent.get('/api/search').query({ workspaceId, q: 'нагрузка' })
    const firstDurationMs = performance.now() - startedAt
    const firstHttpQueryCount = querySpy.mock.calls.length
    const searchCall = querySpy.mock.calls.find(([text]) => text.includes('WITH RECURSIVE matches'))
    expect(searchCall).toBeDefined()

    const repeatedStartedAt = performance.now()
    const repeated = await agent.get('/api/search').query({ workspaceId, q: 'нагрузка' })
    const repeatedDurationMs = performance.now() - repeatedStartedAt
    const repeatedHttpQueryCount = querySpy.mock.calls.length - firstHttpQueryCount

    const uniqueStartedAt = performance.now()
    const unique = await agent.get('/api/search').query({ workspaceId, q: 'уникальный-текст' })
    const uniqueDurationMs = performance.now() - uniqueStartedAt
    const uniqueHttpQueryCount = querySpy.mock.calls.length - firstHttpQueryCount - repeatedHttpQueryCount

    expect(first.status).toBe(200)
    expect(first.body.results).toHaveLength(20)
    expect(repeated.body.results.map((result: SearchResultId) => result.id)).toEqual(first.body.results.map((result: SearchResultId) => result.id))
    const expectedIds = records.slice(2).sort((left, right) => (
      right.updated_at.localeCompare(left.updated_at) || left.id.localeCompare(right.id)
    )).slice(0, 20).map(record => record.id)
    expect(first.body.results.map((result: SearchResultId) => result.id)).toEqual(expectedIds)
    expect(unique.status).toBe(200)
    expect(unique.body.results).toHaveLength(1)
    expect(unique.body.results[0].id).toBe(records[2].id)
    expect(unique.body.results[0].matchedIn).toBe('content')

    const expectedPath = [
      { id: rootId, title: 'Мой первый проект' },
      { id: parentId, title: 'Корпус' },
      { id: branchId, title: 'Раздел' },
    ]
    for (const result of [...first.body.results, ...unique.body.results]) {
      expect(result.path).toEqual(expectedPath)
      expect(Object.keys(result).sort()).toEqual([
        'icon', 'id', 'isProject', 'matchedIn', 'path', 'snippet', 'title', 'updatedAt',
      ])
    }
    const serializedResponse = JSON.stringify(first.body)
    expect(serializedResponse).not.toContain('FULL-MARKDOWN-MARKER')
    expect(serializedResponse).not.toContain('yjs_state')
    expect(Buffer.byteLength(serializedResponse)).toBeLessThan(20_000)

    expect(firstHttpQueryCount).toBe(4)
    expect(repeatedHttpQueryCount).toBe(firstHttpQueryCount)
    expect(uniqueHttpQueryCount).toBe(firstHttpQueryCount)
    const searchQueryCount = querySpy.mock.calls.filter(([text]) => (
      text.includes('WITH RECURSIVE matches') || text.includes('SELECT 1 FROM memberships')
    )).length
    expect(searchQueryCount).toBe(6)

    const explain = await context.db.query<ExplainRow>(
      `EXPLAIN (ANALYZE, FORMAT JSON) ${searchCall![0]}`,
      searchCall![1],
    )
    const rootPlan = explain.rows[0]['QUERY PLAN'][0].Plan
    const nodes = planNodes(rootPlan)
    expect(nodes.length).toBeGreaterThan(1)
    expect(rootPlan['Actual Rows']).toBe(20)

    console.info('[search-load]', JSON.stringify({
      pages: records.length,
      results: first.body.results.length,
      responseBytes: Buffer.byteLength(serializedResponse),
      httpQueriesPerRequest: firstHttpQueryCount,
      searchQueriesPerRequest: 2,
      durationsMs: {
        first: Number(firstDurationMs.toFixed(1)),
        repeated: Number(repeatedDurationMs.toFixed(1)),
        unique: Number(uniqueDurationMs.toFixed(1)),
      },
      explain: {
        executionMs: rootPlan['Actual Total Time'],
        rootNode: rootPlan['Node Type'],
        nodes: [...new Set(nodes.map(node => node['Node Type']))],
      },
    }))
  }, 30_000)
})
