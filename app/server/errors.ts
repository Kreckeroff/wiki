import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { logger } from './logger.js'

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function errorHandler(error: unknown, request: Request, response: Response, _next: NextFunction): void {
  if (error instanceof ZodError) {
    response.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Проверьте введённые данные.' } })
    return
  }

  if (error instanceof AppError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } })
    return
  }

  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    response.status(409).json({ error: { code: 'CONFLICT', message: 'Такая запись уже существует.' } })
    return
  }

  logger.error({
    event: 'http.failed',
    request_id: request.id,
    error,
  })
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Не получилось выполнить действие. Попробуйте ещё раз.' } })
}
