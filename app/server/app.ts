import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileTypeFromBuffer } from 'file-type'
import { v7 as uuidv7 } from 'uuid'
import express, { type Express } from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { z } from 'zod'
import { createDatabase, type Database } from './db/index.js'
import { AppError, errorHandler } from './errors.js'
import { httpLogger } from './logger.js'
import {
  authenticateRequest,
  clearSessionCookie,
  createSession,
  destroySession,
  hashPassword,
  LOGIN_ERROR,
  loginSchema,
  normalizeEmail,
  registerSchema,
  requireCsrf,
  setSessionCookie,
  verifyPassword,
} from './auth.js'
import { WELCOME_MARKDOWN, yjsToMarkdown } from '../shared/editor.js'
import {
  createPage,
  createPageSchema,
  getAuthorizedPage,
  listPages,
  movePage,
  movePageSchema,
  updatePage,
  updatePageSchema,
} from './pages.js'
import { searchPages, searchSchema } from './search.js'
import type { PageDto, UserRecord } from './types.js'

export interface ApplicationContext {
  app: Express
  db: Database
  close: () => Promise<void>
}

interface ApplicationOptions {
  registrationEnabled?: boolean
  inMemory?: boolean
  database?: Database
}

interface WorkspaceRow {
  id: string
  name: string
  role: string
}

const DUMMY_PASSWORD_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

function publicUser(user: UserRecord) {
  const palette = ['#26735b', '#9b5c37', '#5368a6', '#a34f67', '#7860a8']
  const index = Number.parseInt(user.id.replaceAll('-', '').slice(0, 8), 16) % palette.length
  return { id: user.id, name: user.name, email: user.email, color: palette[index] }
}

async function bootstrapPayload(database: Database, user: UserRecord, csrfToken: string, requestedWorkspace?: unknown) {
  const workspaces = await database.query<WorkspaceRow>(
    `SELECT w.id, w.name, m.role FROM workspaces w
     JOIN memberships m ON m.workspace_id = w.id
     WHERE m.user_id = $1 ORDER BY w.created_at, w.id`,
    [user.id],
  )
  const requested = typeof requestedWorkspace === 'string' ? requestedWorkspace : undefined
  const current = workspaces.rows.find(workspace => workspace.id === requested) ?? workspaces.rows[0]
  const pages = current ? await listPages(database, current.id, user.id) : []
  return {
    user: publicUser(user),
    workspaces: workspaces.rows,
    currentWorkspaceId: current?.id ?? null,
    pages,
    csrfToken,
    registrationEnabled: undefined,
  }
}

async function idempotent<T extends PageDto | { workspace: unknown; page: PageDto }>(
  database: Database,
  userId: string,
  key: string | undefined,
  payload: unknown,
  operation: (transaction: Database) => Promise<T>,
): Promise<{ body: T; replay: boolean }> {
  if (!key) return { body: await operation(database), replay: false }
  const requestHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex')

  return database.transaction(async transaction => {
    const existing = await transaction.query<{
      request_hash: string
      response: T
    }>('SELECT request_hash, response FROM idempotency_keys WHERE key = $1 AND user_id = $2', [key, userId])
    const saved = existing.rows[0]
    if (saved) {
      if (saved.request_hash !== requestHash) {
        throw new AppError(409, 'IDEMPOTENCY_KEY_CONFLICT', 'Этот ключ уже использован для другого действия.')
      }
      return { body: saved.response, replay: true }
    }

    const body = await operation(transaction)
    await transaction.query(
      `INSERT INTO idempotency_keys (key, user_id, request_hash, response, status)
       VALUES ($1, $2, $3, $4, 201)`,
      [key, userId, requestHash, JSON.stringify(body)],
    )
    return { body, replay: false }
  })
}

export async function createApplication(options: ApplicationOptions = {}): Promise<ApplicationContext> {
  const db = options.database ?? await createDatabase({ inMemory: options.inMemory })
  const registrationEnabled = options.registrationEnabled ?? process.env.REGISTRATION_ENABLED !== 'false'
  const uploadDir = path.resolve(process.env.WIKI_UPLOAD_DIR ?? './data/uploads')
  await mkdir(uploadDir, { recursive: true })
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet({ contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false }))
  app.use(express.json({ limit: '256kb' }))
  app.use(cookieParser())
  app.use(httpLogger)
  app.use('/uploads', (request, response, next) => authenticateRequest(db, request, response, next), express.static(uploadDir, { dotfiles: 'deny', index: false }))

  app.get('/api/health/live', (_request, response) => response.json({ status: 'ok' }))
  app.get('/api/health/ready', async (_request, response, next) => {
    try {
      await db.query('SELECT 1')
      response.json({ status: 'ready' })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/auth/register', async (request, response, next) => {
    try {
      if (!registrationEnabled) throw new AppError(403, 'REGISTRATION_DISABLED', 'Регистрация сейчас закрыта.')
      const input = registerSchema.parse(request.body)
      const email = normalizeEmail(input.email)
      const passwordHash = await hashPassword(input.password)

      try {
        const result = await db.transaction(async transaction => {
          const userId = uuidv7()
          const workspaceId = uuidv7()
          await transaction.query('INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)', [userId, input.name, email, passwordHash])
          await transaction.query('INSERT INTO workspaces (id, name, owner_id) VALUES ($1, $2, $3)', [workspaceId, 'Мой workspace', userId])
          await transaction.query('INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, $3)', [workspaceId, userId, 'owner'])
          const page = await createPage(transaction, userId, {
            workspaceId,
            parentId: null,
            title: 'Мой первый проект',
          }, WELCOME_MARKDOWN)
          const user = { id: userId, name: input.name, email }
          const session = await createSession(transaction, userId)
          return { user, workspaceId, page, session }
        })

        setSessionCookie(response, result.session.token)
        response.status(201).json({
          user: publicUser(result.user),
          workspaces: [{ id: result.workspaceId, name: 'Мой workspace', role: 'owner' }],
          currentWorkspaceId: result.workspaceId,
          pages: [result.page],
          csrfToken: result.session.csrfToken,
          registrationEnabled,
        })
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
          throw new AppError(409, 'EMAIL_TAKEN', 'Эта почта уже зарегистрирована.')
        }
        throw error
      }
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/auth/login', async (request, response, next) => {
    try {
      const input = loginSchema.parse(request.body)
      const result = await db.query<UserRecord & { password_hash: string }>(
        'SELECT id, name, email, password_hash FROM users WHERE lower(email) = $1',
        [normalizeEmail(input.email)],
      )
      const user = result.rows[0]
      const valid = await verifyPassword(input.password, user?.password_hash ?? DUMMY_PASSWORD_HASH)
      if (!user || !valid) throw LOGIN_ERROR
      const session = await createSession(db, user.id)
      setSessionCookie(response, session.token)
      response.json({
        ...await bootstrapPayload(db, user, session.csrfToken),
        registrationEnabled,
      })
    } catch (error) {
      next(error)
    }
  })

  app.use('/api', (request, response, next) => authenticateRequest(db, request, response, next))

  app.post('/api/auth/logout', requireCsrf, async (request, response, next) => {
    try {
      await destroySession(db, request.auth!.sessionId)
      clearSessionCookie(response)
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/bootstrap', async (request, response, next) => {
    try {
      response.json({
        ...await bootstrapPayload(db, request.auth!.user, request.auth!.csrfToken, request.query.workspaceId),
        registrationEnabled,
      })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/search', async (request, response, next) => {
    try {
      const input = searchSchema.parse(request.query)
      response.json(await searchPages(db, request.auth!.user.id, input))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/workspaces', requireCsrf, async (request, response, next) => {
    try {
      const input = z.object({ name: z.string().trim().min(1).max(120) }).parse(request.body)
      const key = request.header('idempotency-key')
      const result = await idempotent(db, request.auth!.user.id, key, input, async transaction => {
        const workspaceId = uuidv7()
        await transaction.query('INSERT INTO workspaces (id, name, owner_id) VALUES ($1, $2, $3)', [workspaceId, input.name, request.auth!.user.id])
        await transaction.query('INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, $3)', [workspaceId, request.auth!.user.id, 'owner'])
        const page = await createPage(transaction, request.auth!.user.id, {
          workspaceId,
          parentId: null,
          title: 'Первый проект',
        })
        return { workspace: { id: workspaceId, name: input.name, role: 'owner' }, page }
      })
      response.status(result.replay ? 200 : 201).json(result.body)
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/pages', requireCsrf, async (request, response, next) => {
    try {
      const input = createPageSchema.parse(request.body)
      const key = request.header('idempotency-key')
      const result = await idempotent(db, request.auth!.user.id, key, input, transaction => (
        createPage(transaction, request.auth!.user.id, input)
      ))
      response.status(result.replay ? 200 : 201).json(result.body)
    } catch (error) {
      next(error)
    }
  })

  app.patch('/api/pages/:id', requireCsrf, async (request, response, next) => {
    try {
      const input = updatePageSchema.parse(request.body)
      response.json(await updatePage(db, request.auth!.user.id, String(request.params.id), input))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/pages/:id/move', requireCsrf, async (request, response, next) => {
    try {
      const input = movePageSchema.parse(request.body)
      response.json(await movePage(db, request.auth!.user.id, String(request.params.id), input))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/pages/:id/markdown', async (request, response, next) => {
    try {
      const page = await getAuthorizedPage(db, request.params.id, request.auth!.user.id)
      const markdown = page.yjs_state ? yjsToMarkdown(new Uint8Array(page.yjs_state)) : page.markdown ?? ''
      response.setHeader('content-type', 'text/markdown; charset=utf-8')
      response.setHeader('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${page.title}.md`)}`)
      response.send(markdown)
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/uploads', requireCsrf, express.raw({ type: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], limit: '5mb' }), async (request, response, next) => {
    try {
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) throw new AppError(400, 'EMPTY_UPLOAD', 'Выберите файл с картинкой.')
      const type = await fileTypeFromBuffer(request.body)
      const allowed = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp'], ['image/gif', 'gif']])
      const extension = type ? allowed.get(type.mime) : undefined
      if (!extension || type?.mime !== request.header('content-type')) throw new AppError(415, 'INVALID_IMAGE', 'Поддерживаются PNG, JPEG, WebP и GIF.')
      const filename = `${uuidv7()}.${extension}`
      await writeFile(path.join(uploadDir, filename), request.body, { flag: 'wx' })
      response.status(201).json({ url: `/uploads/${filename}` })
    } catch (error) {
      next(error)
    }
  })

  app.use('/api', (_request, _response, next) => next(new AppError(404, 'API_NOT_FOUND', 'Действие не найдено.')))
  app.use(errorHandler)

  return {
    app,
    db,
    close: () => db.close(),
  }
}
