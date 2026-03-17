import { useState } from 'react'
import { ChevronDown, ChevronUp, FileCode } from 'lucide-react'

export function CodeBlock({ code, language = 'text', title = 'Code' }: { code: string; language?: string; title?: string }) {
  const [expanded, setExpanded] = useState(false)
  const lines = code.trim().split('\n')
  const isLong = lines.length > 6
  const displayLines = expanded ? lines : lines.slice(0, 6)

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
          <FileCode className="h-3.5 w-3.5" />
          <span>{title}</span>
          {language && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-500">{language}</span>}
        </div>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>收起</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>展开 ({lines.length - 6} 行)</span>
              </>
            )}
          </button>
        )}
      </div>
      <div className="overflow-x-auto p-3 text-[13px] leading-relaxed font-mono">
        <pre className="text-slate-800 dark:text-slate-300">
          <code>{displayLines.join('\n')}</code>
        </pre>
        {!expanded && isLong && (
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            <span className="flex-1 border-t border-dashed border-slate-300 dark:border-slate-700"></span>
            <span>...</span>
            <span className="flex-1 border-t border-dashed border-slate-300 dark:border-slate-700"></span>
          </div>
        )}
      </div>
    </div>
  )
}
