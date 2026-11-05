import { pino } from 'pino'
import { pinoHttp } from 'pino-http'
import { randomUUID } from 'node:crypto'

export const logger = pino({
  name: 'wiki',
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers.x-csrf-token', 'res.headers.set-cookie', 'req.body.password', 'password', 'token'],
  base: { service: 'wiki', environment: process.env.NODE_ENV ?? 'development' },
})

export const httpLogger = pinoHttp({
  logger,
  genReqId: () => randomUUID(),
  customProps: () => ({ service: 'wiki' }),
  customLogLevel: (_request, response, error) => {
    if (error || response.statusCode >= 500) return 'error'
    if (response.statusCode >= 400) return 'warn'
    return 'info'
  },
})
