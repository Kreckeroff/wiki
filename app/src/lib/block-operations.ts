import type { Editor } from '@tiptap/core'

export function duplicateBlock(editor: Editor, pos: number) {
  if (!Number.isInteger(pos) || pos < 0 || pos >= editor.state.doc.content.size) return false
  const node = editor.state.doc.nodeAt(pos)
  if (!node?.isBlock) return false
  return editor.chain().insertContentAt(pos + node.nodeSize, node.toJSON()).run()
}

export function deleteBlock(editor: Editor, pos: number) {
  if (!Number.isInteger(pos) || pos < 0 || pos >= editor.state.doc.content.size) return false
  const node = editor.state.doc.nodeAt(pos)
  if (!node?.isBlock) return false
  return editor.chain().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
}

export type BlockTurn = 'text' | 'h1' | 'h2' | 'h3' | 'bullet' | 'ordered' | 'task' | 'quote' | 'code'

export function turnBlock(editor: Editor, pos: number, target: BlockTurn) {
  if (!Number.isInteger(pos) || pos < 0 || pos >= editor.state.doc.content.size) return false
  const node = editor.state.doc.nodeAt(pos)
  if (!node?.isTextblock) return false
  const inline = node.content.toJSON()
  const paragraph = { type: 'paragraph', content: inline }
  let replacement: Record<string, unknown>
  switch (target) {
    case 'text': replacement = paragraph; break
    case 'h1':
    case 'h2':
    case 'h3': replacement = { type: 'heading', attrs: { level: Number(target.slice(1)) }, content: inline }; break
    case 'bullet':
    case 'ordered': replacement = { type: target === 'bullet' ? 'bulletList' : 'orderedList', content: [{ type: 'listItem', content: [paragraph] }] }; break
    case 'task': replacement = { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [paragraph] }] }; break
    case 'quote': replacement = { type: 'blockquote', content: [paragraph] }; break
    case 'code': replacement = { type: 'codeBlock', content: [{ type: 'text', text: node.textContent }] }; break
  }
  return editor.chain().insertContentAt({ from: pos, to: pos + node.nodeSize }, replacement).run()
}
