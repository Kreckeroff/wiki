let csrfToken = ''

export function setCsrfToken(token: string) {
  csrfToken = token
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  idempotencyKey?: string
  signal?: AbortSignal
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers()
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  if (csrfToken) headers.set('x-csrf-token', csrfToken)
  if (options.idempotencyKey) headers.set('idempotency-key', options.idempotencyKey)

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'same-origin',
    signal: options.signal,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(
      payload?.error?.code ?? 'REQUEST_FAILED',
      payload?.error?.message ?? 'Не получилось выполнить действие. Попробуйте ещё раз.',
      response.status,
    )
  }
  return payload as T
}

export async function uploadImage(file: File): Promise<string> {
  const response = await fetch('/api/uploads', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': file.type,
      'x-csrf-token': csrfToken,
    },
    body: file,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(payload?.error?.code ?? 'UPLOAD_FAILED', payload?.error?.message ?? 'Не удалось загрузить картинку.', response.status)
  return payload.url as string
}
