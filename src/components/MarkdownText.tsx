import { CodeBlock } from './CodeBlock'

export function MarkdownText({ text }: { text: string }) {
  if (!text) return null

  // 1. Process pasted content first to extract exact line counts
  const blocks: { type: 'text' | 'pasted'; content: string; lines?: number }[] = [];
  const pastedRegex = /\[Pasted ~(\d+) lines\]\s*\n/g;
  let pastedLastIndex = 0;
  let pastedMatch;

  while ((pastedMatch = pastedRegex.exec(text)) !== null) {
    if (pastedMatch.index > pastedLastIndex) {
      blocks.push({ type: 'text', content: text.substring(pastedLastIndex, pastedMatch.index) });
    }

    const expectedLines = parseInt(pastedMatch[1], 10);
    const startIdx = pastedRegex.lastIndex;
    let currentIdx = startIdx;
    let linesFound = 0;

    while (linesFound < expectedLines && currentIdx < text.length) {
      const nextNewline = text.indexOf('\n', currentIdx);
      if (nextNewline === -1) {
        currentIdx = text.length;
        break;
      }
      currentIdx = nextNewline + 1;
      linesFound++;
    }

    blocks.push({
      type: 'pasted',
      lines: expectedLines,
      content: text.substring(startIdx, currentIdx).trimEnd()
    });

    pastedRegex.lastIndex = currentIdx;
    pastedLastIndex = currentIdx;
  }

  if (pastedLastIndex < text.length) {
    blocks.push({ type: 'text', content: text.substring(pastedLastIndex) });
  }

  return (
    <div className="space-y-3 prose dark:prose-invert max-w-none text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
      {blocks.map((block, bIdx) => {
        if (block.type === 'pasted') {
          return (
            <div key={`pasted-${bIdx}`} className="my-2">
              <CodeBlock 
                code={block.content} 
                language="text" 
                title={`Pasted Content (~${block.lines} lines)`} 
              />
            </div>
          )
        }

        // Split text by code blocks
        const codeRegex = /```([\w-]*)\n([\s\S]*?)```/g;
        const subParts: { type: 'text' | 'code'; content: string; language?: string }[] = [];
        let subLastIndex = 0;
        let subMatch;

        while ((subMatch = codeRegex.exec(block.content)) !== null) {
          if (subMatch.index > subLastIndex) {
            subParts.push({ type: 'text', content: block.content.substring(subLastIndex, subMatch.index) });
          }
          subParts.push({
            type: 'code',
            language: subMatch[1] || 'text',
            content: subMatch[2],
          });
          subLastIndex = codeRegex.lastIndex;
        }

        if (subLastIndex < block.content.length) {
          subParts.push({ type: 'text', content: block.content.substring(subLastIndex) });
        }

        return (
          <div key={`text-${bIdx}`} className="space-y-3">
            {subParts.map((part, index) => {
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
      })}
    </div>
  )
}