import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { route } from './api/_core'

/**
 * The serverless functions, mounted in the dev server.
 *
 * `api/*.ts` are Vercel functions in production. Rather than have anyone run a
 * second process locally, this plugin calls the same `handle` those functions
 * call, so what you exercise with `pnpm dev` is the code that deploys. The
 * alternative — a proxy to `vercel dev` — would mean two servers and a whole
 * second way for the two to disagree.
 */
function api(): Plugin {
  return {
    name: 'easel-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        if (!path.startsWith('/api/')) return next()

        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'access-control-allow-origin': '*' })
          return res.end()
        }

        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        let body: unknown = null
        if (chunks.length) {
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {
            res.writeHead(400, { 'content-type': 'application/json' })
            return res.end('{"error":"The body was not JSON."}')
          }
        }

        try {
          const reply = await route({
            method: req.method ?? 'GET',
            path,
            authorization: req.headers.authorization ?? null,
            body,
            dev: true,
          })
          res.writeHead(reply.status, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          })
          res.end(JSON.stringify(reply.body))
        } catch (e) {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // the third argument is the prefix filter, and an empty one means "no
  // filter": api keys are deliberately unprefixed so vite cannot bundle them
  // into the client, and this is how the dev middleware still sees them
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    plugins: [react(), tailwindcss(), api()],
    server: { port: 8910 },
  }
})
