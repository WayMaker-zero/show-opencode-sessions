import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  Copy,
  LoaderCircle,
  Search,
  User,
  Bot,
  Moon,
  Sun,
  Languages
} from 'lucide-react'
import {
  getMeta,
  getSessionDetail,
  getSessions,
  type SessionDetail,
  type SessionListItem,
} from './lib/opencode'
import { useThemeLang, t } from './lib/theme-lang'
import { MessagePartView } from './components/MessagePartView'

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
  const { theme, setTheme, lang, setLang } = useThemeLang()
  const text = t[lang]
  
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
      setError(err instanceof Error ? err.message : text.readError)
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
          setError(err instanceof Error ? err.message : text.bootError)
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
          setError(err instanceof Error ? err.message : text.readDetailError)
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
      setError(text.copyError)
    }
  }

  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-200">
      <div className="mx-auto flex h-screen max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="animate-rise mb-4 flex items-center gap-3 rounded-3xl border border-slate-200/60 bg-white/60 p-3 shadow-sm backdrop-blur-xl sm:p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={text.searchPlaceholder}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white/80 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:focus:border-slate-500"
            />
          </div>

          <button
            type="button"
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            title="Toggle Language"
          >
            <Languages className="h-4 w-4" />
          </button>
          
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={handleCopy}
            disabled={!selectedId}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? text.copied : text.copyCommand}
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Main Content Area */}
        <div className="grid flex-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)] min-h-0">
          
          {/* Sidebar: Session List */}
          <aside className="animate-rise flex flex-col rounded-3xl border border-slate-200/60 bg-white/60 p-3 shadow-sm backdrop-blur-xl sm:p-4 dark:border-slate-800 dark:bg-slate-900/60 overflow-hidden">
            <div className="mb-3 flex items-center justify-between px-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{search.trim() ? `${text.found} ${total} ${text.items}` : text.recentSessions}</span>
              <span>{loadingList ? text.updating : `${sessions.length}/${total || sessions.length}`}</span>
            </div>

            <div ref={listRef} onScroll={handleListScroll} className="session-scroll flex-1 space-y-3 overflow-y-auto pr-2 pb-4">
              {booting || loadingList ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-28 animate-pulse rounded-[22px] bg-slate-200/50 dark:bg-slate-800/50" />
                ))
              ) : null}

              {!booting && !loadingList && !sessions.length ? (
                <div className="flex min-h-[220px] items-center justify-center rounded-[22px] border border-dashed border-slate-300 bg-white/50 px-6 text-center text-sm leading-7 text-slate-500 dark:border-slate-700 dark:bg-slate-800/30">
                  {text.noSessionFound}
                </div>
              ) : null}

              {sessions.map((session) => {
                const selected = session.id === selectedId

                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedId(session.id)}
                    className={selected ? 'session-card-active w-full text-left' : 'session-card w-full text-left'}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="line-clamp-2 text-[14px] font-semibold leading-relaxed">
                        {session.title || text.unnamedSession}
                      </h2>
                      <span className="shrink-0 text-[10px] opacity-70 mt-1">{formatShortDate(session.updatedAt)}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed opacity-80">
                      {session.preview || text.noPreview}
                    </p>
                  </button>
                )
              })}

              <div className="flex h-10 items-center justify-center text-xs text-slate-400">
                {loadingMore ? <LoaderCircle className="h-4 w-4 animate-spin" /> : hasMore ? text.loadMore : null}
              </div>
            </div>
          </aside>

          {/* Main Area: Session Detail */}
          <section className="animate-rise flex flex-col rounded-3xl border border-slate-200/60 bg-white/60 p-4 shadow-sm backdrop-blur-xl sm:p-5 dark:border-slate-800 dark:bg-slate-900/60 overflow-hidden">
            {selectedSession && (
              <div className="mb-4 rounded-3xl border border-slate-200/80 bg-white/80 px-5 py-4 dark:border-slate-700/80 dark:bg-slate-800/80">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h1 className="line-clamp-2 text-xl font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
                      {selectedSession.title || text.unnamedSession}
                    </h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{formatLongDate(selectedSession.updatedAt)}</span>
                      <span className="font-mono text-[10px] opacity-70">{selectedSession.id}</span>
                    </div>
                  </div>

                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {detail?.messages.length ?? 0} {text.messagesCount}
                  </div>
                </div>
              </div>
            )}

            <div className="session-scroll flex-1 overflow-y-auto pr-2 pb-4">
              {loadingDetail ? (
                <div className="flex min-h-[320px] items-center justify-center text-slate-500">
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                </div>
              ) : null}

              {!loadingDetail && detail ? (
                <div className="space-y-4">
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
                        <div className="mb-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <div
                            className={
                              isAssistant
                                ? 'flex h-7 w-7 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                : 'flex h-7 w-7 items-center justify-center rounded-xl bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                            }
                          >
                            {isAssistant ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                          </div>
                          <span>{formatLongDate(message.createdAt)}</span>
                          {message.modelLabel && (
                            <span className="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                              {message.modelLabel}
                            </span>
                          )}
                        </div>
                        
                        <div className="space-y-1">
                          {message.parts && message.parts.length > 0 ? (
                            message.parts.map((part, idx) => (
                              <MessagePartView key={part.id || idx} part={part} />
                            ))
                          ) : (
                            <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                              {message.text}
                            </div>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : null}

              {!loadingDetail && !detail && !booting ? (
                <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                  {text.selectSession}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
