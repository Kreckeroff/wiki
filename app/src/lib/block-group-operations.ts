import type { Editor } from '@tiptap/core'
import { Fragment, type Node as ProseMirrorNode, type ResolvedPos } from '@tiptap/pm/model'
import { Selection } from '@tiptap/pm/state'
import { getSelectionRanges, NodeRangeSelection } from '@tiptap/extension-node-range'

export interface BlockGroup {
  anchor: number
  head: number
  anchorNode: ProseMirrorNode
  headNode: ProseMirrorNode
}

export interface ResolvedBlockGroup {
  from: number
  to: number
  depth: number
  selection: NodeRangeSelection
}

interface BlockAtStart {
  $pos: ResolvedPos
  node: ProseMirrorNode
  index: number
}

function blockAtStart(editor: Editor, pos: number): BlockAtStart | null {
  if (!Number.isInteger(pos) || pos < 0 || pos >= editor.state.doc.content.size) return null
  const $pos = editor.state.doc.resolve(pos)
  const node = $pos.nodeAfter
  if (!node?.isBlock || $pos.parent.isTextblock) return null
  return { $pos, node, index: $pos.index() }
}

export function createBlockGroup(editor: Editor, anchorPos: number, headPos: number): BlockGroup | null {
  const anchor = blockAtStart(editor, anchorPos)
  const head = blockAtStart(editor, headPos)
  if (!anchor || !head || !anchor.$pos.sameParent(head.$pos)) return null
  const group = { anchor: anchorPos, head: headPos, anchorNode: anchor.node, headNode: head.node }
  return resolveBlockGroup(editor, group) ? group : null
}

export function resolveBlockGroup(editor: Editor, group: BlockGroup): ResolvedBlockGroup | null {
  const anchor = blockAtStart(editor, group.anchor)
  const head = blockAtStart(editor, group.head)
  if (!anchor || !head || !anchor.$pos.sameParent(head.$pos)) return null
  if (anchor.node !== group.anchorNode || head.node !== group.headNode) return null

  const from = Math.min(group.anchor, group.head)
  const to = from === group.anchor ? group.head + head.node.nodeSize : group.anchor + anchor.node.nodeSize
  const depth = anchor.$pos.depth
  const ranges = getSelectionRanges(
    editor.state.doc.resolve(from),
    editor.state.doc.resolve(to),
    depth,
    { extendOnBoundaryOverlap: false },
  )
  if (ranges.length !== Math.abs(anchor.index - head.index) + 1) return null

  return {
    from,
    to,
    depth,
    selection: NodeRangeSelection.create(editor.state.doc, from, to, depth),
  }
}

export function moveBlockGroupBoundary(
  editor: Editor,
  group: BlockGroup,
  direction: 'up' | 'down',
): BlockGroup | null {
  const resolved = resolveBlockGroup(editor, group)
  if (!resolved) return null
  const head = blockAtStart(editor, group.head)!
  const parent = head.$pos.parent
  let headIndex = head.index + (direction === 'down' ? 1 : -1)

  headIndex = Math.max(0, Math.min(parent.childCount - 1, headIndex))
  if (headIndex === head.index) return { ...group }

  const headPos = head.$pos.posAtIndex(headIndex)
  const nextHead = blockAtStart(editor, headPos)
  if (!nextHead) return null
  return { anchor: group.anchor, head: headPos, anchorNode: group.anchorNode, headNode: nextHead.node }
}

function blockGroupNodes(resolved: ResolvedBlockGroup) {
  const nodes: ProseMirrorNode[] = []
  for (const range of resolved.selection.ranges) {
    const node = range.$from.nodeAfter
    if (!node) return null
    nodes.push(node)
  }
  return nodes
}

export function duplicateBlockGroup(editor: Editor, group: BlockGroup) {
  const resolved = resolveBlockGroup(editor, group)
  if (!resolved) return false
  const nodes = blockGroupNodes(resolved)
  if (!nodes) return false
  return editor.chain().insertContentAt(resolved.to, nodes.map(node => node.toJSON())).run()
}

export function deleteBlockGroup(editor: Editor, group: BlockGroup) {
  const resolved = resolveBlockGroup(editor, group)
  if (!resolved) return false
  const first = blockAtStart(editor, resolved.from)!
  const last = blockAtStart(editor, Math.max(group.anchor, group.head))!
  const hasNext = last.index + 1 < last.$pos.parent.childCount
  const bias = hasNext || first.index === 0 ? 1 : -1
  const applied = editor.chain().command(({ tr }) => {
    tr.delete(resolved.from, resolved.to)
    tr.setSelection(Selection.near(tr.doc.resolve(resolved.from), bias))
    return true
  }).run()
  if (applied && editor.isInitialized && editor.view.dom.isConnected) editor.view.focus()
  return applied
}

export function moveBlockGroup(editor: Editor, group: BlockGroup, target: number) {
  const resolved = resolveBlockGroup(editor, group)
  if (!resolved || !Number.isInteger(target) || target < 0 || target > editor.state.doc.content.size) return false
  if (target >= resolved.from && target <= resolved.to) return false
  const $target = editor.state.doc.resolve(target)
  if ($target.parent.isTextblock || $target.parent.inlineContent) return false
  const nodes = blockGroupNodes(resolved)
  if (!nodes) return false
  const content = Fragment.from(nodes)
  if (!$target.parent.canReplace($target.index(), $target.index(), content)) return false

  const prepared = (() => {
    try {
      const tr = editor.state.tr
      tr.delete(resolved.from, resolved.to)
      tr.insert(tr.mapping.map(target), content)
      tr.doc.check()
      return tr
    } catch {
      return null
    }
  })()
  if (!prepared) return false

  return editor.chain().command(({ tr }) => {
    for (const step of prepared.steps) tr.step(step)
    return true
  }).run()
}
