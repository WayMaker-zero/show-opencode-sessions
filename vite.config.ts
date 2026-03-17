import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { handleOpencodeApi } from './opencode-api'

function opencodeApiPlugin() {
  return {
    name: 'opencode-local-api',
    configureServer(server: { middlewares: { use: (handler: unknown) => void } }) {
      server.middlewares.use(async (req: any, res: any, next: () => void) => {
        if (!req.url?.startsWith('/api/opencode')) {
          next()
          return
        }

        await handleOpencodeApi(req as never, res as never)
      })
    },
    configurePreviewServer(server: { middlewares: { use: (handler: unknown) => void } }) {
      server.middlewares.use(async (req: any, res: any, next: () => void) => {
        if (!req.url?.startsWith('/api/opencode')) {
          next()
          return
        }

        await handleOpencodeApi(req as never, res as never)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), opencodeApiPlugin()],
})
