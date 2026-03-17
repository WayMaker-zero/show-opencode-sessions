import { useState } from 'react'
import { FileDiff, FileText, Settings, Sparkles, Terminal, ChevronDown, ChevronRight, Activity } from 'lucide-react'
import { CodeBlock } from './CodeBlock'
import { MarkdownText } from './MarkdownText'
import type { SessionMessagePart } from '../lib/opencode'

function ToolCallView({ part }: { part: SessionMessagePart }) {
  const [open, setOpen] = useState(false)
  
  return (
    <div className="my-1 rounded-lg border border-slate-100 bg-slate-50/50 p-2 text-xs text-slate-500 transition-colors dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
      <div 
        className="flex cursor-pointer items-center gap-2 hover:text-slate-700 dark:hover:text-slate-300"
        onClick={() => setOpen(!open)}
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

function StepLogView({ part, title, icon: Icon }: { part: SessionMessagePart, title: string, icon: any }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="my-1 rounded-lg border border-transparent bg-slate-50/30 p-1.5 text-[11px] text-slate-400 dark:bg-slate-900/20 dark:text-slate-500">
      <div className="flex cursor-pointer items-center gap-1.5 hover:text-slate-600 dark:hover:text-slate-400" onClick={() => setOpen(!open)}>
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

export function MessagePartView({ part }: { part: SessionMessagePart }) {
  switch (part.type) {
    case 'text':
      return <MarkdownText text={part.text || ''} />
      
    case 'tool':
      return <ToolCallView part={part} />
      
    case 'reasoning':
      return <ReasoningView part={part} />
      
    case 'patch':
      const patchContent = typeof part.data?.data === 'string' ? part.data.data : JSON.stringify(part.data, null, 2)
      return (
        <div className="my-2">
          <CodeBlock 
            code={patchContent} 
            language="diff" 
            title={`Patch: ${part.files?.join(', ') || 'Changes'}`} 
          />
        </div>
      )
      
    case 'file':
      const fileContent = typeof part.data?.data === 'string' ? part.data.data : JSON.stringify(part.data, null, 2)
      return (
        <div className="my-2">
          <CodeBlock 
            code={fileContent} 
            language={part.filename?.split('.').pop() || 'text'} 
            title={`File: ${part.filename || 'Attachment'}`} 
          />
        </div>
      )
      
    case 'step-start':
      return <StepLogView part={part} title="Step Started" icon={Activity} />
      
    case 'step-finish':
      return <StepLogView part={part} title="Step Finished" icon={Settings} />
      
    default:
      if (!part.text) {
        return (
          <div className="my-1 text-[10px] text-slate-400 italic">
            [Unknown Part Type: {part.type}]
          </div>
        )
      }
      return <MarkdownText text={part.text} />
  }
}
