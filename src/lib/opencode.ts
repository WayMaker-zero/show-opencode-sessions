export type SessionListItem = {
  id: string
  title: string
  directory: string
  projectId: string
  version: string
  createdAt: number
  updatedAt: number
  summary: {
    additions: number
    deletions: number
    files: number
  }
  preview: string
}

export type SessionMessagePart = {
  id: string
  type: string
  text?: string
  tool?: string
  input?: any
  output?: any
  files?: string[]
  filename?: string
  data?: any
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
}

export type SessionListResponse = {
  items: SessionListItem[]
  total: number
}

async function readJson<T>(input: string) {
  const response = await fetch(input)
  const data = (await response.json()) as { message?: string } & T

  if (!response.ok) {
    throw new Error(data.message || '请求失败。')
  }

  return data
}

export function getMeta() {
  return readJson<{ ok: true }>('/api/opencode/meta')
}

export function getSessions(options: { query?: string; offset?: number; limit?: number }) {
  const params = new URLSearchParams()

  if (options.query?.trim()) {
    params.set('query', options.query.trim())
  }

  params.set('offset', String(options.offset ?? 0))
  params.set('limit', String(options.limit ?? 10))

  return readJson<SessionListResponse>(`/api/opencode/sessions?${params.toString()}`)
}

export function getSessionDetail(sessionId: string) {
  return readJson<SessionDetail>(`/api/opencode/sessions/${encodeURIComponent(sessionId)}`)
}
