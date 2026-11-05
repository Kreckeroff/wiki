import type { MouseEvent } from 'react'
import type { EditorCommand } from '../lib/editor-commands'
import { groupEditorCommands, slashOptionId } from '../lib/editor-commands'
import { EditorCommandIcon } from './EditorCommandIcon'
import { MenuItem } from './ui/menu-item'

export function SlashMenu({ commands, activeIndex, onActive, onSelect }: {
  commands: readonly EditorCommand[]
  activeIndex: number
  onActive: (index: number) => void
  onSelect: (command: EditorCommand) => void
}) {
  const groups = groupEditorCommands(commands)

  function keepEditorFocus(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
  }

  return (
    <div className="slash-menu-content">
      <div className="slash-menu-caption">Вставить блок</div>
      <div className="slash-menu-options" role="listbox" aria-label="Тип блока">
        {groups.map(group => (
          <div className="slash-menu-group" role="group" aria-label={group.label} key={group.id}>
            <div className="slash-menu-group-label" aria-hidden="true">{group.label}</div>
            {group.commands.map(command => {
              const index = commands.indexOf(command)
              return (
                <MenuItem
                  id={slashOptionId(command)}
                  key={command.id}
                  icon={<EditorCommandIcon icon={command.icon} />}
                  label={command.label}
                  description={command.description}
                  active={index === activeIndex}
                  onMouseDown={keepEditorFocus}
                  onMouseEnter={() => onActive(index)}
                  onClick={() => onSelect(command)}
                />
              )
            })}
          </div>
        ))}
        {!commands.length && <p className="slash-empty">Ничего не найдено. Измените запрос.</p>}
      </div>
      <div className="slash-menu-footer" aria-hidden="true"><span>↑↓ выбрать</span><span>Enter вставить</span><span>Esc закрыть</span></div>
    </div>
  )
}
