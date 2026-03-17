const fs = require('fs');
let code = fs.readFileSync('opencode-api.ts', 'utf-8');

// Replace SessionMessage to include parts
code = code.replace(
  `export type SessionMessage = {
  id: string
  role: 'user' | 'assistant'
  createdAt: number
  modelLabel?: string
  text: string
}`,
  `export type SessionMessagePart = {
  id: string
  type: string
  text?: string
  tool?: string
  input?: any
  output?: any
  files?: string[]
  filename?: string
  data?: any
}

export type SessionMessage = {
  id: string
  role: 'user' | 'assistant'
  createdAt: number
  modelLabel?: string
  text: string
  parts: SessionMessagePart[]
}`
);

// Update getSessionDetail partRows mapping
code = code.replace(
  `        const parts = (groupedParts.get(row.id) ?? []).map((part) => partToText(part.data)).filter(Boolean)
        const text = parts.join('\\n\\n').trim()
        const provider = meta?.providerID ?? meta?.model?.providerID
        const model = meta?.modelID ?? meta?.model?.modelID

        return {
          id: row.id,
          role: meta?.role === 'assistant' ? 'assistant' : 'user',
          createdAt: meta?.time?.created ?? row.time_created,
          modelLabel: [provider, model].filter(Boolean).join(' / ') || undefined,
          text,
        } satisfies SessionMessage`,
  `        const rawParts = groupedParts.get(row.id) ?? []
        const parsedParts = rawParts.map(part => {
          let payload = safeParse(part.data) || {}
          return {
            id: part.id,
            type: payload.type || 'unknown',
            text: payload.text,
            tool: payload.tool,
            input: payload.state?.input,
            output: payload.state?.output,
            files: payload.files,
            filename: payload.filename,
            data: payload
          } as SessionMessagePart
        })
        const parts = rawParts.map((part) => partToText(part.data)).filter(Boolean)
        const text = parts.join('\\n\\n').trim()
        const provider = meta?.providerID ?? meta?.model?.providerID
        const model = meta?.modelID ?? meta?.model?.modelID

        return {
          id: row.id,
          role: meta?.role === 'assistant' ? 'assistant' : 'user',
          createdAt: meta?.time?.created ?? row.time_created,
          modelLabel: [provider, model].filter(Boolean).join(' / ') || undefined,
          text,
          parts: parsedParts
        } satisfies SessionMessage`
);

fs.writeFileSync('opencode-api.ts', code);
