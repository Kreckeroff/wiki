export interface User {
  id: string
  name: string
  email: string
  color: string
}

export interface Workspace {
  id: string
  name: string
  role: 'owner' | 'member'
}

export interface Page {
  id: string
  workspaceId: string
  parentId: string | null
  title: string
  icon: string | null
  coverUrl: string | null
  position: number
  isProject: boolean
  updatedAt: string
}

export interface Bootstrap {
  user: User
  workspaces: Workspace[]
  currentWorkspaceId: string | null
  pages: Page[]
  csrfToken: string
  registrationEnabled: boolean
}

export type MoveZone = 'inside' | 'before' | 'after'

export interface SearchPathItem {
  id: string
  title: string
}

export interface SearchResult {
  id: string
  title: string
  icon: string | null
  isProject: boolean
  path: SearchPathItem[]
  snippet: string
  matchedIn: 'title' | 'content'
  updatedAt: string
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
}
