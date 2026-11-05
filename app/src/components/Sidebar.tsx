import { useMemo, useState, type DragEvent } from 'react'
import { ChevronDown, ChevronRight, FileText, Folder, LogOut, MoreHorizontal, Plus, Search, SquareStack, X } from 'lucide-react'
import type { MoveZone, Page, User, Workspace } from '../types'
import { Button } from './ui/button'

interface SidebarProps {
  user: User
  workspaces: Workspace[]
  currentWorkspace: Workspace
  pages: Page[]
  selectedPageId: string | null
  open: boolean
  searchActive: boolean
  onClose: () => void
  onSearch: () => void
  onSelect: (id: string) => void
  onCreate: (parentId: string | null) => void
  onMove: (pageId: string, targetId: string, zone: MoveZone) => void
  onSwitchWorkspace: (id: string) => void
  onCreateWorkspace: (name: string) => void
  onLogout: () => void
}

interface TreeNode extends Page {
  children: TreeNode[]
}

function buildTree(pages: Page[]): TreeNode[] {
  const nodes = new Map(pages.map(page => [page.id, { ...page, children: [] as TreeNode[] }]))
  const roots: TreeNode[] = []
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) nodes.get(node.parentId)!.children.push(node)
    else roots.push(node)
  }
  const sort = (items: TreeNode[]) => {
    items.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, 'ru'))
    items.forEach(item => sort(item.children))
  }
  sort(roots)
  return roots
}

export function Sidebar(props: SidebarProps) {
  const { user, workspaces, currentWorkspace, pages, selectedPageId, open, searchActive, onClose, onSearch, onSelect, onCreate, onMove, onSwitchWorkspace, onCreateWorkspace, onLogout } = props
  const tree = useMemo(() => buildTree(pages), [pages])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(pages.map(page => page.id)))
  const [dragged, setDragged] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ id: string; zone: MoveZone } | null>(null)
  const [workspaceMenu, setWorkspaceMenu] = useState(false)

  function toggle(id: string) {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function dragOver(event: DragEvent, page: Page) {
    event.preventDefault()
    if (!dragged || dragged === page.id) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientY - rect.top) / rect.height
    const zone: MoveZone = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside'
    event.dataTransfer.dropEffect = 'move'
    setDrop({ id: page.id, zone })
  }

  function dropOn(event: DragEvent, page: Page) {
    event.preventDefault()
    if (dragged && drop && dragged !== page.id) onMove(dragged, page.id, drop.zone)
    setDragged(null)
    setDrop(null)
  }

  function renderNode(page: TreeNode, depth: number) {
    const isExpanded = expanded.has(page.id)
    const isDrop = drop?.id === page.id
    return (
      <div className="tree-node" key={page.id}>
        <div
          className={`tree-row ${selectedPageId === page.id ? 'selected' : ''} ${dragged === page.id ? 'dragging' : ''} ${isDrop ? `drop-${drop.zone}` : ''}`}
          style={{ '--depth': depth } as React.CSSProperties}
          draggable
          onDragStart={event => { event.dataTransfer.setData('text/page-id', page.id); event.dataTransfer.effectAllowed = 'move'; setDragged(page.id) }}
          onDragEnd={() => { setDragged(null); setDrop(null) }}
          onDragOver={event => dragOver(event, page)}
          onDragLeave={() => { if (drop?.id === page.id) setDrop(null) }}
          onDrop={event => dropOn(event, page)}
        >
          <button className="tree-disclosure" type="button" aria-label={isExpanded ? `Свернуть ${page.title}` : `Развернуть ${page.title}`} onClick={() => toggle(page.id)}>
            {page.children.length ? isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span />}
          </button>
          <button className="tree-page" type="button" onClick={() => { onSelect(page.id); onClose() }}>
            <span className="tree-icon">{page.icon ?? (page.isProject ? <Folder size={16} /> : <FileText size={16} />)}</span>
            <span className="tree-title">{page.title}</span>
          </button>
          <button className="tree-add" type="button" title="Новая дочерняя страница" aria-label={`Создать страницу внутри ${page.title}`} onClick={() => { setExpanded(previous => new Set(previous).add(page.id)); onCreate(page.id) }}><Plus size={15} /></button>
        </div>
        {page.children.length > 0 && isExpanded && <div className="tree-children">{page.children.map(child => renderNode(child, depth + 1))}</div>}
      </div>
    )
  }

  return (
    <>
      {open && <button type="button" className="sidebar-backdrop" aria-label="Закрыть панель" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`} aria-label="Дерево страниц">
        <div className="sidebar-top">
          <div className="sidebar-brand"><span className="mini-brand"><SquareStack size={18} /></span><strong>wiki</strong><span className="edition">рабочее место</span></div>
          <button type="button" className="icon-button sidebar-close" onClick={onClose} aria-label="Закрыть панель"><X size={18} /></button>
        </div>
        <div className="sidebar-search-wrap">
          <Button type="button" variant="ghost" size="sm" className="sidebar-search" aria-current={searchActive ? 'page' : undefined} onClick={onSearch}><Search size={16} /> Поиск</Button>
        </div>
        <div className="sidebar-actions">
          <Button type="button" variant="secondary" size="sm" className="new-page-button" onClick={() => { if (selectedPageId) setExpanded(previous => new Set(previous).add(selectedPageId)); onCreate(selectedPageId) }}><Plus size={17} /> Новая страница</Button>
          <Button type="button" variant="ghost" size="icon-sm" title="Новый проект" aria-label="Новый проект" onClick={() => onCreate(null)}><Folder size={17} /></Button>
        </div>
        <div className="tree-caption"><span>Страницы</span><span>{pages.length}</span></div>
        <nav className="page-tree">
          {tree.length ? tree.map(page => renderNode(page, 0)) : (
            <div className="tree-empty"><FileText size={22} /><p>Здесь появятся ваши страницы.</p></div>
          )}
        </nav>
        <div className="sidebar-bottom">
          <button type="button" className="workspace-switch" aria-expanded={workspaceMenu} onClick={() => setWorkspaceMenu(value => !value)}>
            <span className="workspace-avatar">{currentWorkspace.name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{currentWorkspace.name}</strong><small>{user.email}</small></span>
            <MoreHorizontal size={18} />
          </button>
          {workspaceMenu && (
            <div className="workspace-menu">
              <div className="workspace-menu-label">Ваши workspace</div>
              {workspaces.map(workspace => <button type="button" key={workspace.id} onClick={() => { onSwitchWorkspace(workspace.id); setWorkspaceMenu(false) }}><span className="workspace-avatar small">{workspace.name.slice(0, 1).toUpperCase()}</span><span>{workspace.name}</span>{workspace.id === currentWorkspace.id && <span className="current-dot" />}</button>)}
              <button type="button" onClick={() => { const name = window.prompt('Название нового workspace', 'Новый workspace'); if (name?.trim()) { onCreateWorkspace(name.trim()); setWorkspaceMenu(false) } }}><Plus size={16} /><span>Новый workspace</span></button>
              <div className="workspace-menu-separator" />
              <button type="button" onClick={onLogout}><LogOut size={16} /><span>Выйти</span></button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
