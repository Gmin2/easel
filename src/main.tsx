import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { callTool, registerTools, toolManifest } from './mcp/tools'
import { useEditor } from './doc/store'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/**
 * Registered outside React on purpose.
 *
 * The tools read the store through `getState` rather than through a hook, so
 * they need no render to be correct, and keeping them out of the tree means
 * StrictMode's double mount cannot double register them.
 */
// a console client, and the way the tools are tested
Object.assign(window, { easel: useEditor, easelCall: callTool, easelTools: toolManifest })

registerTools().then(off => {
  const mc = 'modelContext' in document || 'modelContext' in navigator
  useEditor.getState().note({
    by: 'human',
    tool: 'ready',
    detail: mc
      ? 'webmcp tools registered'
      : 'no webmcp in this browser — enable chrome://flags/#enable-webmcp-testing',
  })
  import.meta.hot?.dispose(off)
})
