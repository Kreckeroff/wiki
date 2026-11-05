import type { Server as HttpServer } from 'node:http'
import crossws from 'crossws/adapters/node'
import { Hocuspocus, type WebSocketLike } from '@hocuspocus/server'
import { Database as DatabaseExtension } from '@hocuspocus/extension-database'
import type { Database } from './db/index.js'
import { readCookie, resolveSession, SESSION_COOKIE } from './auth.js'
import { getAuthorizedPage } from './pages.js'
import { yjsToMarkdown } from '../shared/editor.js'
import { logger } from './logger.js'

interface CollaborationContext {
  user: {
    id: string
    name: string
    email: string
  }
}

interface PageStateRow {
  yjs_state: Uint8Array | null
}

function pageIdFromDocumentName(documentName: string): string {
  const match = /^page\.([0-9a-f-]{36})$/i.exec(documentName)
  if (!match) throw new Error('INVALID_DOCUMENT_NAME')
  return match[1]
}

export function attachCollaboration(server: HttpServer, database: Database) {
  const hocuspocus = new Hocuspocus<CollaborationContext>({
    debounce: 250,
    maxDebounce: 1500,
    extensions: [
      new DatabaseExtension({
        fetch: async ({ documentName }) => {
          const result = await database.query<PageStateRow>('SELECT yjs_state FROM pages WHERE id = $1', [pageIdFromDocumentName(documentName)])
          const state = result.rows[0]?.yjs_state
          return state ? new Uint8Array(state) : null
        },
        store: async ({ documentName, state }) => {
          const markdown = yjsToMarkdown(state)
          await database.query(
            'UPDATE pages SET yjs_state = $2, markdown = $3, updated_at = now() WHERE id = $1',
            [pageIdFromDocumentName(documentName), state, markdown],
          )
        },
      }),
    ],
    onAuthenticate: async ({ documentName, token, requestHeaders }) => {
      const cookie = readCookie(requestHeaders.get('cookie') ?? undefined, SESSION_COOKIE)
      const auth = await resolveSession(database, cookie)
      if (!auth || token !== auth.csrfToken) throw new Error('AUTH_REQUIRED')
      await getAuthorizedPage(database, pageIdFromDocumentName(documentName), auth.user.id)
      return { user: auth.user }
    },
    onDisconnect: async ({ documentName, context }) => {
      logger.info({ event: 'collaboration.disconnected', documentName, user_id: context?.user?.id })
    },
  })

  const websocket = crossws({
    hooks: {
      open(peer) {
        const connection = hocuspocus.handleConnection(
          peer.websocket as unknown as WebSocketLike,
          peer.request as Request,
        )
        ;(peer as unknown as { _hocuspocus?: typeof connection })._hocuspocus = connection
      },
      message(peer, message) {
        const connection = (peer as unknown as { _hocuspocus?: { handleMessage: (data: Uint8Array) => void } })._hocuspocus
        connection?.handleMessage(message.uint8Array())
      },
      close(peer, event) {
        const connection = (peer as unknown as { _hocuspocus?: { handleClose: (event: { code: number; reason: string }) => void } })._hocuspocus
        connection?.handleClose({ code: event.code ?? 1000, reason: event.reason ?? '' })
      },
      error(peer, error) {
        logger.error({ event: 'collaboration.socket_failed', peer: peer.id, error })
      },
    },
  })

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (pathname === '/collaboration') websocket.handleUpgrade(request, socket, head)
  })

  return {
    hocuspocus,
    close: async () => {
      hocuspocus.closeConnections()
      await hocuspocus.flushPendingStores()
    },
  }
}
