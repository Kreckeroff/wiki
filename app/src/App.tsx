import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, LoaderCircle, X } from 'lucide-react'
import { AuthScreen } from './components/AuthScreen'
import { CollaborativeEditor } from './components/Editor'
import { SearchScreen } from './components/SearchScreen'
import { Sidebar } from './components/Sidebar'
import { api, ApiError, setCsrfToken } from './lib/api'
import { readRecentPageIds, rememberRecentPage } from './lib/recent-pages'
import type { Bootstrap, MoveZone, Page, Workspace } from './types'
import './App.css'

export default function App() {
  const [data, setData] = useState<Bootstrap | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [recentPageIds, setRecentPageIds] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const searchReturnFocus = useRef<HTMLElement | null>(null)
  const focusRestore = useRef<{
    raf: number | null
    observer: MutationObserver | null
    timeout: number | null
  }>({ raf: null, observer: null, timeout: null })

  const clearFocusRestore = useCallback(() => {
    const lifecycle = focusRestore.current
    if (lifecycle.raf !== null) window.cancelAnimationFrame(lifecycle.raf)
    lifecycle.observer?.disconnect()
    if (lifecycle.timeout !== null) window.clearTimeout(lifecycle.timeout)
    focusRestore.current = { raf: null, observer: null, timeout: null }
  }, [])

  useEffect(() => clearFocusRestore, [clearFocusRestore])

  const acceptBootstrap = useCallback((next: Bootstrap) => {
    clearFocusRestore()
    setData(next)
    setCsrfToken(next.csrfToken)
    setRecentPageIds(next.currentWorkspaceId
      ? readRecentPageIds(window.localStorage, next.user.id, next.currentWorkspaceId, next.pages.map(page => page.id))
      : [])
    setSelectedPageId(current => next.pages.some(page => page.id === current) ? current : next.pages[0]?.id ?? null)
    setSearchOpen(false)
  }, [clearFocusRestore])

  const expireSession = useCallback(() => {
    clearFocusRestore()
    setCsrfToken('')
    setData(null)
    setSelectedPageId(null)
    setRecentPageIds([])
    setSearchOpen(false)
  }, [clearFocusRestore])

  useEffect(() => {
    let active = true
    api<Bootstrap>('/api/bootstrap')
      .then(next => { if (active) acceptBootstrap(next) })
      .catch(error => {
        if (!active) return
        if (!(error instanceof ApiError && error.status === 401)) setNotice('Не удалось открыть wiki. Проверьте, запущен ли сервер.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [acceptBootstrap])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 6000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const currentWorkspace = useMemo(() => data?.workspaces.find(workspace => workspace.id === data.currentWorkspaceId) ?? null, [data])
  const currentPage = data?.pages.find(page => page.id === selectedPageId) ?? null
  const recentPages = useMemo(() => recentPageIds
    .map(id => data?.pages.find(page => page.id === id))
    .filter((page): page is Page => Boolean(page)), [data, recentPageIds])

  const openSearch = useCallback(() => {
    clearFocusRestore()
    if (!searchOpen) searchReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSearchOpen(true)
    setSidebarOpen(false)
    if (searchOpen) document.querySelector<HTMLElement>('.search-input')?.focus()
  }, [clearFocusRestore, searchOpen])

  const closeSearch = useCallback(() => {
    clearFocusRestore()
    setSearchOpen(false)
    const returnTo = searchReturnFocus.current
    const returnSelector = returnTo?.classList.contains('page-title')
      ? '.page-title'
      : returnTo?.classList.contains('ProseMirror') ? '.editor-content-wrap .ProseMirror' : null
    focusRestore.current.raf = window.requestAnimationFrame(() => {
      focusRestore.current.raf = null
      const restore = () => {
        const targets = [
          returnTo,
          returnSelector ? document.querySelector<HTMLElement>(returnSelector) : null,
          document.querySelector<HTMLElement>('.editor-topbar .mobile-menu'),
          document.querySelector<HTMLElement>('.page-title'),
          document.querySelector<HTMLElement>('.editor-content-wrap .ProseMirror'),
        ]
        for (const target of targets) {
          if (!target?.isConnected) continue
          const rect = target.getBoundingClientRect()
          const visible = rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 0 && rect.top < window.innerHeight
          if (!visible) continue
          target.focus()
          return true
        }
        return false
      }
      if (restore()) {
        clearFocusRestore()
        return
      }
      const root = document.getElementById('root')
      if (!root) return
      const observer = new MutationObserver(() => {
        if (restore()) {
          observer.disconnect()
          clearFocusRestore()
        }
      })
      const timeout = window.setTimeout(() => {
        observer.disconnect()
        focusRestore.current.observer = null
        focusRestore.current.timeout = null
      }, 5000)
      focusRestore.current = { raf: null, observer, timeout }
      observer.observe(root, { childList: true, subtree: true })
    })
  }, [clearFocusRestore])

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (data && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openSearch()
      }
    }
    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [data, openSearch])

  function showError(error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      expireSession()
      return
    }
    setNotice(error instanceof Error ? error.message : 'Действие не выполнено. Попробуйте ещё раз.')
  }

  function selectPage(id: string) {
    clearFocusRestore()
    if (data?.currentWorkspaceId) {
      setRecentPageIds(rememberRecentPage(window.localStorage, data.user.id, data.currentWorkspaceId, id, data.pages.map(page => page.id)))
    }
    setSelectedPageId(id)
    setSearchOpen(false)
  }

  async function createPage(parentId: string | null) {
    if (!data?.currentWorkspaceId) return
    try {
      const page = await api<Page>('/api/pages', {
        method: 'POST',
        body: { workspaceId: data.currentWorkspaceId, parentId, title: parentId ? 'Новая страница' : 'Новый проект' },
        idempotencyKey: crypto.randomUUID(),
      })
      clearFocusRestore()
      setData(previous => previous ? { ...previous, pages: [...previous.pages, page] } : previous)
      setSelectedPageId(page.id)
      setSearchOpen(false)
      setSidebarOpen(false)
    } catch (error) { showError(error) }
  }

  async function renamePage(title: string) {
    if (!currentPage) return
    try {
      const updated = await api<Page>(`/api/pages/${currentPage.id}`, { method: 'PATCH', body: { title } })
      setData(previous => previous ? { ...previous, pages: previous.pages.map(page => page.id === updated.id ? updated : page) } : previous)
    } catch (error) { showError(error) }
  }

  async function changeAppearance(input: { icon?: string | null; coverUrl?: string | null }) {
    if (!currentPage) return
    try {
      const updated = await api<Page>(`/api/pages/${currentPage.id}`, { method: 'PATCH', body: input })
      setData(previous => previous ? { ...previous, pages: previous.pages.map(page => page.id === updated.id ? updated : page) } : previous)
    } catch (error) { showError(error) }
  }

  async function movePage(pageId: string, targetId: string, zone: MoveZone) {
    if (!data) return
    const target = data.pages.find(page => page.id === targetId)
    if (!target) return
    const parentId = zone === 'inside' ? target.id : target.parentId
    const siblings = data.pages.filter(page => page.parentId === parentId && page.id !== pageId)
    const targetIndex = siblings.findIndex(page => page.id === targetId)
    const index = zone === 'inside' ? siblings.length : zone === 'before' ? Math.max(0, targetIndex) : Math.max(0, targetIndex + 1)
    try {
      const moved = await api<Page>(`/api/pages/${pageId}/move`, { method: 'POST', body: { parentId, index } })
      const next = await api<Bootstrap>(`/api/bootstrap?workspaceId=${encodeURIComponent(data.currentWorkspaceId!)}`)
      acceptBootstrap({ ...next, pages: next.pages.map(page => page.id === moved.id ? moved : page) })
    } catch (error) { showError(error) }
  }

  async function switchWorkspace(id: string) {
    try {
      acceptBootstrap(await api<Bootstrap>(`/api/bootstrap?workspaceId=${encodeURIComponent(id)}`))
      setSidebarOpen(false)
    } catch (error) { showError(error) }
  }

  async function createWorkspace(name: string) {
    try {
      const result = await api<{ workspace: Workspace; page: Page }>('/api/workspaces', {
        method: 'POST', body: { name }, idempotencyKey: crypto.randomUUID(),
      })
      clearFocusRestore()
      setData(previous => previous ? {
        ...previous,
        workspaces: [...previous.workspaces, result.workspace],
        currentWorkspaceId: result.workspace.id,
        pages: [result.page],
      } : previous)
      setSelectedPageId(result.page.id)
      setRecentPageIds([])
      setSearchOpen(false)
      setSidebarOpen(false)
    } catch (error) { showError(error) }
  }

  async function logout() {
    try { await api<void>('/api/auth/logout', { method: 'POST' }) } catch (error) { showError(error) }
    clearFocusRestore()
    setCsrfToken('')
    setData(null)
    setSelectedPageId(null)
    setRecentPageIds([])
    setSearchOpen(false)
    setSidebarOpen(false)
  }

  if (loading) return <main className="app-loading"><span className="loading-brand">wiki</span><LoaderCircle className="spin" size={24} /><p>Открываем рабочее место…</p></main>
  if (!data) return <><AuthScreen onAuthenticated={acceptBootstrap} />{notice && <div className="toast" role="alert"><AlertCircle size={18} /><span>{notice}</span><button type="button" aria-label="Закрыть сообщение" onClick={() => setNotice('')}><X size={16} /></button></div>}</>
  if (!currentWorkspace) return <main className="app-loading"><p>В этом аккаунте пока нет workspace.</p></main>

  return (
    <div className="workspace-layout">
      <Sidebar
        user={data.user}
        workspaces={data.workspaces}
        currentWorkspace={currentWorkspace}
        pages={data.pages}
        selectedPageId={selectedPageId}
        open={sidebarOpen}
        searchActive={searchOpen}
        onClose={() => setSidebarOpen(false)}
        onSearch={openSearch}
        onSelect={selectPage}
        onCreate={parentId => { void createPage(parentId) }}
        onMove={(pageId, targetId, zone) => { void movePage(pageId, targetId, zone) }}
        onSwitchWorkspace={id => { void switchWorkspace(id) }}
        onCreateWorkspace={name => { void createWorkspace(name) }}
        onLogout={() => { void logout() }}
      />
      {searchOpen ? <SearchScreen
        key={currentWorkspace.id}
        workspaceId={currentWorkspace.id}
        workspaceName={currentWorkspace.name}
        recentPages={recentPages}
        onSelect={selectPage}
        onClose={closeSearch}
        onSessionExpired={expireSession}
        onOpenSidebar={() => setSidebarOpen(true)}
      /> : currentPage ? <CollaborativeEditor
        key={currentPage.id}
        page={currentPage}
        user={data.user}
        csrfToken={data.csrfToken}
        onOpenSidebar={() => setSidebarOpen(true)}
        onRename={title => { void renamePage(title) }}
        onAppearance={input => { void changeAppearance(input) }}
      /> : <main className="empty-workspace"><h1>Начните с проекта</h1><p>Создайте корневую страницу в панели слева.</p><button type="button" className="primary-button" onClick={() => { void createPage(null) }}>Новый проект</button></main>}
      {notice && <div className="toast" role="alert"><AlertCircle size={18} /><span>{notice}</span><button type="button" aria-label="Закрыть сообщение" onClick={() => setNotice('')}><X size={16} /></button></div>}
    </div>
  )
}
