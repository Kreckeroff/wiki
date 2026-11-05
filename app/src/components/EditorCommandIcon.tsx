import {
  Heading1, Heading2, Heading3, Image, List, ListOrdered, ListTodo, Minus,
  Quote, SquareCode, Table, Type,
} from 'lucide-react'
import type { EditorCommandIcon as EditorCommandIconName } from '../lib/editor-commands'

const icons: Record<EditorCommandIconName, typeof Type> = {
  type: Type,
  heading1: Heading1,
  heading2: Heading2,
  heading3: Heading3,
  bullet: List,
  ordered: ListOrdered,
  task: ListTodo,
  quote: Quote,
  code: SquareCode,
  divider: Minus,
  table: Table,
  image: Image,
}

export function EditorCommandIcon({ icon, size = 16 }: { icon: EditorCommandIconName; size?: number }) {
  const Icon = icons[icon]
  return <Icon size={size} aria-hidden="true" />
}
