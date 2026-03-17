import { CodeBlock } from './CodeBlock'

export function MarkdownText({ text }: { text: string }) {
  if (!text) return null

  // Split text by code blocks
  const regex = /```([\w-]*)\n([\s\S]*?)```/g
  const parts: { type: 'text' | 'code'; content: string; language?: string }[] = []
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.substring(lastIndex, match.index) })
    }
    parts.push({
      type: 'code',
      language: match[1] || 'text',
      content: match[2],
    })
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.substring(lastIndex) })
  }

  return (
    <div className="space-y-3 prose dark:prose-invert max-w-none text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
      {parts.map((part, index) => {
        if (part.type === 'code') {
          return (
            <CodeBlock
              key={index}
              code={part.content}
              language={part.language}
              title="Code"
            />
          )
        }
        return (
          <div key={index} className="whitespace-pre-wrap break-words">
            {part.content}
          </div>
        )
      })}
    </div>
  )
}
