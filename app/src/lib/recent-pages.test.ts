import { describe, expect, it } from 'vitest'
import { readRecentPageIds, rememberRecentPage } from './recent-pages'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

describe('недавно открытые страницы', () => {
  it('хранит не более 10 уникальных страниц, последняя открытая первая', () => {
    const storage = memoryStorage()
    const available = Array.from({ length: 12 }, (_, index) => `page-${index + 1}`)
    for (const pageId of available) rememberRecentPage(storage, 'user-1', 'workspace-1', pageId, available)

    expect(readRecentPageIds(storage, 'user-1', 'workspace-1', available)).toEqual(available.slice(2).reverse())

    rememberRecentPage(storage, 'user-1', 'workspace-1', 'page-5', available)
    expect(readRecentPageIds(storage, 'user-1', 'workspace-1', available)).toEqual([
      'page-5', 'page-12', 'page-11', 'page-10', 'page-9', 'page-8', 'page-7', 'page-6', 'page-4', 'page-3',
    ])
  })

  it('разделяет историю по человеку и workspace', () => {
    const storage = memoryStorage()
    rememberRecentPage(storage, 'user-1', 'workspace-1', 'page-1', ['page-1', 'page-2'])
    rememberRecentPage(storage, 'user-1', 'workspace-2', 'page-2', ['page-1', 'page-2'])
    rememberRecentPage(storage, 'user-2', 'workspace-1', 'page-2', ['page-1', 'page-2'])

    expect(readRecentPageIds(storage, 'user-1', 'workspace-1', ['page-1', 'page-2'])).toEqual(['page-1'])
    expect(readRecentPageIds(storage, 'user-1', 'workspace-2', ['page-1', 'page-2'])).toEqual(['page-2'])
    expect(readRecentPageIds(storage, 'user-2', 'workspace-1', ['page-1', 'page-2'])).toEqual(['page-2'])
  })

  it('не возвращает и не запоминает страницы вне текущего bootstrap', () => {
    const storage = memoryStorage()
    rememberRecentPage(storage, 'user-1', 'workspace-1', 'page-1', ['page-1', 'page-2'])
    rememberRecentPage(storage, 'user-1', 'workspace-1', 'page-2', ['page-1', 'page-2'])

    expect(readRecentPageIds(storage, 'user-1', 'workspace-1', ['page-2'])).toEqual(['page-2'])
    expect(rememberRecentPage(storage, 'user-1', 'workspace-1', 'missing', ['page-2'])).toEqual(['page-2'])
    expect(readRecentPageIds(storage, 'user-1', 'workspace-1', ['page-2'])).toEqual(['page-2'])
  })

  it('игнорирует повреждённое локальное значение', () => {
    const storage = memoryStorage()
    storage.setItem('wiki.recent-pages:user-1:workspace-1', '{broken')
    expect(readRecentPageIds(storage, 'user-1', 'workspace-1', ['page-1'])).toEqual([])
  })
})
