import { createServer } from 'node:http'
import path from 'node:path'
import express from 'express'
import { createApplication } from './app.js'
import { attachCollaboration } from './collaboration.js'
import { logger } from './logger.js'

function argument(name: string, fallback?: string) {
  const inline = process.argv.find(value => value.startsWith(`--${name}=`))
  if (inline) return inline.slice(name.length + 3)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const port = Number(argument('port', process.env.PORT ?? '3000'))
const host = argument('host', process.env.HOST ?? '0.0.0.0')!
const development = process.env.NODE_ENV !== 'production'
const context = await createApplication()
const server = createServer(context.app)
const collaboration = attachCollaboration(server, context.db)
const vite = development
  ? await (await import('vite')).createServer({ server: { middlewareMode: true }, appType: 'spa' })
  : null

if (vite) {
  context.app.use(vite.middlewares)
} else {
  const dist = path.resolve('dist')
  context.app.use(express.static(dist))
  context.app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/') || request.path.startsWith('/uploads/')) return next()
    response.sendFile(path.join(dist, 'index.html'))
  })
}

server.listen(port, host, () => {
  logger.info({ event: 'server.started', host, port, mode: development ? 'development' : 'production' })
  console.log(`Wiki: http://localhost:${port}`)
})

let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await collaboration.close()
  await vite?.close()
  await context.close()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}
process.on('SIGINT', () => { void stop() })
process.on('SIGTERM', () => { void stop() })
