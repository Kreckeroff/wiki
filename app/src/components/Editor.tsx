import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus'
import Collaboration from '@tiptap/extension-collaboration'
import DragHandle from '@tiptap/extension-drag-handle-react'
import { getNodeRangeDecorations, NodeRangeSelection } from '@tiptap/extension-node-range'
import { Plugin, PluginKey, TextSelection, type SelectionRange, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Markdown } from '@tiptap/markdown'
import { Placeholder } from '@tiptap/extensions'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import {
  Bold, Check, Cloud, Code, Download, Heading1, Heading2,
  Image as ImageIcon, Italic, Link as LinkIcon, List, ListOrdered, ListTodo,
  LoaderCircle, Menu, PanelTop, Quote, Smile, SquareCode, Strikethrough,
  Table as TableIcon, Wifi, WifiOff,
} from 'lucide-react'
import { editorExtensions } from '../../shared/editor'
import type { Page, User } from '../types'
import { uploadImage } from '../lib/api'
import { CollaborationCaretWithBlockGroup } from '../lib/collaboration-caret'
import { filterEditorCommands, moveActiveIndex, parseSlashQuery, slashOptionId, type EditorCommand } from '../lib/editor-commands'
import { deleteBlock, duplicateBlock, turnBlock } from '../lib/block-operations'
import {
  createBlockGroup, deleteBlockGroup, duplicateBlockGroup, moveBlockGroup,
  moveBlockGroupBoundary, resolveBlockGroup, type BlockGroup,
} from '../lib/block-group-operations'
import {
  blockGroupCursorPosition, blockGroupCursorSelection, blockGroupDropTarget, blockGroupForDrag,
  blockStartAtParentDepth, blockStartAtSelection, mapBlockGroup,
} from '../lib/block-group-ui'
import { BlockMenu } from './BlockMenu'
import { SlashMenu } from './SlashMenu'
import { Button } from './ui/button'

interface EditorProps {
  page: Page
  user: User
  csrfToken: string
  onOpenSidebar: () => void
  onRename: (title: string) => void
  onAppearance: (input: { icon?: string | null; coverUrl?: string | null }) => void
}

interface HeadingItem {
  level: number
  text: string
  pos: number
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error'

function ToolbarButton({ label, active = false, disabled = false, onClick, children }: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return <button type="button" className={`toolbar-button ${active ? 'active' : ''}`} aria-label={label} title={label} aria-pressed={active} disabled={disabled} onClick={onClick}>{children}</button>
}

function slashQuery(editor: NonNullable<ReturnType<typeof useEditor>>) {
  const { $from } = editor.state.selection
  if (!$from.parent.isTextblock) return null
  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  return parseSlashQuery(text)
}

export function CollaborativeEditor(props: EditorProps) {
  const [session, setSession] = useState<{ ydoc: Y.Doc; provider: HocuspocusProvider } | null>(null)

  useEffect(() => {
    const ydoc = new Y.Doc()
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const provider = new HocuspocusProvider({
      url: `${protocol}//${window.location.host}/collaboration`,
      name: `page.${props.page.id}`,
      document: ydoc,
      token: props.csrfToken,
    })
    setSession({ ydoc, provider })
    return () => {
      setSession(null)
      provider.destroy()
      ydoc.destroy()
    }
  }, [props.page.id, props.csrfToken])

  if (!session) return <div className="editor-loading"><LoaderCircle className="spin" size={22} /> Открываем страницу…</div>
  return <EditorSession {...props} ydoc={session.ydoc} provider={session.provider} />
}

function EditorSession({ page, user, onOpenSidebar, onRename, onAppearance, ydoc, provider }: EditorProps & { ydoc: Y.Doc; provider: HocuspocusProvider }) {
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [synced, setSynced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [presence, setPresence] = useState<Array<{ name: string; color: string }>>([])
  const [editorError, setEditorError] = useState('')
  const [slashActiveIndex, setSlashActiveIndex] = useState(0)
  const [slashActiveQuery, setSlashActiveQuery] = useState<string | null>(null)
  const [activeBlock, setActiveBlock] = useState<{ pos: number; canTurn: boolean } | null>(null)
  const [blockMenuOpen, setBlockMenuOpen] = useState(false)
  const [blockGroup, setBlockGroup] = useState<BlockGroup | null>(null)
  const blockMenuOpenRef = useRef(false)
  const blockGroupRef = useRef<BlockGroup | null>(null)
  const blockGroupReturnPosRef = useRef<number | null>(null)
  const dragBlockGroupRef = useRef<BlockGroup | null>(null)
  const pointerGroupRef = useRef<{ anchor: number; parentDepth: number; pointerId: number } | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const slashState = useRef<{ query: string | null; commands: readonly EditorCommand[]; activeIndex: number }>({ query: null, commands: [], activeIndex: 0 })
  const runSlashCommandRef = useRef<(command: EditorCommand) => void>(() => {})
  const dismissSlashRef = useRef<() => void>(() => {})

  useEffect(() => {
    const status = ({ status }: { status: string }) => setConnection(status === 'connected' ? 'connected' : status === 'disconnected' ? 'disconnected' : 'connecting')
    const synced = () => { setSynced(true); setSaving(false) }
    const authenticationFailed = () => { setConnection('error'); setEditorError('Сессия устарела. Обновите страницу.') }
    const disconnected = () => setConnection('disconnected')
    provider.on('status', status)
    provider.on('synced', synced)
    provider.on('authenticationFailed', authenticationFailed)
    provider.on('disconnect', disconnected)
    return () => {
      provider.off('status', status)
      provider.off('synced', synced)
      provider.off('authenticationFailed', authenticationFailed)
      provider.off('disconnect', disconnected)
    }
  }, [provider])

  const editor = useEditor({
    extensions: [
      ...editorExtensions,
      Markdown,
      Collaboration.configure({ document: ydoc }),
      CollaborationCaretWithBlockGroup.configure({ provider, user: { name: user.name, color: user.color } }),
      Placeholder.configure({ placeholder: 'Пишите здесь или введите / для выбора блока…' }),
    ],
    editorProps: {
      attributes: { class: 'page-prose', 'aria-label': 'Текст страницы' },
      handleKeyDown: (_view, event) => {
        const slash = slashState.current
        if (slash.query !== null) {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const delta = event.key === 'ArrowDown' ? 1 : -1
            setSlashActiveQuery(slash.query)
            setSlashActiveIndex(moveActiveIndex(slash.activeIndex, delta, slash.commands.length))
            return true
          }
          if (event.key === 'Enter' && slash.commands[slash.activeIndex]) {
            event.preventDefault()
            runSlashCommandRef.current(slash.commands[slash.activeIndex])
            return true
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            dismissSlashRef.current()
            return true
          }
        }
        if (event.key === 'Escape') {
          if (blockMenuOpenRef.current) return false
          event.preventDefault()
          if (blockGroupRef.current) clearBlockGroup(true)
          else enterBlockGroup()
          return true
        }
        if (
          blockGroupRef.current && event.shiftKey &&
          (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
          !event.altKey && !event.ctrlKey && !event.metaKey
        ) {
          event.preventDefault()
          const next = moveBlockGroupBoundary(
            editor!,
            blockGroupRef.current,
            event.key === 'ArrowDown' ? 'down' : 'up',
          )
          if (next) selectBlockGroup(next)
          else clearBlockGroup(true)
          return true
        }
        return false
      },
      handleDrop: (view, event) => dropBlockGroup(view, event),
    },
    onUpdate: () => setSaving(true),
  }, [ydoc, provider])

  function storeBlockGroup(group: BlockGroup | null) {
    blockGroupRef.current = group
    setBlockGroup(group)
  }

  function clearBlockGroup(restoreCursor: boolean) {
    if (!editor) return
    const returnPos = blockGroupReturnPosRef.current ?? editor.state.selection.from
    blockGroupReturnPosRef.current = null
    dragBlockGroupRef.current = null
    storeBlockGroup(null)
    setBlockMenuVisibility(false)
    if (restoreCursor && !editor.isDestroyed) {
      const pos = Math.max(0, Math.min(returnPos, editor.state.doc.content.size))
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos))))
    }
  }

  function selectBlockGroup(group: BlockGroup, focus = false) {
    if (!editor) return false
    const resolved = resolveBlockGroup(editor, group)
    if (!resolved) {
      clearBlockGroup(true)
      return false
    }
    storeBlockGroup(group)
    editor.view.dispatch(editor.state.tr.setSelection(resolved.selection))
    if (focus) editor.view.focus()
    return true
  }

  function enterBlockGroup() {
    if (!editor) return
    const blockStart = blockStartAtSelection(editor)
    if (blockStart === null) return
    const group = createBlockGroup(editor, blockStart, blockStart)
    if (!group) return
    blockGroupReturnPosRef.current = editor.state.selection.from
    selectBlockGroup(group, true)
  }

  function isActiveBlockInGroup(pos: number) {
    return !!editor && blockGroupForDrag(editor, blockGroupRef.current, pos) !== null
  }

  function startBlockDrag() {
    setBlockMenuVisibility(false)
    dragBlockGroupRef.current = null
    if (!editor || !activeBlock) return
    const group = blockGroupForDrag(editor, blockGroupRef.current, activeBlock.pos)
    if (group) {
      dragBlockGroupRef.current = group
      return
    }
    if (blockGroupRef.current) clearBlockGroup(false)
  }

  function finishBlockDrag() {
    const group = dragBlockGroupRef.current
    if (!editor || !group) return
    dragBlockGroupRef.current = null
    selectBlockGroup(group, true)
  }

  function dropBlockGroup(view: EditorView, event: DragEvent) {
    const group = dragBlockGroupRef.current
    if (!editor || !group) return false
    const resolved = resolveBlockGroup(editor, group)
    const mousePos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
    const target = mousePos === undefined ? null : blockGroupDropTarget(editor, group, mousePos)
    const cursorTarget = target !== null ? blockGroupCursorPosition(editor, group, target) : null
    const moved = target !== null && moveBlockGroup(editor, group, target)
    dragBlockGroupRef.current = null
    clearBlockGroup(false)
    const selection = moved && cursorTarget !== null
      ? blockGroupCursorSelection(editor, cursorTarget)
      : null
    if (selection) {
      editor.view.dispatch(editor.state.tr.setSelection(selection))
    } else {
      const fallback = (resolved?.from ?? group.anchor) + 1
      const pos = Math.max(0, Math.min(fallback, editor.state.doc.content.size))
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos))))
    }
    editor.view.focus()
    return true
  }

  function blockStartAtPointer(clientX: number, clientY: number, parentDepth?: number) {
    if (!editor) return null
    const view = editor.view
    let pos = view.posAtCoords({ left: clientX, top: clientY })?.pos
    if (pos === undefined) {
      const left = view.dom.getBoundingClientRect().left
      pos = view.posAtCoords({ left: left + 4, top: clientY })?.pos
    }
    if (pos === undefined) return null
    if (parentDepth !== undefined) return blockStartAtParentDepth(editor, pos, parentDepth)

    const $pos = editor.state.doc.resolve(pos)
    if ($pos.nodeAfter?.isBlock && !$pos.parent.isTextblock) {
      const wrapping = $pos.parent.type.name === 'listItem' || $pos.parent.type.name === 'taskItem'
      return wrapping ? $pos.before($pos.depth) : pos
    }
    if (!$pos.parent.isTextblock || $pos.depth === 0) return null
    const wrapping = $pos.node($pos.depth - 1)
    const depth = wrapping.type.name === 'listItem' || wrapping.type.name === 'taskItem'
      ? $pos.depth - 2
      : $pos.depth - 1
    return blockStartAtParentDepth(editor, pos, depth)
  }

  function onEditorPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (!editor || event.button !== 0 || pointerGroupRef.current) return
    const target = event.target
    if (!(target instanceof Node)) return
    if (target !== event.currentTarget && !editor.view.dom.contains(target)) return
    const anchor = blockStartAtPointer(event.clientX, event.clientY)
    if (anchor === null) return
    const blockDom = editor.view.nodeDOM(anchor)
    if (!(blockDom instanceof HTMLElement)) return
    const left = event.currentTarget.getBoundingClientRect().left
    if (event.clientX >= blockDom.getBoundingClientRect().left || event.clientX < left) {
      if (blockGroupRef.current) clearBlockGroup(false)
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointerGroupRef.current = {
      anchor,
      parentDepth: editor.state.doc.resolve(anchor).depth,
      pointerId: event.pointerId,
    }
    blockGroupReturnPosRef.current = anchor + 1
    const group = createBlockGroup(editor, anchor, anchor)
    if (group) selectBlockGroup(group)
  }

  function onEditorPointerMove(event: React.PointerEvent<HTMLElement>) {
    const pointer = pointerGroupRef.current
    if (!editor || !pointer || pointer.pointerId !== event.pointerId) return
    event.preventDefault()
    const anchorDom = editor.view.nodeDOM(pointer.anchor)
    if (!(anchorDom instanceof HTMLElement) || !anchorDom.parentElement) return
    const siblings = Array.from(anchorDom.parentElement.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
    const pointed = document.elementFromPoint(event.clientX, event.clientY)
    const pointedSibling = pointed ? siblings.find(child => child === pointed || child.contains(pointed)) : null
    const blockDom = pointedSibling ?? siblings.find(child => {
      const rect = child.getBoundingClientRect()
      return event.clientY >= rect.top && event.clientY <= rect.bottom
    })
    if (!blockDom) return
    const head = blockStartAtParentDepth(editor, editor.view.posAtDOM(blockDom, 0), pointer.parentDepth)
    if (head === null) return
    const group = createBlockGroup(editor, pointer.anchor, head)
    if (group) selectBlockGroup(group)
  }

  function finishPointerGroup(event: React.PointerEvent<HTMLElement>, focus: boolean) {
    const pointer = pointerGroupRef.current
    if (!pointer || pointer.pointerId !== event.pointerId) return
    pointerGroupRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (focus) editor?.view.focus()
  }

  function setBlockMenuVisibility(open: boolean) {
    blockMenuOpenRef.current = open
    setBlockMenuOpen(open)
  }

  useEffect(() => {
    if (!editor) return
    const update = () => {
      setRevision(value => value + 1)
      setBlockMenuVisibility(false)
      const items: HeadingItem[] = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') items.push({ level: node.attrs.level, text: node.textContent, pos })
      })
      setHeadings(items)
    }
    editor.on('update', update)
    update()
    return () => { editor.off('update', update) }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const pluginKey = new PluginKey('localBlockGroup')
    const plugin = new Plugin({
      key: pluginKey,
      props: {
        decorations: state => {
          if (!blockGroupRef.current || !(state.selection instanceof NodeRangeSelection)) return null
          const resolved = resolveBlockGroup(editor, blockGroupRef.current)
          if (!resolved || state.selection.from !== resolved.from || state.selection.to !== resolved.to) return null
          return getNodeRangeDecorations(state.selection.ranges as SelectionRange[])
        },
      },
    })
    editor.registerPlugin(plugin)

    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      const current = blockGroupRef.current
      if (!current) return
      if (blockGroupReturnPosRef.current !== null && transaction.docChanged) {
        blockGroupReturnPosRef.current = transaction.mapping.map(blockGroupReturnPosRef.current, 1)
      }
      if (transaction.docChanged) {
        const mapped = mapBlockGroup(current, transaction.mapping)
        const resolved = resolveBlockGroup(editor, mapped)
        const selectionIsGroup = editor.state.selection instanceof NodeRangeSelection
        if (!resolved) {
          clearBlockGroup(selectionIsGroup)
          return
        }
        if (!selectionIsGroup && !dragBlockGroupRef.current) {
          clearBlockGroup(false)
          return
        }
        blockGroupRef.current = mapped
        if (dragBlockGroupRef.current) dragBlockGroupRef.current = mapped
        setBlockGroup(mapped)
      } else if (!(editor.state.selection instanceof NodeRangeSelection) && !dragBlockGroupRef.current) {
        clearBlockGroup(false)
      }
    }
    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
      editor.unregisterPlugin(pluginKey)
    }
  }, [editor])

  useEffect(() => {
    const awareness = provider.awareness
    if (!awareness) return
    const update = () => {
      const people = new Map<string, { name: string; color: string }>()
      for (const state of awareness.getStates().values()) {
        if (state.user?.name) people.set(state.user.name, state.user)
      }
      setPresence([...people.values()])
    }
    awareness.on('change', update)
    update()
    return () => { awareness.off('change', update) }
  }, [provider])

  useEffect(() => {
    if (!saving) return
    const timer = window.setTimeout(() => { if (synced) setSaving(false) }, 900)
    return () => window.clearTimeout(timer)
  }, [saving, synced, revision])

  function clearSlash() {
    if (!editor) return null
    const { $from } = editor.state.selection
    return editor.chain().focus().deleteRange({ from: $from.start(), to: $from.pos })
  }

  function runSlashCommand(command: EditorCommand) {
    const chain = clearSlash()
    if (!chain || !editor) return
    switch (command.id) {
      case 'text': chain.setParagraph().run(); break
      case 'h1': chain.setHeading({ level: 1 }).run(); break
      case 'h2': chain.setHeading({ level: 2 }).run(); break
      case 'h3': chain.setHeading({ level: 3 }).run(); break
      case 'bullet': chain.toggleBulletList().run(); break
      case 'ordered': chain.toggleOrderedList().run(); break
      case 'task': chain.toggleTaskList().run(); break
      case 'quote': chain.toggleBlockquote().run(); break
      case 'code': chain.toggleCodeBlock().run(); break
      case 'divider': chain.setHorizontalRule().run(); break
      case 'table': chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break
      case 'image': {
        chain.run()
        const url = window.prompt('Ссылка на картинку', 'https://')
        if (url?.trim()) editor.chain().focus().setImage({ src: url.trim() }).run()
        break
      }
    }
    setSlashActiveQuery(null)
    setSlashActiveIndex(0)
  }

  function dismissSlash() {
    clearSlash()?.run()
    setSlashActiveQuery(null)
    setSlashActiveIndex(0)
  }

  const query = editor ? slashQuery(editor) : null
  const slashCommands = filterEditorCommands(query ?? '')
  const queryActiveIndex = slashActiveQuery === query ? slashActiveIndex : 0
  const currentSlashActiveIndex = slashCommands.length ? Math.min(queryActiveIndex, slashCommands.length - 1) : 0
  const activeSlashOption = slashCommands[currentSlashActiveIndex] ? slashOptionId(slashCommands[currentSlashActiveIndex]) : ''

  useEffect(() => {
    slashState.current = { query, commands: slashCommands, activeIndex: currentSlashActiveIndex }
  })

  useEffect(() => {
    if (!editor) return
    if (query !== null && activeSlashOption) editor.view.dom.setAttribute('aria-activedescendant', activeSlashOption)
    else editor.view.dom.removeAttribute('aria-activedescendant')
  }, [editor, query, activeSlashOption])

  useEffect(() => {
    runSlashCommandRef.current = runSlashCommand
    dismissSlashRef.current = dismissSlash
  })

  if (!editor) return <div className="editor-loading"><LoaderCircle className="spin" size={22} /> Открываем страницу…</div>

  const activeBlockGroup = activeBlock && blockGroup && isActiveBlockInGroup(activeBlock.pos) ? blockGroup : null
  const connectionLabel = connection === 'connected' ? synced ? saving ? 'Сохраняем…' : 'Сохранено' : 'Синхронизируем…' : connection === 'error' ? 'Нет доступа' : 'Восстанавливаем связь…'

  function setLink() {
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Ссылка', previous ?? 'https://')
    if (url === null) return
    if (!url.trim()) editor.chain().focus().unsetLink().run()
    else editor.chain().focus().setLink({ href: url.trim() }).run()
  }

  function exportMarkdown() {
    const markdown = `# ${page.title}\n\n${editor.markdown!.serialize(editor.getJSON())}`
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${page.title.replace(/[\\/:*?"<>|]/g, '-')}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function insertUploadedImage(file: File | undefined) {
    if (!file) return
    setEditorError('')
    try {
      const url = await uploadImage(file)
      editor.chain().focus().setImage({ src: url }).run()
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Не удалось загрузить картинку.')
    }
  }

  return (
    <main className="editor-shell">
      <header className="editor-topbar">
        <button type="button" className="icon-button mobile-menu" aria-label="Открыть панель" onClick={onOpenSidebar}><Menu size={19} /></button>
        <div className="breadcrumb"><span>{page.isProject ? 'Проект' : 'Страница'}</span><span>/</span><strong>{page.title}</strong></div>
        <div className="editor-top-actions">
          <div className={`save-state ${connection}`} title={connectionLabel}>
            {connection === 'connected' ? saving ? <LoaderCircle className="spin" size={15} /> : <Check size={15} /> : connection === 'error' ? <WifiOff size={15} /> : <Cloud size={15} />}
            <span>{connectionLabel}</span>
          </div>
          <div className="presence" aria-label={`На странице: ${presence.map(person => person.name).join(', ') || user.name}`}>
            {presence.map(person => <span key={person.name} className="presence-avatar" style={{ backgroundColor: person.color }} title={person.name}>{person.name.slice(0, 1).toUpperCase()}</span>)}
          </div>
          <Button type="button" variant="secondary" size="sm" className="export-button" onClick={exportMarkdown}><Download size={16} /><span>Markdown</span></Button>
        </div>
      </header>

      <div className="editor-scroll">
        <article
          className="page-article"
          onPointerDown={onEditorPointerDown}
          onPointerMove={onEditorPointerMove}
          onPointerUp={event => finishPointerGroup(event, true)}
          onPointerCancel={event => finishPointerGroup(event, false)}
          onLostPointerCapture={event => finishPointerGroup(event, false)}
        >
          {page.coverUrl && <div className="page-cover"><img src={page.coverUrl} alt="Обложка страницы" /></div>}
          <div className="page-main">
            <div className="page-appearance">
              <button type="button" onClick={() => { const icon = window.prompt('Иконка страницы — один символ или эмодзи', page.icon ?? '◈'); if (icon !== null) onAppearance({ icon: icon.trim() || null }) }}><Smile size={15} />{page.icon ? 'Сменить иконку' : 'Добавить иконку'}</button>
              <button type="button" onClick={() => page.coverUrl ? onAppearance({ coverUrl: null }) : coverInput.current?.click()}><PanelTop size={15} />{page.coverUrl ? 'Убрать обложку' : 'Добавить обложку'}</button>
              <input ref={coverInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={async event => {
                const file = event.target.files?.[0]
                if (file) {
                  try { onAppearance({ coverUrl: await uploadImage(file) }) } catch (error) { setEditorError(error instanceof Error ? error.message : 'Не удалось загрузить обложку.') }
                }
                event.target.value = ''
              }} />
            </div>
            {page.icon && <div className="page-icon" aria-hidden="true">{page.icon}</div>}
            <textarea
              className="page-title"
              aria-label="Название страницы"
              rows={1}
              defaultValue={page.title}
              key={page.id}
              onInput={event => { const target = event.currentTarget; target.style.height = 'auto'; target.style.height = `${target.scrollHeight}px` }}
              onBlur={event => { if (event.target.value.trim() && event.target.value.trim() !== page.title) onRename(event.target.value.trim()) }}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }}
            />

            <div className="format-toolbar" aria-label="Форматирование">
              <ToolbarButton label="Жирный" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></ToolbarButton>
              <ToolbarButton label="Курсив" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></ToolbarButton>
              <ToolbarButton label="Зачёркнутый" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={16} /></ToolbarButton>
              <ToolbarButton label="Встроенный код" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}><Code size={16} /></ToolbarButton>
              <span className="toolbar-separator" />
              <ToolbarButton label="Заголовок 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={17} /></ToolbarButton>
              <ToolbarButton label="Заголовок 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={17} /></ToolbarButton>
              <ToolbarButton label="Маркированный список" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={17} /></ToolbarButton>
              <ToolbarButton label="Нумерованный список" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={17} /></ToolbarButton>
              <ToolbarButton label="Список дел" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListTodo size={17} /></ToolbarButton>
              <ToolbarButton label="Цитата" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={16} /></ToolbarButton>
              <ToolbarButton label="Блок кода" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><SquareCode size={17} /></ToolbarButton>
              <span className="toolbar-separator" />
              <ToolbarButton label="Ссылка" active={editor.isActive('link')} onClick={setLink}><LinkIcon size={16} /></ToolbarButton>
              <ToolbarButton label="Картинка файлом" onClick={() => imageInput.current?.click()}><ImageIcon size={17} /></ToolbarButton>
              <ToolbarButton label="Таблица" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={17} /></ToolbarButton>
              <input ref={imageInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { void insertUploadedImage(event.target.files?.[0]); event.target.value = '' }} />
            </div>

            {editorError && <p className="editor-error" role="alert">{editorError}</p>}
            <div className="editor-content-wrap">
              <DragHandle
                editor={editor}
                nested
                onNodeChange={({ node, pos }) => {
                  setActiveBlock(node ? { pos, canTurn: node.isTextblock } : null)
                }}
                onElementDragStart={startBlockDrag}
                onElementDragEnd={finishBlockDrag}
              >
                <BlockMenu
                  open={blockMenuOpen}
                  group={activeBlockGroup !== null}
                  canTurn={activeBlock?.canTurn ?? false}
                  onOpenChange={open => setBlockMenuVisibility(open && activeBlock !== null)}
                  onGroupEscape={() => {
                    clearBlockGroup(true)
                    editor.view.focus()
                  }}
                  onTurn={target => {
                    if (activeBlock) turnBlock(editor, activeBlock.pos, target)
                    setBlockMenuVisibility(false)
                    editor.commands.focus()
                  }}
                  onDuplicate={() => {
                    if (activeBlockGroup) {
                      duplicateBlockGroup(editor, activeBlockGroup)
                      clearBlockGroup(true)
                    } else {
                      if (activeBlock) duplicateBlock(editor, activeBlock.pos)
                      setBlockMenuVisibility(false)
                    }
                    editor.commands.focus()
                  }}
                  onDelete={() => {
                    if (activeBlockGroup) {
                      const deleted = deleteBlockGroup(editor, activeBlockGroup)
                      clearBlockGroup(!deleted)
                    } else {
                      if (activeBlock) deleteBlock(editor, activeBlock.pos)
                      setBlockMenuVisibility(false)
                    }
                    editor.commands.focus()
                  }}
                />
              </DragHandle>
              <EditorContent editor={editor} />
              <BubbleMenu editor={editor} className="bubble-menu">
                <ToolbarButton label="Жирный" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></ToolbarButton>
                <ToolbarButton label="Курсив" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></ToolbarButton>
                <ToolbarButton label="Ссылка" active={editor.isActive('link')} onClick={setLink}><LinkIcon size={15} /></ToolbarButton>
              </BubbleMenu>
              <FloatingMenu editor={editor} className="slash-menu" shouldShow={({ state }) => {
                const { $from } = state.selection
                if (!$from.parent.isTextblock) return false
                const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
                return parseSlashQuery(text) !== null
              }} options={{ placement: 'right-start', offset: 12 }}>
                <SlashMenu commands={slashCommands} activeIndex={currentSlashActiveIndex} onActive={index => { setSlashActiveQuery(query); setSlashActiveIndex(index) }} onSelect={runSlashCommand} />
              </FloatingMenu>
            </div>
          </div>
        </article>
      </div>

      <aside className="page-outline" aria-label="Главы страницы">
        <span>На этой странице</span>
        {headings.length ? headings.map((heading, index) => <button type="button" key={`${heading.pos}-${index}`} className={`outline-level-${heading.level}`} onClick={() => {
          editor.commands.setTextSelection(heading.pos + 1)
          const node = editor.view.nodeDOM(heading.pos)
          if (node instanceof HTMLElement) node.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }}>{heading.text || 'Без названия'}</button>) : <p>Главы появятся после заголовков.</p>}
        <div className="outline-live"><Wifi size={14} /><span>{presence.length || 1} на странице</span></div>
      </aside>
    </main>
  )
}
