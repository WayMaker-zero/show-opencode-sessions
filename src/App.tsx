import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  Copy,
  LoaderCircle,
  Search,
  User,
  Bot,
} from 'lucide-react'
import {
  getMeta,
  getSessionDetail,
  getSessions,
  type SessionDetail,
  type SessionListItem,
} from './lib/opencode'

function formatShortDate(value: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function formatLongDate(value: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function formatCommand(sessionId: string) {
  return `opencode --session ${sessionId}`
}

export default function App() {
  const [booting, setBooting] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [copied, setCopied] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const firstSearchEffect = useRef(true)
  const sessionsRef = useRef<SessionListItem[]>([])

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedId) ?? null,
    [sessions, selectedId],
  )

  const hasMore = sessions.length < total

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  async function loadSessionPage(reset: boolean) {
    const nextOffset = reset ? 0 : sessionsRef.current.length
    const nextLimit = search.trim() ? 20 : reset ? 10 : 20

    if (reset) {
      setLoadingList(true)
    } else {
      setLoadingMore(true)
    }

    try {
      setError('')
      const result = await getSessions({
        query: search.trim(),
        offset: nextOffset,
        limit: nextLimit,
      })

      setTotal(result.total)
      setSessions((current) => (reset ? result.items : [...current, ...result.items]))
      setSelectedId((current) => {
        const source = reset ? result.items : [...sessionsRef.current, ...result.items]

        if (current && source.some((item) => item.id === current)) {
          return current
        }

        return source[0]?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取历史失败。')
    } finally {
      setLoadingList(false)
      setLoadingMore(false)
      setBooting(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        await getMeta()
        if (!cancelled) {
          await loadSessionPage(true)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '无法读取本机 opencode 目录。')
          setBooting(false)
        }
      }
    }

    void boot()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (firstSearchEffect.current) {
      firstSearchEffect.current = false
      return
    }

    const timer = window.setTimeout(() => {
      setSessions([])
      setTotal(0)
      void loadSessionPage(true)
    }, 180)

    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }

    let cancelled = false
    setLoadingDetail(true)

    void getSessionDetail(selectedId)
      .then((result) => {
        if (!cancelled) {
          setDetail(result)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '读取会话详情失败。')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingDetail(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedId])

  useEffect(() => {
    if (!copied) {
      return
    }

    const timer = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(timer)
  }, [copied])

  function handleListScroll() {
    const element = listRef.current
    if (!element || !hasMore || loadingList || loadingMore) {
      return
    }

    const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 160
    if (nearBottom) {
      void loadSessionPage(false)
    }
  }

  async function handleCopy() {
    if (!selectedId) {
      return
    }

    try {
      await navigator.clipboard.writeText(formatCommand(selectedId))
      setCopied(true)
    } catch {
      setError('复制失败，请检查剪贴板权限。')
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f3ecdd_0%,#ede5d6_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <div className="animate-rise mb-4 flex items-center gap-3 rounded-[24px] border border-white/70 bg-white/78 p-3 shadow-[0_18px_50px_rgba(66,48,30,0.08)] backdrop-blur-xl sm:p-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索标题或正文"
              className="h-12 w-full rounded-2xl border border-slate-200/90 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-slate-400"
            />
          </div>

          <button
            type="button"
            onClick={handleCopy}
            disabled={!selectedId}
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? '已复制' : '复制命令'}
          </button>
        </div>

        {error ? (
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="grid flex-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="animate-rise flex min-h-[70vh] flex-col rounded-[28px] border border-white/70 bg-white/78 p-3 shadow-[0_18px_50px_rgba(66,48,30,0.08)] backdrop-blur-xl sm:p-4">
            <div className="mb-3 flex items-center justify-between px-1 text-xs text-slate-500">
              <span>{search.trim() ? `找到 ${total} 条` : '最近会话'}</span>
              <span>{loadingList ? '更新中' : `${sessions.length}/${total || sessions.length}`}</span>
            </div>

            <div ref={listRef} onScroll={handleListScroll} className="session-scroll flex-1 space-y-3 overflow-y-auto pr-1">
              {booting || loadingList ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-28 animate-pulse rounded-[22px] border border-white/80 bg-white/70" />
                ))
              ) : null}

              {!booting && !loadingList && !sessions.length ? (
                <div className="flex min-h-[220px] items-center justify-center rounded-[22px] border border-dashed border-slate-300 bg-white/55 px-6 text-center text-sm leading-7 text-slate-500">
                  没有找到对应会话
                </div>
              ) : null}

              {sessions.map((session) => {
                const selected = session.id === selectedId

                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedId(session.id)}
                    className={selected ? 'session-card-active' : 'session-card'}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="line-clamp-2 text-left text-[15px] font-semibold leading-6 text-slate-950">
                        {session.title || '未命名会话'}
                      </h2>
                      <span className="shrink-0 text-[11px] text-slate-400">{formatShortDate(session.updatedAt)}</span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-left text-sm leading-6 text-slate-600">
                      {session.preview || '没有可展示的正文预览'}
                    </p>
                  </button>
                )
              })}

              <div className="flex h-10 items-center justify-center text-xs text-slate-400">
                {loadingMore ? <LoaderCircle className="h-4 w-4 animate-spin" /> : hasMore ? '继续下滑加载更多' : null}
              </div>
            </div>
          </aside>

          <section className="animate-rise flex min-h-[70vh] flex-col rounded-[28px] border border-white/70 bg-white/78 p-4 shadow-[0_18px_50px_rgba(66,48,30,0.08)] backdrop-blur-xl sm:p-5">
            {selectedSession ? (
              <div className="mb-4 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,241,232,0.94))] px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h1 className="font-display line-clamp-2 text-2xl leading-tight text-slate-950 sm:text-3xl">
                      {selectedSession.title || '未命名会话'}
                    </h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{formatLongDate(selectedSession.updatedAt)}</span>
                      <span className="font-mono text-[11px] text-slate-400">{selectedSession.id}</span>
                    </div>
                  </div>

                  <div className="rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-white">
                    {detail?.messages.length ?? 0} 条消息
                  </div>
                </div>
              </div>
            ) : null}

            <div className="session-scroll flex-1 overflow-y-auto pr-1">
              {loadingDetail ? (
                <div className="flex min-h-[320px] items-center justify-center text-slate-500">
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                </div>
              ) : null}

              {!loadingDetail && detail ? (
                <div className="space-y-3">
                  {detail.messages.map((message) => {
                    const isAssistant = message.role === 'assistant'

                    return (
                      <article
                        key={message.id}
                        className={
                          isAssistant
                            ? 'message-card message-card-assistant'
                            : 'message-card message-card-user'
                        }
                      >
                        <div className="mb-3 flex items-center gap-3 text-xs text-slate-500">
                          <div
                            className={
                              isAssistant
                                ? 'flex h-8 w-8 items-center justify-center rounded-2xl bg-slate-950 text-white'
                                : 'flex h-8 w-8 items-center justify-center rounded-2xl bg-white text-slate-900'
                            }
                          >
                            {isAssistant ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                          </div>
                          <span>{formatLongDate(message.createdAt)}</span>
                          {message.modelLabel ? <span>{message.modelLabel}</span> : null}
                        </div>
                        <div className="whitespace-pre-wrap text-[15px] leading-8 text-slate-700">{message.text}</div>
                      </article>
                    )
                  })}
                </div>
              ) : null}

              {!loadingDetail && !detail && !booting ? (
                <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-500">
                  选择左侧会话查看内容
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
