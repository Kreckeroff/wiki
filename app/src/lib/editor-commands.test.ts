import { describe, expect, it } from 'vitest'
import { EDITOR_COMMANDS, filterEditorCommands, groupEditorCommands, moveActiveIndex, parseSlashQuery } from './editor-commands'

describe('editor command registry', () => {
  it('returns every implemented command for an empty query', () => {
    expect(filterEditorCommands('')).toHaveLength(12)
    expect(filterEditorCommands('')).toEqual(EDITOR_COMMANDS)
  })

  it('matches English and Russian aliases without regard to case', () => {
    expect(filterEditorCommands('ToDo').map(command => command.id)).toEqual(['task'])
    expect(filterEditorCommands('ЦИТАТА').map(command => command.id)).toEqual(['quote'])
    expect(filterEditorCommands('photo')).toEqual([])
    expect(filterEditorCommands('фото').map(command => command.id)).toEqual(['image'])
  })

  it('supports header and numbered heading aliases', () => {
    expect(filterEditorCommands('header').map(command => command.id)).toEqual(['h2'])
    expect(filterEditorCommands('heading 1').map(command => command.id)).toEqual(['h1'])
    expect(parseSlashQuery('/##')).toBe('##')
    expect(filterEditorCommands('##').map(command => command.id)).toEqual(['h2'])
  })

  it('accepts spaces and rejects a slash query interrupted by other text', () => {
    expect(parseSlashQuery('/heading 2')).toBe('heading 2')
    expect(parseSlashQuery('текст /code')).toBeNull()
    expect(parseSlashQuery('/code текст')).toBe('code текст')
    expect(filterEditorCommands(parseSlashQuery('/code текст') ?? '')).toEqual([])
  })

  it('groups only commands that remain after filtering', () => {
    const groups = groupEditorCommands(filterEditorCommands('code'))
    expect(groups.map(group => group.id)).toEqual(['formatting'])
    expect(groups[0].commands.map(command => command.id)).toEqual(['code'])
  })

  it('wraps keyboard navigation and ignores group headings', () => {
    expect(moveActiveIndex(0, -1, 12)).toBe(11)
    expect(moveActiveIndex(11, 1, 12)).toBe(0)
    expect(moveActiveIndex(0, 1, 0)).toBe(0)
  })
})
