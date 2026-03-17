import { CodeBlock } from './CodeBlock'
import { Terminal, FileCode } from 'lucide-react'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

// Render tool call-like blocks
function InlineToolCall({ title, input, content }: { title: string, input?: string, content?: string }) {
  const [open, setOpen] = useState(false)
  
  return (
    <div className="my-2 rounded-lg border border-slate-100 bg-slate-50/50 p-2 text-xs text-slate-500 transition-colors dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
      <div 
        className="flex cursor-pointer items-center gap-2 hover:text-slate-700 dark:hover:text-slate-300"
        onClick={() => setOpen(!open)}
      >
        <Terminal className="h-3.5 w-3.5 shrink-0" />
        <span className="font-mono font-medium truncate flex-1">{title}</span>
        {open ? <ChevronDown className="h-3 w-3 shrink-0 ml-auto" /> : <ChevronRight className="h-3 w-3 shrink-0 ml-auto" />}
      </div>
      
      {open && (
        <div className="mt-2 space-y-2 pl-5 text-[11px] opacity-90">
          {input && (
            <div>
              <div className="mb-1 font-semibold text-slate-400 dark:text-slate-500">Input:</div>
              <pre className="overflow-x-auto rounded bg-slate-100 p-2 font-mono dark:bg-slate-950/50">
                {input}
              </pre>
            </div>
          )}
          {content && (
            <div>
              <div className="mb-1 font-semibold text-slate-400 dark:text-slate-500">Content:</div>
              <pre className="overflow-x-auto rounded bg-slate-100 p-2 font-mono dark:bg-slate-950/50 whitespace-pre-wrap">
                {content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InlineXmlContent({ title, content }: { title: string, content: string }) {
  const [open, setOpen] = useState(false)
  
  return (
    <div className="my-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 transition-colors dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
      <div 
        className="flex cursor-pointer items-center gap-2 hover:text-slate-900 dark:hover:text-slate-100"
        onClick={() => setOpen(!open)}
      >
        <FileCode className="h-3.5 w-3.5 shrink-0" />
        <span className="font-mono font-medium truncate flex-1">{title}</span>
        {open ? <ChevronDown className="h-3 w-3 shrink-0 ml-auto" /> : <ChevronRight className="h-3 w-3 shrink-0 ml-auto" />}
      </div>
      
      {open && (
        <div className="mt-2 pl-5 text-[11px] opacity-90">
          <pre className="overflow-x-auto rounded bg-white p-2 font-mono border border-slate-100 dark:bg-slate-950/50 dark:border-slate-800 whitespace-pre-wrap">
            {content}
          </pre>
        </div>
      )}
    </div>
  )
}

export function MarkdownText({ text }: { text: string }) {
  if (!text) return null

  let blocks: { type: 'text' | 'pasted' | 'tool-call' | 'xml'; content: string; lines?: number; title?: string; input?: string }[] = [];
  
  let remainingText = text;
  let currentIdx = 0;
  
  while (currentIdx < remainingText.length) {
    const calledIdx = remainingText.indexOf('Called the ', currentIdx);
    const pastedIdx = remainingText.indexOf('[Pasted ~', currentIdx);
    const xmlIdx = remainingText.indexOf('<path>', currentIdx);
    
    // Find earliest match
    let matchCandidates = [
      { type: 'called', idx: calledIdx },
      { type: 'pasted', idx: pastedIdx },
      { type: 'xml', idx: xmlIdx }
    ].filter(c => c.idx !== -1).sort((a, b) => a.idx - b.idx);
    
    if (matchCandidates.length === 0) {
      blocks.push({ type: 'text', content: remainingText.substring(currentIdx) });
      break;
    }
    
    const nextIdx = matchCandidates[0].idx;
    const nextType = matchCandidates[0].type;
    
    if (nextIdx > currentIdx) {
      blocks.push({ type: 'text', content: remainingText.substring(currentIdx, nextIdx) });
    }
    
    if (nextType === 'pasted') {
      const match = remainingText.substring(nextIdx).match(/^\[Pasted ~(\d+) lines\]\s*\n/);
      if (match) {
        const expectedLines = parseInt(match[1], 10);
        const startIdx = nextIdx + match[0].length;
        let scanIdx = startIdx;
        let linesFound = 0;

        while (linesFound < expectedLines && scanIdx < remainingText.length) {
          const nextNewline = remainingText.indexOf('\n', scanIdx);
          if (nextNewline === -1) {
            scanIdx = remainingText.length;
            break;
          }
          scanIdx = nextNewline + 1;
          linesFound++;
        }
        
        blocks.push({
          type: 'pasted',
          lines: expectedLines,
          content: remainingText.substring(startIdx, scanIdx).trimEnd()
        });
        currentIdx = scanIdx;
      } else {
        blocks.push({ type: 'text', content: '[Pasted ~' });
        currentIdx = nextIdx + '[Pasted ~'.length;
      }
    } else if (nextType === 'called') {
      const callPrefix = remainingText.substring(nextIdx).match(/^Called the (.*?) tool with the following input:\s*(\{[\s\S]*?\})/);
      
      if (callPrefix) {
        const toolName = callPrefix[1];
        const toolInput = callPrefix[2];
        let blockEndIdx = nextIdx + callPrefix[0].length;
        
        let toolContent = '';
        
        const afterCall = remainingText.substring(blockEndIdx);
        const xmlMatch = afterCall.match(/^\s*(<path>[\s\S]*?<\/content>)/);
        
        if (xmlMatch) {
          toolContent = xmlMatch[1];
          blockEndIdx += xmlMatch[0].length;
        }
        
        blocks.push({
          type: 'tool-call',
          title: `Called ${toolName}`,
          input: toolInput,
          content: toolContent
        });
        currentIdx = blockEndIdx;
      } else {
        blocks.push({ type: 'text', content: 'Called the ' });
        currentIdx = nextIdx + 'Called the '.length;
      }
    } else if (nextType === 'xml') {
      // Just a lone <path>...</content> block without "Called the tool"
      const xmlMatch = remainingText.substring(nextIdx).match(/^(<path>[\s\S]*?<\/content>)/);
      if (xmlMatch) {
        // Extract the path for the title if possible
        const pathMatch = xmlMatch[1].match(/<path>(.*?)<\/path>/);
        const title = pathMatch ? pathMatch[1].split('/').pop() : 'File Content';
        
        blocks.push({
          type: 'xml',
          title: title || 'File Content',
          content: xmlMatch[1]
        });
        currentIdx = nextIdx + xmlMatch[0].length;
      } else {
        blocks.push({ type: 'text', content: '<path>' });
        currentIdx = nextIdx + '<path>'.length;
      }
    }
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
        
        if (block.type === 'tool-call') {
          return (
            <InlineToolCall 
              key={`tool-${bIdx}`} 
              title={block.title || 'Tool Call'} 
              input={block.input} 
              content={block.content} 
            />
          )
        }

        if (block.type === 'xml') {
          return (
            <InlineXmlContent 
              key={`xml-${bIdx}`}
              title={block.title || 'File Content'}
              content={block.content}
            />
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
