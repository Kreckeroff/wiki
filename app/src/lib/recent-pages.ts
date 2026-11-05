const RECENT_PAGES_LIMIT = 10
const STORAGE_PREFIX = 'wiki.recent-pages:'

interface RecentPagesStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function storageKey(userId: string, workspaceId: string) {
  return `${STORAGE_PREFIX}${userId}:${workspaceId}`
}

export function readRecentPageIds(
  storage: RecentPagesStorage,
  userId: string,
  workspaceId: string,
  availablePageIds: string[],
) {
  const available = new Set(availablePageIds)
  try {
    const value: unknown = JSON.parse(storage.getItem(storageKey(userId, workspaceId)) ?? '[]')
    if (!Array.isArray(value)) return []
    return [...new Set(value.filter((id): id is string => typeof id === 'string' && available.has(id)))].slice(0, RECENT_PAGES_LIMIT)
  } catch {
    return []
  }
}

export function rememberRecentPage(
  storage: RecentPagesStorage,
  userId: string,
  workspaceId: string,
  pageId: string,
  availablePageIds: string[],
) {
  const recent = readRecentPageIds(storage, userId, workspaceId, availablePageIds)
  if (!availablePageIds.includes(pageId)) return recent
  const next = [pageId, ...recent.filter(id => id !== pageId)].slice(0, RECENT_PAGES_LIMIT)
  try {
    storage.setItem(storageKey(userId, workspaceId), JSON.stringify(next))
  } catch {
    return next
  }
  return next
}
