import type { Editor } from '@tiptap/core'
import { NodeRangeSelection } from '@tiptap/extension-node-range'
import { NodeSelection, TextSelection, type EditorState, type Selection } from '@tiptap/pm/state'
import { dropPoint, type Mapping } from '@tiptap/pm/transform'
import { resolveBlockGroup, type BlockGroup } from './block-group-operations'

export function blockGroupDropTarget(editor: Editor, group: BlockGroup, mousePos: number): number | null {
  const resolved = resolveBlockGroup(editor, group)
  if (!resolved || !Number.isInteger(mousePos) || mousePos < 0 || mousePos > editor.state.doc.content.size) return null
  return dropPoint(editor.state.doc, mousePos, resolved.selection.content()) ?? mousePos
}

export function blockGroupForDrag(editor: Editor, group: BlockGroup | null, pos: number): BlockGroup | null {
  if (!group || !Number.isInteger(pos)) return null
  const resolved = resolveBlockGroup(editor, group)
  return resolved?.selection.ranges.some(range => range.$from.pos === pos) ? group : null
}

export function mapBlockGroup(group: BlockGroup, mapping: Mapping): BlockGroup {
  return {
    ...group,
    anchor: mapping.map(group.anchor, 1),
    head: mapping.map(group.head, 1),
  }
}

export function blockStartAtParentDepth(editor: Editor, pos: number, parentDepth: number): number | null {
  if (!Number.isInteger(pos) || pos < 0 || pos > editor.state.doc.content.size || parentDepth < 0) return null
  try {
    const $pos = editor.state.doc.resolve(pos)
    if ($pos.depth === parentDepth) return $pos.nodeAfter?.isBlock ? pos : null
    if ($pos.depth <= parentDepth) return null
    const start = $pos.before(parentDepth + 1)
    return editor.state.doc.resolve(start).nodeAfter?.isBlock ? start : null
  } catch {
    return null
  }
}

export function blockStartAtSelection(editor: Editor): number | null {
  const { selection } = editor.state
  if (selection instanceof NodeSelection && selection.node.isBlock) return selection.from
  const { $from } = selection
  if (!$from.parent.isTextblock || $from.depth === 0) return null
  const parent = $from.node($from.depth - 1)
  const depth = parent.type.name === 'listItem' || parent.type.name === 'taskItem'
    ? $from.depth - 1
    : $from.depth
  return $from.before(depth)
}

export function getAwarenessSelection(state: EditorState): Selection {
  const { selection } = state
  if (!(selection instanceof NodeRangeSelection) && !(selection instanceof NodeSelection)) return selection
  const $anchor = state.doc.resolve(selection.anchor)
  return TextSelection.findFrom($anchor, 1, true)
    ?? TextSelection.findFrom($anchor, -1, true)
    ?? TextSelection.create(state.doc, selection.anchor, selection.anchor)
}

export function blockGroupCursorPosition(editor: Editor, group: BlockGroup, target: number): number | null {
  const resolved = resolveBlockGroup(editor, group)
  if (!resolved || !Number.isInteger(target) || target < 0 || target > editor.state.doc.content.size) return null
  if (target >= resolved.from && target <= resolved.to) return null
  return target > resolved.to ? target - (resolved.to - resolved.from) : target
}

export function blockGroupCursorSelection(editor: Editor, pos: number): Selection | null {
  if (!Number.isInteger(pos) || pos < 0 || pos >= editor.state.doc.content.size) return null
  const node = editor.state.doc.nodeAt(pos)
  if (node?.isBlock && node.isAtom && NodeSelection.isSelectable(node)) {
    return NodeSelection.create(editor.state.doc, pos)
  }
  return TextSelection.findFrom(editor.state.doc.resolve(pos + 1), 1, true)
    ?? TextSelection.findFrom(editor.state.doc.resolve(pos), -1, true)
    ?? TextSelection.create(editor.state.doc, pos)
}

export function shouldExitBlockGroupOnTrigger(key: string, group: boolean): boolean {
  return group && key === 'Escape'
}
