import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill'
import './index.css'
import App, { Editor } from './App.tsx'
import * as auth from './lib/auth'
import { callTool, hasNativeWebMcp, registerTools, toolManifest } from './mcp/tools'
import { useEditor } from './doc/store'

/**
 * Only where the browser has none of its own.
 *
 * ChatGPT's browser ships WebMCP, and Chrome does behind
 * `chrome://flags/#enable-webmcp-testing`. Everywhere else the page would have
 * no `document.modelContext` at all and the tools would silently not exist —
 * which is a bad way for a judge to meet the entry. The polyfill validates
 * registrations against the same spec rules, so a tool that works here works
 * there; it just has no agent attached until something connects.
 */
const native = hasNativeWebMcp()
if (!native) initializeWebMCPPolyfill()

const clerkKey = auth.enabled ? import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {clerkKey ? (
      <ClerkProvider publishableKey={clerkKey} afterSignOutUrl="/">
        <App />
      </ClerkProvider>
    ) : auth.local ? (
      <Editor />
    ) : (
      <Unconfigured />
    )}
  </StrictMode>,
)

/** a production build with no key: better than a login page that cannot log anyone in */
function Unconfigured() {
  return (
    <div style={{ padding: 40, fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.6 }}>
      <p style={{ fontWeight: 500 }}>Easel needs a Clerk publishable key.</p>
      <p>Put <code>VITE_CLERK_PUBLISHABLE_KEY</code> in <code>app/.env</code> and restart the dev server.
        See <code>.env.example</code>.</p>
    </div>
  )
}

/**
 * Registered outside React on purpose.
 *
 * The tools read the store through `getState` rather than through a hook, so
 * they need no render to be correct, and keeping them out of the tree means
 * StrictMode's double mount cannot double register them.
 */
// a console client, and the way the tools are tested
Object.assign(window, { easel: useEditor, easelCall: callTool, easelTools: toolManifest })

registerTools().then(({ count, off }) => {
  useEditor.getState().note({
    by: 'human',
    tool: 'ready',
    detail: `${count} tools on document.modelContext`
      + (native ? '' : ' (polyfilled — no agent attached)'),
  })
  import.meta.hot?.dispose(off)
}, e => {
  useEditor.getState().note({
    by: 'human', tool: 'ready', detail: 'tool registration failed', error: String(e),
  })
})
