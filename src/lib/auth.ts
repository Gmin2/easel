/**
 * The session token, for code that is not a component.
 *
 * Clerk hands tokens out through a hook, and the store and the generators are
 * plain modules. A component near the root registers the getter once, and
 * everything that talks to `/api` asks here for its header.
 */
/**
 * Whether sign-in exists in this build.
 *
 * The dev server runs without Clerk: the api vouches for a local user and
 * the home page shows a local account, so working on the editor never starts
 * with a login. Set VITE_DEV_AUTH=1 to exercise the real flow locally. A
 * production build with no publishable key is a misconfiguration and says so.
 */
export const local = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH !== '1'
export const enabled = !local && Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)

type Getter = () => Promise<string | null>
let getter: Getter | null = null

/**
 * Guest mode: signed out, still working.
 *
 * A visitor gets the whole editor with files kept in this browser. The server
 * still wants an account for anything that spends a key, so a 401 from the api
 * turns into a request to sign in rather than an error nobody can act on.
 */
let guestMode = false
export const guest = () => guestMode
export function setGuest(v: boolean): void { guestMode = v }

/**
 * One design on the house.
 *
 * A guest can generate once and see the whole loop before being asked for
 * anything. The count lives in this browser like the guest's files do.
 */
const FREE = 1
const USED = 'easel:guest:used'
export function guestCanGenerate(): boolean {
  if (!guestMode) return true
  try { return Number(localStorage.getItem(USED) ?? 0) < FREE } catch { return true }
}
export function guestGenerated(): void {
  if (!guestMode) return
  try { localStorage.setItem(USED, String(Number(localStorage.getItem(USED) ?? 0) + 1)) } catch { /* ignore */ }
}

let askSignIn: (() => void) | null = null
export function onSignInRequest(fn: (() => void) | null): void { askSignIn = fn }
export function requestSignIn(): void { askSignIn?.() }

export function bind(get: Getter | null): void {
  getter = get
}

export async function headers(): Promise<Record<string, string>> {
  const token = await getter?.().catch(() => null)
  return token ? { authorization: `Bearer ${token}` } : {}
}

/** fetch against our own api, signed */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  let res: Response
  try {
    res = await fetch(path, {
      ...rest,
      headers: {
        ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(await headers()),
        ...(rest.headers as Record<string, string> | undefined),
      },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    })
  } catch {
    throw new Error('Could not reach the server. Is the dev server running?')
  }
  if (res.status === 401) {
    requestSignIn()
    throw new Error('Sign in to generate and to keep your files.')
  }
  const body = await res.json().catch(() => null) as (T & { error?: string }) | null
  if (!res.ok || body === null) {
    throw new Error(body?.error ?? `The server answered ${res.status}.`)
  }
  return body
}
