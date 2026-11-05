import { z } from 'zod'
import type { Database } from './db/index.js'
import { AppError } from './errors.js'

export const searchSchema = z.object({
  workspaceId: z.string().uuid(),
  q: z.string().trim().min(1).max(200),
})

interface SearchPathItem {
  id: string
  title: string
}

interface SearchRow {
  id: string
  title: string
  icon: string | null
  is_project: boolean
  markdown: string
  updated_at: string
  match_rank: number
  path: SearchPathItem[]
}

function likePattern(query: string) {
  return `%${query.replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_')}%`
}

function snippet(markdown: string, query: string) {
  const matchIndex = markdown.toLowerCase().indexOf(query.toLowerCase())
  if (matchIndex < 0) return markdown.replace(/\s+/g, ' ').trim().slice(0, 160)

  const start = Math.max(0, matchIndex - 48)
  const end = Math.min(markdown.length, matchIndex + query.length + 112)
  const text = markdown.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${text}${end < markdown.length ? '…' : ''}`
}

export async function searchPages(
  database: Database,
  userId: string,
  input: z.infer<typeof searchSchema>,
) {
  const membership = await database.query(
    'SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2',
    [input.workspaceId, userId],
  )
  if (!membership.rows[0]) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace не найден.')

  const result = await database.query<SearchRow>(
    `WITH RECURSIVE matches AS MATERIALIZED (
       SELECT p.id, p.parent_id, p.title, p.icon, p.is_project, p.markdown, p.updated_at,
         CASE WHEN lower(p.title) LIKE lower($3) ESCAPE '!' THEN 0 ELSE 1 END AS match_rank
       FROM pages p
       JOIN memberships m ON m.workspace_id = p.workspace_id AND m.user_id = $2
       WHERE p.workspace_id = $1
         AND (
           lower(p.title) LIKE lower($3) ESCAPE '!'
           OR lower(p.markdown) LIKE lower($3) ESCAPE '!'
         )
       ORDER BY match_rank, p.updated_at DESC, p.id ASC
       LIMIT 20
     ), ancestors AS (
       SELECT matches.id AS result_id, parent.id, parent.title, parent.parent_id, 0 AS depth
       FROM matches
       JOIN pages parent ON parent.id = matches.parent_id AND parent.workspace_id = $1
       UNION ALL
       SELECT ancestors.result_id, parent.id, parent.title, parent.parent_id, ancestors.depth + 1
       FROM ancestors
       JOIN pages parent ON parent.id = ancestors.parent_id AND parent.workspace_id = $1
     ), paths AS (
       SELECT result_id, jsonb_agg(jsonb_build_object('id', id, 'title', title) ORDER BY depth DESC) AS path
       FROM ancestors
       GROUP BY result_id
     )
     SELECT matches.id, matches.title, matches.icon, matches.is_project, matches.markdown,
       matches.updated_at, matches.match_rank, COALESCE(paths.path, '[]'::jsonb) AS path
     FROM matches
     LEFT JOIN paths ON paths.result_id = matches.id
     ORDER BY matches.match_rank, matches.updated_at DESC, matches.id ASC`,
    [input.workspaceId, userId, likePattern(input.q)],
  )

  return {
    query: input.q,
    results: result.rows.map(row => ({
      id: row.id,
      title: row.title,
      icon: row.icon,
      isProject: row.is_project,
      path: row.path,
      snippet: snippet(row.markdown, input.q),
      matchedIn: Number(row.match_rank) === 0 ? 'title' as const : 'content' as const,
      updatedAt: row.updated_at,
    })),
  }
}
