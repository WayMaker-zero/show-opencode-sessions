const fs = require('fs');
let code = fs.readFileSync('src/lib/opencode.ts', 'utf-8');

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

fs.writeFileSync('src/lib/opencode.ts', code);
