export interface UserRecord {
  id: string
  name: string
  email: string
  password_hash?: string
}

export interface AuthContext {
  user: UserRecord
  sessionId: string
  csrfToken: string
}

export interface PageRecord {
  id: string
  workspace_id: string
  parent_id: string | null
  title: string
  icon: string | null
  cover_url: string | null
  position: number
  is_project: boolean
  yjs_state?: Uint8Array | null
  markdown?: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface PageDto {
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

export function toPageDto(page: PageRecord): PageDto {
  return {
    id: page.id,
    workspaceId: page.workspace_id,
    parentId: page.parent_id,
    title: page.title,
    icon: page.icon,
    coverUrl: page.cover_url,
    position: Number(page.position),
    isProject: page.is_project,
    updatedAt: page.updated_at,
  }
}
