import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js'

// Try to resolve the Wasm file dynamically to support both Vite dev server and pkg bundled environments
let wasmPath = ''
try {
  // CommonJS / Bundled
  const _require = typeof require !== 'undefined' ? require : createRequire(import.meta.url)
  wasmPath = _require.resolve('sql.js/dist/sql-wasm.wasm')
} catch (e) {
  // If resolution fails, maybe we are running inside pkg where paths are virtual.
  // Fallback to absolute virtual path
  wasmPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
}

type SessionRow = {
  id: string
  project_id: string
  directory: string
  title: string
  version: string
  summary_additions: number | null
  summary_deletions: number | null
  summary_files: number | null
  time_created: number
  time_updated: number
}

type MessageRow = {
  id: string
  time_created: number
  data: string
}

type PartRow = {
  id: string
  message_id: string
  time_created: number
  data: string
}

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
}

export type ExportedSessionFile = {
  format: 'show-opencode-session-export-v1'
  exportedAt: number
  source: 'opencode-local'
  sourceSessionId: string
  session: SessionListItem
  messages: SessionMessage[]
  totalMessages: number
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null

function getSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({ locateFile: () => wasmPath })
  }

  return sqlJsPromise
}

function resolveOpencodeRoot() {
  const root = path.join(homedir(), '.local', 'share', 'opencode')
  const dbPath = path.join(root, 'opencode.db')
  const storagePath = path.join(root, 'storage')

  if (!existsSync(root) || !existsSync(dbPath) || !existsSync(storagePath)) {
    return null
  }

  return { root, dbPath, storagePath }
}

async function openDatabase() {
  const rootInfo = resolveOpencodeRoot()
  if (!rootInfo) {
    throw new Error('没有在本机找到 `~/.local/share/opencode/`。')
  }

  const sqlJs = await getSqlJs()
  const buffer = await readFile(rootInfo.dbPath)

  return {
    rootInfo,
    db: new sqlJs.Database(new Uint8Array(buffer)),
  }
}

function getRows<T extends Record<string, unknown>>(db: Database, sql: string, params: SqlValue[] = []) {
  const statement = db.prepare(sql, params)
  const rows: T[] = []
  try {
    while (statement.step()) {
      rows.push(statement.getAsObject() as T)
    }
  } finally {
    statement.free()
  }
  return rows
}

function getScalarNumber(db: Database, sql: string, params: SqlValue[] = []) {
  const row = getRows<{ value: number }>(db, sql, params)[0]
  return Number(row?.value ?? 0)
}

function safeParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function summarizeTextParts(parts: PartRow[]) {
  const collected: string[] = []

  for (const part of parts) {
    const payload = safeParse<{ type?: string; text?: string }>(part.data)
    if (payload?.type === 'text' && typeof payload.text === 'string') {
      const normalized = normalizeText(payload.text)
      if (normalized) {
        collected.push(normalized)
      }
    }

    if (collected.join(' ').length > 220) {
      break
    }
  }

  return collected.join(' ').slice(0, 220)
}

function mapSessionRow(row: SessionRow, preview: string): SessionListItem {
  return {
    id: row.id,
    title: row.title,
    directory: row.directory,
    projectId: row.project_id,
    version: row.version,
    createdAt: row.time_created,
    updatedAt: row.time_updated,
    summary: {
      additions: row.summary_additions ?? 0,
      deletions: row.summary_deletions ?? 0,
      files: row.summary_files ?? 0,
    },
    preview,
  }
}

function enrichSessions(db: Database, rows: SessionRow[]) {
  return rows.map((row) => {
    const previewParts = getRows<PartRow>(
      db,
      `
        SELECT id, message_id, time_created, data
        FROM part
        WHERE session_id = ?
        ORDER BY time_created ASC, id ASC
        LIMIT 18
      `,
      [row.id],
    )

    return mapSessionRow(row, summarizeTextParts(previewParts))
  })
}

export async function getSessions(options: { query?: string; offset?: number; limit?: number }) {
  const { db } = await openDatabase()

  try {
    const query = options.query?.trim().toLowerCase() ?? ''
    const offset = Math.max(0, options.offset ?? 0)
    const limit = Math.min(50, Math.max(1, options.limit ?? 10))

    if (!query) {
      const total = getScalarNumber(db, 'SELECT COUNT(*) AS value FROM session WHERE time_archived IS NULL')
      const rows = getRows<SessionRow>(
        db,
        `
          SELECT
            id,
            project_id,
            directory,
            title,
            version,
            summary_additions,
            summary_deletions,
            summary_files,
            time_created,
            time_updated
          FROM session
          WHERE time_archived IS NULL
          ORDER BY time_updated DESC
          LIMIT ? OFFSET ?
        `,
        [limit, offset],
      )

      return {
        items: enrichSessions(db, rows),
        total,
      }
    }

    const like = `%${query}%`
    const whereClause = `
      s.time_archived IS NULL
      AND (
        lower(s.title) LIKE ?
        OR EXISTS (
          SELECT 1 FROM message m
          WHERE m.session_id = s.id AND lower(COALESCE(m.data, '')) LIKE ?
        )
        OR EXISTS (
          SELECT 1 FROM part p
          WHERE p.session_id = s.id AND lower(COALESCE(p.data, '')) LIKE ?
        )
      )
    `

    const total = getScalarNumber(
      db,
      `SELECT COUNT(*) AS value FROM session s WHERE ${whereClause}`,
      [like, like, like],
    )

    const rows = getRows<SessionRow>(
      db,
      `
        SELECT
          s.id,
          s.project_id,
          s.directory,
          s.title,
          s.version,
          s.summary_additions,
          s.summary_deletions,
          s.summary_files,
          s.time_created,
          s.time_updated
        FROM session s
        WHERE ${whereClause}
        ORDER BY s.time_updated DESC
        LIMIT ? OFFSET ?
      `,
      [like, like, like, limit, offset],
    )

    return {
      items: enrichSessions(db, rows),
      total,
    }
  } finally {
    db.close()
  }
}

function partToText(data: string) {
  const payload = safeParse<Record<string, unknown>>(data)
  if (!payload || typeof payload.type !== 'string') {
    return ''
  }

  if (payload.type === 'text' && typeof payload.text === 'string') {
    return payload.text.trim()
  }

  if (payload.type === 'patch' && Array.isArray(payload.files)) {
    const files = payload.files.filter((item): item is string => typeof item === 'string')
    if (files.length) {
      return `改动文件：${files.map((file) => path.basename(file)).join('、')}`
    }
  }

  if (payload.type === 'file') {
    const filename = typeof payload.filename === 'string' ? payload.filename : '附件'
    return `附件：${filename}`
  }

  return ''
}

type SessionDetailOptions = {
  cursor?: number
  limit?: number
  lite?: boolean
}

function toSessionMessagePart(part: PartRow, lite: boolean): SessionMessagePart {
  const payload = safeParse<any>(part.data) || {}
  const type = typeof payload.type === 'string' ? payload.type : 'unknown'

  if (!lite) {
    return {
      id: part.id,
      messageId: part.message_id,
      type,
      text: payload.text,
      tool: payload.tool,
      input: payload.state?.input,
      output: payload.state?.output,
      files: payload.files,
      filename: payload.filename,
      data: payload,
      hasDetail: false,
    }
  }

  return {
    id: part.id,
    messageId: part.message_id,
    type,
    text: typeof payload.text === 'string' ? payload.text : undefined,
    tool: typeof payload.tool === 'string' ? payload.tool : undefined,
    files: Array.isArray(payload.files) ? payload.files.filter((item: unknown): item is string => typeof item === 'string') : undefined,
    filename: typeof payload.filename === 'string' ? payload.filename : undefined,
    hasDetail: type === 'tool' || type === 'patch' || type === 'file' || type === 'step-start' || type === 'step-finish',
  }
}

export async function getSessionDetail(sessionId: string, options: SessionDetailOptions = {}): Promise<SessionDetail> {
  const { db } = await openDatabase()

  try {
    const rawCursor = Number.isFinite(options.cursor) ? Number(options.cursor) : 0
    const rawLimit = Number.isFinite(options.limit) ? Number(options.limit) : 60
    const cursor = Math.max(0, rawCursor)
    const limit = Math.min(100, Math.max(1, rawLimit))
    const lite = options.lite ?? true

    const sessionRow = getRows<SessionRow>(
      db,
      `
        SELECT
          id,
          project_id,
          directory,
          title,
          version,
          summary_additions,
          summary_deletions,
          summary_files,
          time_created,
          time_updated
        FROM session
        WHERE id = ?
        LIMIT 1
      `,
      [sessionId],
    )[0]

    if (!sessionRow) {
      throw new Error('会话不存在。')
    }

    const session = enrichSessions(db, [sessionRow])[0]

    const totalMessages = getScalarNumber(
      db,
      `
        SELECT COUNT(*) AS value
        FROM message
        WHERE session_id = ?
      `,
      [sessionId],
    )

    const messageRows = getRows<MessageRow>(
      db,
      `
        SELECT id, time_created, data
        FROM message
        WHERE session_id = ?
        ORDER BY time_created ASC, id ASC
        LIMIT ? OFFSET ?
      `,
      [sessionId, limit, cursor],
    )

    const messageIds = messageRows.map((row) => row.id)
    let partRows: PartRow[] = []

    if (messageIds.length > 0) {
      const placeholders = messageIds.map(() => '?').join(', ')
      partRows = getRows<PartRow>(
        db,
        `
          SELECT id, message_id, time_created, data
          FROM part
          WHERE session_id = ?
            AND message_id IN (${placeholders})
          ORDER BY time_created ASC, id ASC
        `,
        [sessionId, ...messageIds],
      )
    }

    const groupedParts = new Map<string, PartRow[]>()
    for (const row of partRows) {
      const existing = groupedParts.get(row.message_id)
      if (existing) {
        existing.push(row)
      } else {
        groupedParts.set(row.message_id, [row])
      }
    }

    const messages = messageRows
      .map((row) => {
        const meta = safeParse<{
          role?: 'user' | 'assistant'
          time?: { created?: number }
          modelID?: string
          providerID?: string
          model?: { modelID?: string; providerID?: string }
        }>(row.data)

        const rawParts = groupedParts.get(row.id) ?? []
        const parsedParts = rawParts.map((part) => toSessionMessagePart(part, lite))
        const parts = rawParts.map((part) => partToText(part.data)).filter(Boolean)
        const text = parts.join('\n\n').trim()
        const provider = meta?.providerID ?? meta?.model?.providerID
        const model = meta?.modelID ?? meta?.model?.modelID

        return {
          id: row.id,
          role: meta?.role === 'assistant' ? 'assistant' : 'user',
          createdAt: meta?.time?.created ?? row.time_created,
          modelLabel: [provider, model].filter(Boolean).join(' / ') || undefined,
          text,
          parts: parsedParts,
        } satisfies SessionMessage
      })
      .filter((message) => message.text || message.parts.length > 0)

    const nextCursor = cursor + messageRows.length < totalMessages ? cursor + messageRows.length : null

    return {
      session,
      messages,
      totalMessages,
      cursor,
      nextCursor,
      limit,
    }
  } finally {
    db.close()
  }
}

export async function getSessionPartDetail(sessionId: string, partId: string): Promise<SessionMessagePart> {
  const { db } = await openDatabase()

  try {
    const row = getRows<PartRow>(
      db,
      `
        SELECT id, message_id, time_created, data
        FROM part
        WHERE session_id = ? AND id = ?
        LIMIT 1
      `,
      [sessionId, partId],
    )[0]

    if (!row) {
      throw new Error('消息片段不存在。')
    }

    return toSessionMessagePart(row, false)
  } finally {
    db.close()
  }
}

export async function exportSessionFile(sessionId: string): Promise<ExportedSessionFile> {
  const mergedMessages: SessionMessage[] = []
  let cursor = 0
  let nextCursor: number | null = 0
  let session: SessionListItem | null = null
  let totalMessages = 0

  while (nextCursor !== null) {
    const detail = await getSessionDetail(sessionId, { cursor, limit: 100, lite: false })

    if (!session) {
      session = detail.session
    }

    totalMessages = detail.totalMessages
    mergedMessages.push(...detail.messages)
    nextCursor = detail.nextCursor

    if (nextCursor !== null) {
      if (nextCursor <= cursor) {
        throw new Error('会话导出失败：分页游标异常。')
      }
      cursor = nextCursor
    }
  }

  if (!session) {
    throw new Error('会话导出失败：会话不存在。')
  }

  return {
    format: 'show-opencode-session-export-v1',
    exportedAt: Date.now(),
    source: 'opencode-local',
    sourceSessionId: session.id,
    session,
    messages: mergedMessages,
    totalMessages,
  }
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

async function handleMeta(res: ServerResponse) {
  const rootInfo = resolveOpencodeRoot()

  if (!rootInfo) {
    sendJson(res, 404, { message: '没有找到本机 opencode 历史目录。' })
    return
  }

  sendJson(res, 200, { ok: true })
}

async function handleSessions(url: URL, res: ServerResponse) {
  const query = url.searchParams.get('query') ?? ''
  const offset = Number(url.searchParams.get('offset') ?? '0')
  const limit = Number(url.searchParams.get('limit') ?? '10')
  const result = await getSessions({ query, offset, limit })
  sendJson(res, 200, result)
}

async function handleSessionPartDetail(sessionId: string, partId: string, res: ServerResponse) {
  const result = await getSessionPartDetail(sessionId, partId)
  sendJson(res, 200, { part: result })
}

async function handleSessionExport(sessionId: string, res: ServerResponse) {
  const result = await exportSessionFile(sessionId)
  sendJson(res, 200, result)
}

export async function handleOpencodeApi(req: IncomingMessage, res: ServerResponse) {
  const rawUrl = req.url ?? '/'
  const url = new URL(rawUrl, 'http://localhost')

  try {
    if (url.pathname === '/api/opencode/meta') {
      await handleMeta(res)
      return
    }

    if (url.pathname === '/api/opencode/sessions') {
      await handleSessions(url, res)
      return
    }

    if (url.pathname.includes('/parts/')) {
      const sessionPrefix = '/api/opencode/sessions/'
      const partMarker = '/parts/'
      const partMarkerIndex = url.pathname.indexOf(partMarker)

      if (url.pathname.startsWith(sessionPrefix) && partMarkerIndex > sessionPrefix.length) {
        const sessionId = decodeURIComponent(url.pathname.slice(sessionPrefix.length, partMarkerIndex))
        const partId = decodeURIComponent(url.pathname.slice(partMarkerIndex + partMarker.length))

        if (sessionId && partId) {
          await handleSessionPartDetail(sessionId, partId, res)
          return
        }
      }
    }

    if (url.pathname.endsWith('/export') && url.pathname.startsWith('/api/opencode/sessions/')) {
      const prefix = '/api/opencode/sessions/'
      const rawSessionId = url.pathname.slice(prefix.length, -'/export'.length)
      const sessionId = decodeURIComponent(rawSessionId)

      if (!sessionId) {
        sendJson(res, 400, { message: '无效的会话 ID。' })
        return
      }

      await handleSessionExport(sessionId, res)
      return
    }

    if (url.pathname.startsWith('/api/opencode/sessions/')) {
      const sessionId = decodeURIComponent(url.pathname.slice('/api/opencode/sessions/'.length))
      const cursor = Number(url.searchParams.get('cursor') ?? '0')
      const limit = Number(url.searchParams.get('limit') ?? '60')
      const liteParam = (url.searchParams.get('lite') ?? '1').toLowerCase()
      const lite = liteParam !== '0' && liteParam !== 'false'
      const result = await getSessionDetail(sessionId, { cursor, limit, lite })
      sendJson(res, 200, result)
      return
    }

    sendJson(res, 404, { message: '接口不存在。' })
  } catch (error) {
    sendJson(res, 500, {
      message: error instanceof Error ? error.message : '读取 opencode 历史失败。',
    })
  }
}
