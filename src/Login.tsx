import { useState } from 'react'
import { useSignIn } from '@clerk/clerk-react'

/**
 * The door.
 *
 * One button, since one provider is the whole story for now. Clerk does the
 * redirect dance and lands on /sso-callback, where App finishes the session
 * and this page is never seen again until you sign out.
 */
export default function Login() {
  const { signIn, isLoaded } = useSignIn()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = async () => {
    if (!isLoaded || busy) return
    setBusy(true)
    setError(null)
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_github',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-panel text-[12px] text-ink">
      <div className="w-[360px] rounded-[14px] border border-black/10 bg-[#f9f9f9] p-8
                      shadow-[0_24px_60px_-24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-full bg-flame
                           text-[14px] font-medium text-white">e</span>
          <span className="text-[15px] font-medium">Easel</span>
        </div>
        <h1 className="mt-6 text-[20px] font-[480] leading-7">Sign in to continue</h1>
        <p className="mt-1 leading-[18px] text-black/60">
          Your files, and the agents you let into them, follow your account.
        </p>

        <button
          onClick={() => void go()}
          disabled={!isLoaded || busy}
          className="mt-6 flex h-9 w-full items-center justify-center gap-2 rounded-[8px]
                     bg-[#1e1e1e] text-[13px] font-medium text-[#f9f9f9]
                     transition-colors hover:bg-black disabled:opacity-50"
        >
          <GitHub />
          {busy ? 'Redirecting…' : 'Continue with GitHub'}
        </button>

        {error && <p className="mt-3 text-[11px] leading-relaxed text-[#dc4f70]">{error}</p>}

        <p className="mt-6 text-[11px] leading-4 text-black/40">
          By continuing you agree that this is a hackathon build and things may move.
        </p>
      </div>
    </div>
  )
}

function GitHub() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}
