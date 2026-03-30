export type SessionListItem = {
  id: string
  title: string
  directory: string
  projectId: string
  version: string
  createdAt: number
  updatedAt: number
  isImported?: boolean
  sourceSessionId?: string
  restoreCommandAvailable?: boolean
  summary: {
    additions: number
    deletions: number
    files: number
  }
  preview: string
}

export type SessionMessagePart = {
  id: string
  messageId?: string
  type: string
  text?: string
  tool?: string
  input?: any
  output?: any
  files?: string[]
  filename?: string
  data?: any
  hasDetail?: boolean
}

export type SessionMessage = {
  id: string
  role: 'user' | 'assistant'
  createdAt: number
  modelLabel?: string
  text: string
  parts: SessionMessagePart[]
}

export type SessionDetail = {
  session: SessionListItem
  messages: SessionMessage[]
  totalMessages: number
  cursor: number
  nextCursor: number | null
  limit: number
  restoreCommandAvailable?: boolean
}

export type SessionListResponse = {
  items: SessionListItem[]
  total: number
}

export type ExportedSessionFile = {
  format: 'show-opencode-session-export-v1'
  exportedAt: number
  source: 'opencode-local' | 'imported-file'
  sourceSessionId: string
  session: SessionListItem
  messages: SessionMessage[]
  totalMessages: number
}

async function readJson<T>(input: string, signal?: AbortSignal) {
  const response = await fetch(input, { signal })
  const data = (await response.json()) as { message?: string } & T

  if (!response.ok) {
    throw new Error(data.message || '请求失败。')
  }

  return data
}

export function getMeta(signal?: AbortSignal) {
  return readJson<{ ok: true }>('/api/opencode/meta', signal)
}

export function getSessions(options: { query?: string; offset?: number; limit?: number; signal?: AbortSignal }) {
  const params = new URLSearchParams()

  if (options.query?.trim()) {
    params.set('query', options.query.trim())
  }

  params.set('offset', String(options.offset ?? 0))
  params.set('limit', String(options.limit ?? 10))

  return readJson<SessionListResponse>(`/api/opencode/sessions?${params.toString()}`, options.signal)
}

export function getSessionDetail(
  sessionId: string,
  options: { cursor?: number; limit?: number; lite?: boolean; signal?: AbortSignal } = {},
) {
  const params = new URLSearchParams()
  params.set('cursor', String(options.cursor ?? 0))
  params.set('limit', String(options.limit ?? 60))
  params.set('lite', options.lite === false ? '0' : '1')

  return readJson<SessionDetail>(
    `/api/opencode/sessions/${encodeURIComponent(sessionId)}?${params.toString()}`,
    options.signal,
  )
}

export function getSessionPartDetail(sessionId: string, partId: string, signal?: AbortSignal) {
  return readJson<{ part: SessionMessagePart }>(
    `/api/opencode/sessions/${encodeURIComponent(sessionId)}/parts/${encodeURIComponent(partId)}`,
    signal,
  )
}

export function exportSessionFile(sessionId: string, signal?: AbortSignal) {
  return readJson<ExportedSessionFile>(
    `/api/opencode/sessions/${encodeURIComponent(sessionId)}/export`,
    signal,
  )
}
