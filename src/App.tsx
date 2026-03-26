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
  Languages,
  ArrowDown,
  ArrowUp,
  ArrowUpToLine
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

const SESSION_WINDOW_SIZE = 300

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
  const [loadingMoreDetail, setLoadingMoreDetail] = useState(false)
  const [detailNextCursor, setDetailNextCursor] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const detailScrollRef = useRef<HTMLDivElement | null>(null)
  const firstSearchEffect = useRef(true)
  const sessionsRef = useRef<SessionListItem[]>([])
  const sessionBaseOffsetRef = useRef(0)
  const listRequestAbortRef = useRef<AbortController | null>(null)
  const detailRequestAbortRef = useRef<AbortController | null>(null)

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedId) ?? null,
    [sessions, selectedId],
  )

  const hasMore = sessionBaseOffsetRef.current + sessions.length < total

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  async function loadSessionPage(reset: boolean) {
    if (reset) {
      sessionBaseOffsetRef.current = 0
    }

    const nextOffset = reset
      ? 0
      : sessionBaseOffsetRef.current + sessionsRef.current.length
    const nextLimit = search.trim() ? 20 : reset ? 10 : 20

    listRequestAbortRef.current?.abort()
    const controller = new AbortController()
    listRequestAbortRef.current = controller

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
        signal: controller.signal,
      })

      if (controller.signal.aborted) {
        return
      }

      setTotal(result.total)

      let merged = reset ? result.items : [...sessionsRef.current, ...result.items]
      if (merged.length > SESSION_WINDOW_SIZE) {
        const trimmed = merged.length - SESSION_WINDOW_SIZE
        merged = merged.slice(trimmed)
        sessionBaseOffsetRef.current += trimmed
      }

      sessionsRef.current = merged
      setSessions(merged)
      setSelectedId((current) => {
        const source = merged

        if (current && source.some((item) => item.id === current)) {
          return current
        }

        return source[0]?.id ?? null
      })
    } catch (err) {
      if (controller.signal.aborted) {
        return
      }
      setError(err instanceof Error ? err.message : text.readError)
    } finally {
      if (!controller.signal.aborted) {
        setLoadingList(false)
        setLoadingMore(false)
        setBooting(false)
      }

      if (listRequestAbortRef.current === controller) {
        listRequestAbortRef.current = null
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function boot() {
      try {
        await getMeta(controller.signal)
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
      controller.abort()
      listRequestAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (firstSearchEffect.current) {
      firstSearchEffect.current = false
      return
    }

    const timer = window.setTimeout(() => {
      sessionBaseOffsetRef.current = 0
      sessionsRef.current = []
      setSessions([])
      setTotal(0)
      void loadSessionPage(true)
    }, 180)

    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setDetailNextCursor(null)
      detailRequestAbortRef.current?.abort()
      return
    }

    setLoadingDetail(true)
    setLoadingMoreDetail(false)
    detailRequestAbortRef.current?.abort()
    const controller = new AbortController()
    detailRequestAbortRef.current = controller

    void getSessionDetail(selectedId, { cursor: 0, limit: 60, lite: true, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setDetail(result)
          setDetailNextCursor(result.nextCursor)
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : text.readDetailError)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingDetail(false)
        }

        if (detailRequestAbortRef.current === controller) {
          detailRequestAbortRef.current = null
        }
      })

    return () => {
      controller.abort()
    }
  }, [selectedId])

  async function handleLoadMoreDetail() {
    if (!selectedId || detailNextCursor === null || loadingMoreDetail || loadingDetail) {
      return
    }

    detailRequestAbortRef.current?.abort()
    const controller = new AbortController()
    detailRequestAbortRef.current = controller
    setLoadingMoreDetail(true)

    try {
      const result = await getSessionDetail(selectedId, {
        cursor: detailNextCursor,
        limit: 60,
        lite: true,
        signal: controller.signal,
      })

      if (controller.signal.aborted) {
        return
      }

      setDetail((current) => {
        if (!current) {
          return result
        }

        return {
          ...result,
          messages: [...current.messages, ...result.messages],
        }
      })
      setDetailNextCursor(result.nextCursor)
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : text.readDetailError)
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingMoreDetail(false)
      }

      if (detailRequestAbortRef.current === controller) {
        detailRequestAbortRef.current = null
      }
    }
  }

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



  const scrollToTop = () => {
    detailScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scrollToPrevUserMessage = () => {
    if (!detailScrollRef.current) return;
    
    const userMessages = Array.from(detailScrollRef.current.querySelectorAll('.message-card-user')) as HTMLElement[];
    const container = detailScrollRef.current;
    const containerRect = container.getBoundingClientRect();

    // When scrolling down via the "Next" button, we leave a padding of 16px.
    // This means the "current" prompt sits at `containerRect.top + 16`.
    // To find the "previous" prompt, we must strictly find the first element (searching from bottom up)
    // whose top is less than `containerRect.top + 10` to avoid finding the exact same element again.
    
    const reversedMessages = [...userMessages].reverse();
    
    const targetMessage = reversedMessages.find((el) => {
      const elRect = el.getBoundingClientRect();
      return elRect.top < containerRect.top + 10;
    });

    if (targetMessage) {
      const distanceToScroll = targetMessage.getBoundingClientRect().top - containerRect.top;
      container.scrollTo({
        top: container.scrollTop + distanceToScroll - 16,
        behavior: 'smooth'
      });
    } else {
      // If no previous user message, just scroll to top
      scrollToTop();
    }
  }

  const scrollToNextUserMessage = () => {
    if (!detailScrollRef.current) return;
    
    const userMessages = Array.from(detailScrollRef.current.querySelectorAll('.message-card-user')) as HTMLElement[];
    const container = detailScrollRef.current;
    const containerRect = container.getBoundingClientRect();

    // The element we just scrolled to might be sitting at containerRect.top + 16.
    // To find the *next* one, we must look for elements whose top is significantly greater than that.
    const tolerance = 24; // 16px padding + 8px extra buffer

    const targetMessage = userMessages.find((el) => {
      const elRect = el.getBoundingClientRect();
      return elRect.top > containerRect.top + tolerance;
    });

    if (targetMessage) {
      const distanceToScroll = targetMessage.getBoundingClientRect().top - containerRect.top;
      
      container.scrollTo({
        top: container.scrollTop + distanceToScroll - 16,
        behavior: 'smooth'
      });
    }
  }

  async function handleCopy() {

    if (!selectedId) {
      return
    }

    const command = formatCommand(selectedId)

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(command)
        setCopied(true)
        setError('')
      } else {
        throw new Error('Clipboard API not available')
      }
    } catch {
      try {
        const textArea = document.createElement('textarea')
        textArea.value = command
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        const successful = document.execCommand('copy')
        textArea.remove()
        
        if (successful) {
          setCopied(true)
          setError('')
        } else {
          setError(text.copyError)
        }
      } catch (fallbackErr) {
        setError(text.copyError)
      }
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
          <section className="animate-rise flex flex-col relative rounded-3xl border border-slate-200/60 bg-white/60 p-4 shadow-sm backdrop-blur-xl sm:p-5 dark:border-slate-800 dark:bg-slate-900/60 overflow-hidden">
            {selectedSession && (
              <div className="mb-4 rounded-3xl border border-slate-200/80 bg-white/80 px-5 py-4 dark:border-slate-700/80 dark:bg-slate-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="line-clamp-2 text-xl font-bold leading-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
                    {selectedSession.title || text.unnamedSession}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>{formatLongDate(selectedSession.updatedAt)}</span>
                    <span className="font-mono text-[10px] opacity-70">{selectedSession.id}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {text.copyCommand}
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-slate-100 border border-slate-200 px-3 py-1.5 dark:bg-slate-900 dark:border-slate-700">
                    <code className="text-xs font-mono text-slate-600 dark:text-slate-300">
                      opencode --session {selectedSession.id.substring(0, 8)}...
                    </code>
                    <button
                      type="button"
                      onClick={handleCopy}
                      disabled={!selectedId}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition"
                      title={text.copyCommand}
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}


            {/* Floating Action Buttons placed absolutely relative to the section container */}
            {!loadingDetail && detail && detail.messages.length > 0 && (
              <div className="absolute right-6 bottom-6 flex flex-col gap-3 z-10 hidden sm:flex">
                <button
                  onClick={scrollToTop}
                  className="group flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200 shadow-md text-slate-500 hover:text-slate-900 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 transition relative"
                >
                  <ArrowUpToLine className="h-4 w-4" />
                  <span className="absolute right-full mr-3 w-max px-2.5 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 pointer-events-none shadow-sm dark:bg-slate-700 dark:text-slate-200">
                    {text.scrollToTop || '回到顶部'}
                  </span>
                </button>
                <button
                  onClick={scrollToPrevUserMessage}
                  className="group flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white shadow-md hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition relative"
                >
                  <ArrowUp className="h-4 w-4" />
                  <span className="absolute right-full mr-3 w-max px-2.5 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 pointer-events-none shadow-sm dark:bg-slate-700 dark:text-slate-200">
                    {text.prevPrompt || '上一个提示词'}
                  </span>
                </button>
                <button
                  onClick={scrollToNextUserMessage}
                  className="group flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white shadow-md hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition relative"
                >
                  <ArrowDown className="h-4 w-4" />
                  <span className="absolute right-full mr-3 w-max px-2.5 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 pointer-events-none shadow-sm dark:bg-slate-700 dark:text-slate-200">
                    {text.nextPrompt || '下一个提示词'}
                  </span>
                </button>
              </div>
            )}

            <div ref={detailScrollRef} className="session-scroll flex-1 overflow-y-auto pr-2 pb-4">

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
                              <MessagePartView key={part.id || idx} sessionId={selectedId} part={part} />
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
                  {detailNextCursor !== null && (
                    <div className="flex justify-center pt-2">
                      <button
                        type="button"
                        onClick={handleLoadMoreDetail}
                        disabled={loadingMoreDetail}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        {loadingMoreDetail ? text.updating : `${text.loadMore} (${detail.messages.length}/${detail.totalMessages})`}
                      </button>
                    </div>
                  )}
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
