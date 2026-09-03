import { useRef, useState } from 'react'
import * as clean from './lib/clean'
import * as gen from './lib/generate'
import { useEditor } from './doc/store'

// Starter templates — short, focused prompts that the system prompt produces well
const STARTERS = [
  { label: 'SaaS hero', prompt: 'SaaS landing page hero with headline, subheadline, and a CTA button, flex column layout' },
  { label: 'Pricing page', prompt: 'Pricing page with three tiers (Free, Pro, Enterprise), cards in a flex row' },
  { label: 'Mobile app', prompt: 'Mobile app landing page hero with app mockup placeholder and download buttons' },
  { label: 'Portfolio', prompt: 'Designer portfolio hero with name, role, short bio, and a contact button' },
  { label: 'Dashboard', prompt: 'Admin dashboard header bar with logo, nav links, and user avatar placeholder' },
  { label: 'Blog post', prompt: 'Blog post header with title, author byline, date, and cover image placeholder' },
]

// Fallback HTML if generation fails or is unavailable
const FALLBACK_HTML = `<section style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:120px 64px;gap:24px;background:#ffffff;min-height:400px;font-family:Inter,system-ui,sans-serif;">
  <h1 style="font-size:64px;font-weight:700;letter-spacing:-0.03em;line-height:1.05;margin:0;text-align:center;color:#0a0a0a;">Design with your agent</h1>
  <p style="font-size:20px;line-height:1.5;color:#5b5b60;max-width:540px;text-align:center;margin:0;">A canvas of real HTML and CSS. You draw, the agent writes, and you are both editing the same nodes.</p>
  <a href="#" style="display:inline-flex;align-items:center;padding:14px 28px;background:#0a0a0a;color:#ffffff;border-radius:8px;font-size:15px;font-weight:500;text-decoration:none;gap:8px;">Get started →</a>
</section>`

export default function Landing() {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const createArtboard = useEditor(s => s.createArtboard)
  const insertHtml = useEditor(s => s.insertHtml)
  const setView = useEditor(s => s.setView)
  const select = useEditor(s => s.select)

  async function submit(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)

    let html: string
    try {
      const { made } = await gen.design({ prompt: trimmed, width: 1280 })
      html = made[0]?.html ?? FALLBACK_HTML
    } catch (err: unknown) {
      // seeding the fallback silently would hand back a design nobody asked
      // for and no reason why, which is the failure we already chased once
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
      return
    }

    // the artboard is made only once there is something to put in it, so a
    // failed attempt does not leave an empty one behind for the next try
    const boardId = createArtboard({ name: 'Design', w: 1280, h: 832 })
    // the same gate every other generation goes through: parseHtml keeps an
    // svg's markup verbatim, so an unsanitised fragment reaches the DOM whole
    const ids = insertHtml(boardId, clean.fragment(html), 'insert')
    if (ids.length) select([ids[0]])

    setView('editor')
    setBusy(false)
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit(prompt)
    }
  }

  function clickStarter(s: typeof STARTERS[0]) {
    setPrompt(s.prompt)
    void submit(s.prompt)
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-panel"
      style={{ fontFamily: 'var(--font-sans)' }}>

      {/* Wordmark */}
      <div className="mb-10 flex flex-col items-center gap-2">
        <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--color-ink)' }}>
          Easel
        </span>
        <span style={{ fontSize: 13, color: 'var(--color-dim)', letterSpacing: '0' }}>
          Design with your agent, in the page.
        </span>
      </div>

      {/* Prompt input */}
      <div style={{
        width: '100%', maxWidth: 640,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-hair)',
        borderRadius: 12,
        boxShadow: '0 4px 24px -8px rgba(0,0,0,0.12)',
        padding: '12px 12px 10px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={onKey}
          placeholder={'Describe a design\u2026 e.g. \u201cSaaS landing page hero with CTA\u201d'}
          disabled={busy}
          rows={2}
          style={{
            width: '100%', resize: 'none', border: 'none', outline: 'none',
            background: 'transparent',
            fontFamily: 'var(--font-sans)', fontSize: 14,
            color: 'var(--color-ink)', lineHeight: 1.5,
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span             style={{ fontSize: 11, color: 'var(--color-faint)' }}>
            {busy ? 'Generating\u2026' : 'Press \u21b5 to generate \u00b7 Shift+\u21b5 for newline'}
          </span>
          <button
            onClick={() => void submit(prompt)}
            disabled={busy || !prompt.trim()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px',
              background: busy || !prompt.trim() ? 'var(--color-hair)' : 'var(--color-ink)',
              color: busy || !prompt.trim() ? 'var(--color-dim)' : '#fff',
              border: 'none', borderRadius: 6,
              fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500,
              cursor: busy || !prompt.trim() ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {busy ? (
              <>
                <Spinner />
                Generating
              </>
            ) : 'Generate \u2192'}
          </button>
        </div>
      </div>

      {/* Inline error */}
      {error && (
        <div style={{
          marginTop: 10, maxWidth: 640, width: '100%',
          fontSize: 12, color: '#c0392b',
          padding: '8px 12px', background: '#fff5f5',
          border: '1px solid rgba(192,57,43,0.2)', borderRadius: 8,
        }}>
          {error}
        </div>
      )}

      {/* Starter cards */}
      <div style={{
        marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 8,
        maxWidth: 640, width: '100%', justifyContent: 'center',
      }}>
        {STARTERS.map(s => (
          <button
            key={s.label}
            onClick={() => clickStarter(s)}
            disabled={busy}
            style={{
              padding: '6px 12px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-hair)',
              borderRadius: 20,
              fontFamily: 'var(--font-sans)', fontSize: 12,
              color: 'var(--color-ink)',
              cursor: busy ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              opacity: busy ? 0.5 : 1,
              transition: 'border-color 0.12s',
            }}
            onMouseEnter={e => { if (!busy) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,0,0,0.2)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-hair)' }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Skip link */}
      <button
        onClick={() => setView('editor')}
        style={{
          marginTop: 36, background: 'none', border: 'none',
          fontFamily: 'var(--font-sans)', fontSize: 12,
          color: 'var(--color-faint)', cursor: 'pointer',
          textDecoration: 'underline', textUnderlineOffset: 3,
        }}
      >
        Open canvas →
      </button>
    </div>
  )
}

function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeDasharray="14 6" strokeLinecap="round" />
    </svg>
  )
}
