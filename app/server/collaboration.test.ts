import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import WebSocket from 'ws'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { createApplication, type ApplicationContext } from './app.js'
import { attachCollaboration } from './collaboration.js'

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function setup() {
  const context = await createApplication({ inMemory: true })
  const server = createServer(context.app)
  const collaboration = attachCollaboration(server, context.db)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  cleanups.push(async () => {
    await collaboration.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await context.close()
  })
  return { context, url: `ws://127.0.0.1:${port}/collaboration` }
}

async function account(context: ApplicationContext, email: string) {
  const response = await request(context.app).post('/api/auth/register').send({
    name: email.split('@')[0], email, password: 'correct horse battery staple',
  })
  return {
    body: response.body,
    cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
  }
}

function connect(url: string, pageId: string, token: string, cookie: string) {
  class CookieWebSocket extends WebSocket {
    constructor(address: string | URL, protocols?: string | string[]) {
      super(address, protocols, { headers: { cookie } })
    }
  }
  const document = new Y.Doc()
  const provider = new HocuspocusProvider({
    url,
    name: `page.${pageId}`,
    document,
    token,
    WebSocketPolyfill: CookieWebSocket,
    maxAttempts: 1,
  })
  cleanups.push(() => {
    try { provider.destroy() } catch (error) {
      if (!String(error).includes('closed before the connection')) throw error
    }
  })
  return { provider, document }
}

function synced(provider: HocuspocusProvider): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Синхронизация не завершилась')), 4000)
    if (provider.isSynced) { clearTimeout(timer); resolve(); return }
    provider.on('synced', () => { clearTimeout(timer); resolve() })
    provider.on('authenticationFailed', () => { clearTimeout(timer); reject(new Error('Доступ отклонён')) })
  })
}

describe('живая правка', () => {
  it('синхронизирует двух участников, awareness и сохраняет Yjs', async () => {
    const { context, url } = await setup()
    const owner = await account(context, 'owner@example.com')
    const second = await account(context, 'second@example.com')
    const pageId = owner.body.pages[0].id
    await context.db.query('INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, $3)', [
      owner.body.workspaces[0].id, second.body.user.id, 'member',
    ])

    const first = connect(url, pageId, owner.body.csrfToken, owner.cookie)
    const other = connect(url, pageId, second.body.csrfToken, second.cookie)
    await Promise.all([synced(first.provider), synced(other.provider)])

    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText('Живая общая правка')])
    first.document.getXmlFragment('default').insert(first.document.getXmlFragment('default').length, [paragraph])
    first.provider.awareness.setLocalStateField('user', { name: 'owner', color: '#26735b' })

    await vi.waitFor(() => {
      expect(other.document.getXmlFragment('default').toString()).toContain('Живая общая правка')
      expect(other.provider.awareness.getStates().size).toBeGreaterThan(0)
    })

    first.provider.destroy()
    other.provider.destroy()
    await vi.waitFor(async () => {
      const result = await context.db.query<{ markdown: string }>('SELECT markdown FROM pages WHERE id = $1', [pageId])
      expect(result.rows[0].markdown).toContain('Живая общая правка')
    }, { timeout: 5000 })
  })

  it('не пускает человека из другого workspace', async () => {
    const { context, url } = await setup()
    const owner = await account(context, 'owner@example.com')
    const outsider = await account(context, 'outsider@example.com')
    const { provider } = connect(url, owner.body.pages[0].id, outsider.body.csrfToken, outsider.cookie)

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Соединение не было закрыто')), 4000)
      provider.on('authenticationFailed', () => { clearTimeout(timer); resolve() })
      provider.on('synced', () => { clearTimeout(timer); reject(new Error('Чужой участник получил документ')) })
    })
  })
})
