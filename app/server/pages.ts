import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import type { Database } from './db/index.js'
import { AppError } from './errors.js'
import { markdownToYjs } from '../shared/editor.js'
import { toPageDto, type PageDto, type PageRecord } from './types.js'

export const createPageSchema = z.object({
  workspaceId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(500).default('Новая страница'),
})

export const updatePageSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  icon: z.string().trim().max(200).nullable().optional(),
  coverUrl: z.string().trim().max(2000).refine(value => /^(https:\/\/|http:\/\/|\/uploads\/)/.test(value), 'INVALID_URL').nullable().optional(),
}).strict()

export const movePageSchema = z.object({
  parentId: z.string().uuid().nullable(),
  index: z.number().int().min(0).max(100000),
})

export async function listPages(database: Database, workspaceId: string, userId: string): Promise<PageDto[]> {
  const result = await database.query<PageRecord>(
    `SELECT p.* FROM pages p
     JOIN memberships m ON m.workspace_id = p.workspace_id AND m.user_id = $2
     WHERE p.workspace_id = $1 ORDER BY p.parent_id NULLS FIRST, p.position, p.created_at`,
    [workspaceId, userId],
  )
  return result.rows.map(toPageDto)
}

export async function getAuthorizedPage(database: Database, pageId: string, userId: string): Promise<PageRecord> {
  const result = await database.query<PageRecord>(
    `SELECT p.* FROM pages p
     JOIN memberships m ON m.workspace_id = p.workspace_id AND m.user_id = $2
     WHERE p.id = $1`,
    [pageId, userId],
  )
  const page = result.rows[0]
  if (!page) throw new AppError(404, 'PAGE_NOT_FOUND', 'Страница не найдена.')
  return page
}

export async function createPage(
  database: Database,
  userId: string,
  input: z.infer<typeof createPageSchema>,
  markdown = '',
): Promise<PageDto> {
  const parentId = input.parentId ?? null
  const membership = await database.query(
    'SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2',
    [input.workspaceId, userId],
  )
  if (!membership.rows[0]) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace не найден.')

  if (parentId) {
    const parent = await database.query<PageRecord>(
      'SELECT id FROM pages WHERE id = $1 AND workspace_id = $2',
      [parentId, input.workspaceId],
    )
    if (!parent.rows[0]) throw new AppError(404, 'PARENT_NOT_FOUND', 'Родительская страница не найдена.')
  }

  const id = uuidv7()
  const result = await database.query<PageRecord>(
    `INSERT INTO pages (id, workspace_id, parent_id, title, position, is_project, yjs_state, markdown, created_by)
     SELECT $1, $2, $3, $4, COALESCE(MAX(position), 0) + 1000, $5, $6, $7, $8
     FROM pages WHERE workspace_id = $2 AND parent_id IS NOT DISTINCT FROM $3
     RETURNING *`,
    [id, input.workspaceId, parentId, input.title, parentId === null, markdownToYjs(markdown), markdown, userId],
  )
  return toPageDto(result.rows[0])
}

export async function updatePage(
  database: Database,
  userId: string,
  pageId: string,
  input: z.infer<typeof updatePageSchema>,
): Promise<PageDto> {
  await getAuthorizedPage(database, pageId, userId)
  const result = await database.query<PageRecord>(
    `UPDATE pages SET
       title = COALESCE($2::text, title),
       icon = CASE WHEN $3::boolean THEN $4::text ELSE icon END,
       cover_url = CASE WHEN $5::boolean THEN $6::text ELSE cover_url END,
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [pageId, input.title ?? null, input.icon !== undefined, input.icon ?? null, input.coverUrl !== undefined, input.coverUrl ?? null],
  )
  return toPageDto(result.rows[0])
}

export async function movePage(
  database: Database,
  userId: string,
  pageId: string,
  input: z.infer<typeof movePageSchema>,
): Promise<PageDto> {
  return database.transaction(async transaction => {
    const page = await getAuthorizedPage(transaction, pageId, userId)
    await transaction.query('SELECT pg_advisory_xact_lock(hashtext($1))', [page.workspace_id])

    if (input.parentId === pageId) throw new AppError(409, 'TREE_CYCLE', 'Нельзя переместить страницу внутрь самой себя.')
    if (input.parentId) {
      const parent = await transaction.query<PageRecord>(
        `SELECT p.id FROM pages p
         JOIN memberships m ON m.workspace_id = p.workspace_id AND m.user_id = $2
         WHERE p.id = $1 AND p.workspace_id = $3`,
        [input.parentId, userId, page.workspace_id],
      )
      if (!parent.rows[0]) throw new AppError(404, 'PARENT_NOT_FOUND', 'Родительская страница не найдена.')

      const cycle = await transaction.query(
        `WITH RECURSIVE descendants AS (
           SELECT id, parent_id FROM pages WHERE id = $1
           UNION ALL
           SELECT p.id, p.parent_id FROM pages p JOIN descendants d ON p.parent_id = d.id
         ) SELECT 1 FROM descendants WHERE id = $2`,
        [pageId, input.parentId],
      )
      if (cycle.rows[0]) throw new AppError(409, 'TREE_CYCLE', 'Нельзя переместить страницу внутрь самой себя.')
    }

    const siblings = await transaction.query<PageRecord>(
      `SELECT id FROM pages WHERE workspace_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND id <> $3
       ORDER BY position, created_at`,
      [page.workspace_id, input.parentId, pageId],
    )
    const ids = siblings.rows.map(row => row.id)
    ids.splice(Math.min(input.index, ids.length), 0, pageId)
    for (let index = 0; index < ids.length; index += 1) {
      await transaction.query(
        'UPDATE pages SET parent_id = $2, position = $3, is_project = $4, updated_at = now() WHERE id = $1',
        [ids[index], input.parentId, (index + 1) * 1000, input.parentId === null],
      )
    }
    const moved = await transaction.query<PageRecord>('SELECT * FROM pages WHERE id = $1', [pageId])
    return toPageDto(moved.rows[0])
  })
}
