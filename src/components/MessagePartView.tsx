import { useEffect, useState } from 'react'
import { Settings, Sparkles, Terminal, ChevronDown, ChevronRight, Activity } from 'lucide-react'
import { CodeBlock } from './CodeBlock'
import { MarkdownText } from './MarkdownText'
import { getSessionPartDetail, type SessionMessagePart } from '../lib/opencode'

function ToolCallView({ part, onLoadDetail }: { part: SessionMessagePart; onLoadDetail: () => Promise<void> }) {
  const [open, setOpen] = useState(false)

  async function handleToggle() {
    const nextOpen = !open
    setOpen(nextOpen)

    if (nextOpen && part.hasDetail && !part.data && !part.input && !part.output) {
      await onLoadDetail()
    }
  }
  
  return (
    <div className="my-1 rounded-lg border border-slate-100 bg-slate-50/50 p-2 text-xs text-slate-500 transition-colors dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
      <div 
        className="flex cursor-pointer items-center gap-2 hover:text-slate-700 dark:hover:text-slate-300"
        onClick={() => {
          void handleToggle()
        }}
      >
        <Terminal className="h-3.5 w-3.5" />
        <span className="font-mono font-medium">tool_call: {part.tool || 'unknown'}</span>
        {open ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
      </div>
      
      {open && (
        <div className="mt-2 space-y-2 pl-5 text-[11px] opacity-90">
          {part.input && (
            <div>
              <div className="mb-1 font-semibold text-slate-400 dark:text-slate-500">Input:</div>
              <pre className="overflow-x-auto rounded bg-slate-100 p-2 font-mono dark:bg-slate-950/50">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            </div>
          )}
          {part.output && (
            <div>
              <div className="mb-1 font-semibold text-slate-400 dark:text-slate-500">Output:</div>
              <pre className="overflow-x-auto rounded bg-slate-100 p-2 font-mono dark:bg-slate-950/50">
                {typeof part.output === 'string' 
                  ? part.output.substring(0, 1000) + (part.output.length > 1000 ? '...\n[Truncated]' : '') 
                  : JSON.stringify(part.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReasoningView({ part }: { part: SessionMessagePart }) {
  const [open, setOpen] = useState(false)
  
  if (!part.text && !part.data?.metadata?.openai?.reasoningEncryptedContent) return null

  return (
    <div className="my-1 rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
      <div 
        className="flex cursor-pointer items-center gap-2 hover:text-slate-700 dark:hover:text-slate-300"
        onClick={() => setOpen(!open)}
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="font-medium italic">Agent Reasoning</span>
        {open ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
      </div>
      
      {open && (
        <div className="mt-2 pl-5 text-[11px] leading-relaxed opacity-80 whitespace-pre-wrap font-mono">
          {part.text || '(Encrypted Reasoning Content)'}
        </div>
      )}
    </div>
  )
}

function StepLogView({
  part,
  title,
  icon: Icon,
  onLoadDetail,
}: {
  part: SessionMessagePart
  title: string
  icon: any
  onLoadDetail: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)

  async function handleToggle() {
    const nextOpen = !open
    setOpen(nextOpen)

    if (nextOpen && part.hasDetail && !part.data) {
      await onLoadDetail()
    }
  }

  return (
    <div className="my-1 rounded-lg border border-transparent bg-slate-50/30 p-1.5 text-[11px] text-slate-400 dark:bg-slate-900/20 dark:text-slate-500">
      <div
        className="flex cursor-pointer items-center gap-1.5 hover:text-slate-600 dark:hover:text-slate-400"
        onClick={() => {
          void handleToggle()
        }}
      >
        <Icon className="h-3 w-3" />
        <span>{title}</span>
        {open ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
      </div>
      {open && part.data && (
        <pre className="mt-1 overflow-x-auto rounded bg-slate-100/50 p-1.5 font-mono text-[10px] dark:bg-slate-950/30">
          {JSON.stringify(part.data, null, 2)}
        </pre>
      )}
    </div>
  )
}

export function MessagePartView({ sessionId, part }: { sessionId: string | null; part: SessionMessagePart }) {
  const [resolvedPart, setResolvedPart] = useState(part)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    setResolvedPart(part)
  }, [part])

  async function ensurePartDetail() {
    if (!sessionId || loadingDetail) {
      return
    }

    if (!resolvedPart.hasDetail || resolvedPart.data || resolvedPart.input || resolvedPart.output) {
      return
    }

    setLoadingDetail(true)
    try {
      const result = await getSessionPartDetail(sessionId, resolvedPart.id)
      setResolvedPart(result.part)
    } catch {
      // keep compact view when detail fetch fails
    } finally {
      setLoadingDetail(false)
    }
  }

  switch (resolvedPart.type) {
    case 'text':
      return <MarkdownText text={resolvedPart.text || ''} />
      
    case 'tool':
      return <ToolCallView part={resolvedPart} onLoadDetail={ensurePartDetail} />
      
    case 'reasoning':
      return <ReasoningView part={resolvedPart} />
      
    case 'patch':
      if (!resolvedPart.data) {
        return (
          <div className="my-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
            <div className="mb-2 font-medium">Patch: {resolvedPart.files?.join(', ') || 'Changes'}</div>
            <button
              type="button"
              onClick={() => {
                void ensurePartDetail()
              }}
              disabled={loadingDetail}
              className="rounded-md border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              {loadingDetail ? 'Loading...' : 'Load Patch Content'}
            </button>
          </div>
        )
      }

      const patchContent = typeof resolvedPart.data?.data === 'string' ? resolvedPart.data.data : JSON.stringify(resolvedPart.data, null, 2)
      return (
        <div className="my-2">
          <CodeBlock 
            code={patchContent} 
            language="diff" 
            title={`Patch: ${resolvedPart.files?.join(', ') || 'Changes'}`} 
          />
        </div>
      )
      
    case 'file':
      if (!resolvedPart.data) {
        return (
          <div className="my-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
            <div className="mb-2 font-medium">File: {resolvedPart.filename || 'Attachment'}</div>
            <button
              type="button"
              onClick={() => {
                void ensurePartDetail()
              }}
              disabled={loadingDetail}
              className="rounded-md border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              {loadingDetail ? 'Loading...' : 'Load File Content'}
            </button>
          </div>
        )
      }

      const fileContent = typeof resolvedPart.data?.data === 'string' ? resolvedPart.data.data : JSON.stringify(resolvedPart.data, null, 2)
      return (
        <div className="my-2">
          <CodeBlock 
            code={fileContent} 
            language={resolvedPart.filename?.split('.').pop() || 'text'} 
            title={`File: ${resolvedPart.filename || 'Attachment'}`} 
          />
        </div>
      )
      
    case 'step-start':
      return <StepLogView part={resolvedPart} title="Step Started" icon={Activity} onLoadDetail={ensurePartDetail} />
      
    case 'step-finish':
      return <StepLogView part={resolvedPart} title="Step Finished" icon={Settings} onLoadDetail={ensurePartDetail} />
      
    default:
      if (!resolvedPart.text) {
        return (
          <div className="my-1 text-[10px] text-slate-400 italic">
            [Unknown Part Type: {resolvedPart.type}]
          </div>
        )
      }
      return <MarkdownText text={resolvedPart.text} />
  }
}
