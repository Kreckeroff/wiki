import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import type { Database } from './db/index.js'
import { AppError } from './errors.js'
import type { AuthContext, UserRecord } from './types.js'

export const SESSION_COOKIE = 'wiki_session'
const SESSION_DAYS = 30
const ABSOLUTE_DAYS = 90

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext
    }
  }
}

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(128),
})

export const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
})

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function createSession(database: Database, userId: string): Promise<{ token: string; csrfToken: string }> {
  const token = randomBytes(32).toString('base64url')
  const csrfToken = randomBytes(24).toString('base64url')
  await database.query(
    `INSERT INTO sessions (id, token_hash, user_id, csrf_token, expires_at, absolute_expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '30 days', now() + interval '90 days')`,
    [randomUUID(), hashToken(token), userId, csrfToken],
  )
  return { token, csrfToken }
}

export function setSessionCookie(response: Response, token: string): void {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' })
}

interface SessionRow {
  id: string
  csrf_token: string
  user_id: string
  name: string
  email: string
}

export async function resolveSession(database: Database, token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null
  const result = await database.query<SessionRow>(
    `SELECT s.id, s.csrf_token, u.id AS user_id, u.name, u.email
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND s.absolute_expires_at > now()`,
    [hashToken(token)],
  )
  const row = result.rows[0]
  if (!row) return null

  await database.query(
    `UPDATE sessions SET last_seen_at = now(), expires_at = LEAST(now() + interval '30 days', absolute_expires_at)
     WHERE id = $1`,
    [row.id],
  )
  return {
    user: { id: row.user_id, name: row.name, email: row.email },
    sessionId: row.id,
    csrfToken: row.csrf_token,
  }
}

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return undefined
}

export async function authenticateRequest(database: Database, request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const auth = await resolveSession(database, request.cookies[SESSION_COOKIE])
    if (!auth) throw new AppError(401, 'AUTH_REQUIRED', 'Войдите, чтобы продолжить.')
    request.auth = auth
    next()
  } catch (error) {
    next(error)
  }
}

export function requireCsrf(request: Request, _response: Response, next: NextFunction): void {
  const supplied = request.header('x-csrf-token') ?? ''
  if (!request.auth || !safeEqual(supplied, request.auth.csrfToken)) {
    next(new AppError(403, 'CSRF_INVALID', 'Обновите страницу и повторите действие.'))
    return
  }
  next()
}

export async function destroySession(database: Database, sessionId: string): Promise<void> {
  await database.query('DELETE FROM sessions WHERE id = $1', [sessionId])
}

export const LOGIN_ERROR = new AppError(401, 'LOGIN_FAILED', 'Не удалось войти. Проверьте почту и пароль.')
