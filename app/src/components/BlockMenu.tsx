import { Copy, GripVertical, Repeat2, Trash2 } from 'lucide-react'
import { EDITOR_COMMANDS } from '../lib/editor-commands'
import type { BlockTurn } from '../lib/block-operations'
import { shouldExitBlockGroupOnTrigger } from '../lib/block-group-ui'
import { EditorCommandIcon } from './EditorCommandIcon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

const turnOrder: readonly BlockTurn[] = ['text', 'h1', 'h2', 'h3', 'bullet', 'ordered', 'task', 'quote', 'code']
const turnCommands = turnOrder.map(id => {
  const command = EDITOR_COMMANDS.find(item => item.id === id)
  if (!command) throw new Error(`Неизвестный тип блока: ${id}`)
  return { ...command, id }
})

export function BlockMenu({ open, group, canTurn, onOpenChange, onTurn, onDuplicate, onDelete, onGroupEscape }: {
  open: boolean
  group: boolean
  canTurn: boolean
  onOpenChange: (open: boolean) => void
  onTurn: (target: BlockTurn) => void
  onDuplicate: () => void
  onDelete: () => void
  onGroupEscape: () => void
}) {
  const isMobile = window.matchMedia('(max-width: 767px)').matches
  const label = group ? 'Действия с группой блоков' : 'Действия с блоком'

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="drag-handle" aria-label={label} onPointerDownCapture={event => {
          // Radix opens on pointerdown and cancels the event, which also cancels HTML5 drag.
          event.stopPropagation()
        }} onClick={() => onOpenChange(!open)} onKeyDown={event => {
          if (!shouldExitBlockGroupOnTrigger(event.key, group)) return
          event.preventDefault()
          event.stopPropagation()
          onGroupEscape()
        }}>
          <span className="drag-handle-visual">
            <GripVertical size={17} aria-hidden="true" />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="block-menu-content" align="start" sideOffset={8} aria-label={label}>
        {!group && <DropdownMenuSub>
          <DropdownMenuSubTrigger className="block-menu-item" disabled={!canTurn}>
            <Repeat2 aria-hidden="true" />
            <span>Превратить в</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="block-menu-content block-turn-menu" sideOffset={isMobile ? -216 : 4} collisionPadding={8} aria-label="Тип блока">
            {turnCommands.map(command => (
              <DropdownMenuItem key={command.id} className="block-menu-item" onSelect={() => onTurn(command.id)}>
                <EditorCommandIcon icon={command.icon} />
                <span>{command.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>}
        <DropdownMenuItem className="block-menu-item" onSelect={onDuplicate}>
          <Copy aria-hidden="true" />
          <span>Дублировать</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="block-menu-separator" />
        <DropdownMenuItem className="block-menu-item" variant="destructive" onSelect={onDelete}>
          <Trash2 aria-hidden="true" />
          <span>Удалить</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
