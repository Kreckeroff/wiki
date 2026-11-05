export function moveActiveId(ids: string[], currentId: string | null, direction: -1 | 1) {
  if (!ids.length) return null
  const currentIndex = currentId ? ids.indexOf(currentId) : -1
  if (currentIndex < 0) return direction > 0 ? ids[0] : ids[ids.length - 1]
  return ids[Math.min(ids.length - 1, Math.max(0, currentIndex + direction))]
}

export function createSearchRequestGate() {
  let version = 0
  let controller: AbortController | null = null

  return {
    begin() {
      controller?.abort()
      controller = new AbortController()
      version += 1
      return { version, signal: controller.signal }
    },
    invalidate() {
      controller?.abort()
      controller = null
      version += 1
    },
    isCurrent(candidate: number) {
      return candidate === version
    },
  }
}
