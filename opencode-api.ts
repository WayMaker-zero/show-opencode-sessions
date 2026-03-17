import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js'

const require = createRequire(import.meta.url)
const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')

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

export type SessionMessage = {
  id: string
  role: 'user' | 'assistant'
  createdAt: number
  modelLabel?: string
  text: string
}

export type SessionDetail = {
  session: SessionListItem
  messages: SessionMessage[]
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

  while (statement.step()) {
    rows.push(statement.getAsObject() as T)
  }

  statement.free()
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

export async function getSessionDetail(sessionId: string): Promise<SessionDetail> {
  const { db } = await openDatabase()

  try {
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

    const messageRows = getRows<MessageRow>(
      db,
      `
        SELECT id, time_created, data
        FROM message
        WHERE session_id = ?
        ORDER BY time_created ASC, id ASC
      `,
      [sessionId],
    )

    const partRows = getRows<PartRow>(
      db,
      `
        SELECT id, message_id, time_created, data
        FROM part
        WHERE session_id = ?
        ORDER BY time_created ASC, id ASC
      `,
      [sessionId],
    )

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

        const parts = (groupedParts.get(row.id) ?? []).map((part) => partToText(part.data)).filter(Boolean)
        const text = parts.join('\n\n').trim()
        const provider = meta?.providerID ?? meta?.model?.providerID
        const model = meta?.modelID ?? meta?.model?.modelID

        return {
          id: row.id,
          role: meta?.role === 'assistant' ? 'assistant' : 'user',
          createdAt: meta?.time?.created ?? row.time_created,
          modelLabel: [provider, model].filter(Boolean).join(' / ') || undefined,
          text,
        } satisfies SessionMessage
      })
      .filter((message) => message.text)

    return { session, messages }
  } finally {
    db.close()
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

async function handleSessionDetail(sessionId: string, res: ServerResponse) {
  const result = await getSessionDetail(sessionId)
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

    if (url.pathname.startsWith('/api/opencode/sessions/')) {
      const sessionId = decodeURIComponent(url.pathname.slice('/api/opencode/sessions/'.length))
      await handleSessionDetail(sessionId, res)
      return
    }

    sendJson(res, 404, { message: '接口不存在。' })
  } catch (error) {
    sendJson(res, 500, {
      message: error instanceof Error ? error.message : '读取 opencode 历史失败。',
    })
  }
}
