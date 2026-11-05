import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { AlertCircle, FileText, Folder, LoaderCircle, Menu, Search } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { createSearchRequestGate, moveActiveId } from '../lib/search-state'
import type { Page, SearchResponse, SearchResult } from '../types'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { MenuItem } from './ui/menu-item'

interface SearchScreenProps {
  workspaceId: string
  workspaceName: string
  recentPages: Page[]
  onSelect: (id: string) => void
  onClose: () => void
  onSessionExpired: () => void
  onOpenSidebar: () => void
}

type SearchStatus = 'idle' | 'loading' | 'success' | 'error'

function resultDescription(result: SearchResult) {
  const path = result.path.length ? result.path.map(item => item.title).join(' / ') : 'В корне workspace'
  return (
    <span className="search-result-copy">
      <span>{path}</span>
      {result.snippet && <span>{result.snippet}</span>}
    </span>
  )
}

export function SearchScreen({ workspaceId, workspaceName, recentPages, onSelect, onClose, onSessionExpired, onOpenSidebar }: SearchScreenProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [retry, setRetry] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [searchWorkspaceId, setSearchWorkspaceId] = useState(workspaceId)
  const inputRef = useRef<HTMLInputElement>(null)
  const [requestGate] = useState(createSearchRequestGate)
  const normalizedQuery = query.trim()
  const items: Array<SearchResult | Page> = normalizedQuery ? (status === 'success' ? results : []) : (status === 'idle' ? recentPages : [])
  const itemIds = items.map(item => item.id)
  const activeItemId = activeId && itemIds.includes(activeId) ? activeId : itemIds[0] ?? null

  if (searchWorkspaceId !== workspaceId) {
    setSearchWorkspaceId(workspaceId)
    setQuery('')
    setResults([])
    setStatus('idle')
    setActiveId(null)
  }

  useEffect(() => {
    inputRef.current?.focus()
  }, [workspaceId])

  useEffect(() => {
    requestGate.invalidate()
    if (!normalizedQuery) return

    const timer = window.setTimeout(() => {
      const request = requestGate.begin()
      const params = new URLSearchParams({ workspaceId, q: normalizedQuery })
      api<SearchResponse>(`/api/search?${params.toString()}`, { signal: request.signal })
        .then(response => {
          if (!requestGate.isCurrent(request.version)) return
          setResults(response.results)
          setStatus('success')
          setActiveId(response.results[0]?.id ?? null)
        })
        .catch((error: unknown) => {
          if (request.signal.aborted || !requestGate.isCurrent(request.version)) return
          if (error instanceof ApiError && error.status === 401) {
            onSessionExpired()
            return
          }
          setStatus('error')
        })
    }, 250)

    return () => {
      window.clearTimeout(timer)
      requestGate.invalidate()
    }
  }, [workspaceId, normalizedQuery, retry, onSessionExpired, requestGate])

  useEffect(() => {
    if (!activeItemId) return
    document.getElementById(`search-option-${activeItemId}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeItemId])

  function handleShellKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveId(moveActiveId(itemIds, activeItemId, event.key === 'ArrowDown' ? 1 : -1))
    } else if (event.key === 'Enter' && activeItemId) {
      event.preventDefault()
      onSelect(activeItemId)
    }
  }

  return (
    <main className="search-shell" onKeyDown={handleShellKeyDown}>
      <header className="search-topbar">
        <Button type="button" variant="ghost" size="icon" className="icon-button mobile-menu" aria-label="Открыть панель" onClick={onOpenSidebar}><Menu size={18} /></Button>
        <div className="breadcrumb" aria-label="Текущий раздел">
          <strong>{workspaceName}</strong><span>/</span><span>Поиск</span>
        </div>
      </header>
      <div className="search-panel">
        <h1>{normalizedQuery ? 'Поиск по страницам' : 'Недавние страницы'}</h1>
        <section className="search-card" aria-label="Поиск страниц">
          <div className="search-mobile-bar">
            <div className="search-field">
              <Search size={17} aria-hidden="true" />
              <Input
                ref={inputRef}
                className="search-input"
                type="search"
                role="combobox"
                value={query}
                maxLength={200}
                aria-label="Поиск по страницам"
                aria-autocomplete="list"
                aria-expanded={items.length > 0}
                aria-controls={items.length > 0 ? 'search-listbox' : undefined}
                aria-activedescendant={activeItemId ? `search-option-${activeItemId}` : undefined}
                placeholder="Поиск по названию или тексту"
                onChange={event => {
                  const nextQuery = event.target.value
                  setQuery(nextQuery)
                  setResults([])
                  setStatus(nextQuery.trim() ? 'loading' : 'idle')
                  setActiveId(null)
                }}
                onKeyDown={handleKeyDown}
              />
            </div>
            <Button type="button" variant="ghost" size="lg" className="search-cancel" onClick={onClose}>Отмена</Button>
          </div>

          {status === 'idle' && recentPages.length === 0 && (
            <div className="search-state">
              <p>Вы ещё не открывали страницы в этом workspace</p>
            </div>
          )}
          {status === 'idle' && recentPages.length > 0 && (
            <div className="search-results-wrap search-recent-wrap">
              <div className="search-results" id="search-listbox" role="listbox" aria-label="Недавние страницы">
                {recentPages.map(page => (
                  <MenuItem
                    key={page.id}
                    id={`search-option-${page.id}`}
                    className="search-result"
                    icon={page.icon ?? (page.isProject ? <Folder /> : <FileText />)}
                    label={page.title}
                    description={<span className="search-result-copy"><span>{workspaceName}</span></span>}
                    active={activeItemId === page.id}
                    onMouseEnter={() => setActiveId(page.id)}
                    onClick={() => onSelect(page.id)}
                  />
                ))}
              </div>
            </div>
          )}
          {status === 'loading' && <div className="search-state" role="status"><LoaderCircle className="spin" size={20} /><p>Ищем…</p></div>}
          {status === 'error' && (
            <div className="search-state search-error" role="alert">
              <AlertCircle size={20} />
              <p>Не удалось выполнить поиск. Попробуйте ещё раз.</p>
              <Button type="button" variant="secondary" size="sm" onClick={() => {
                setResults([])
                setStatus('loading')
                setActiveId(null)
                setRetry(value => value + 1)
              }}>Повторить</Button>
            </div>
          )}
          {status === 'success' && results.length === 0 && (
            <div className="search-state" role="status"><p>Ничего не найдено. Попробуйте изменить запрос.</p></div>
          )}
          {status === 'success' && results.length > 0 && (
            <div className="search-results-wrap">
              <p className="search-count" role="status">Найдено: {results.length}</p>
              <div className="search-results" id="search-listbox" role="listbox" aria-label="Результаты поиска">
                {results.map(result => (
                  <MenuItem
                    key={result.id}
                    id={`search-option-${result.id}`}
                    className="search-result"
                    icon={result.icon ?? (result.isProject ? <Folder /> : <FileText />)}
                    label={result.title}
                    description={resultDescription(result)}
                    active={activeItemId === result.id}
                    onMouseEnter={() => setActiveId(result.id)}
                    onClick={() => onSelect(result.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
