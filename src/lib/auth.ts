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
  const body = await res.json().catch(() => null) as (T & { error?: string }) | null
  if (!res.ok || body === null) {
    throw new Error(body?.error ?? `The server answered ${res.status}.`)
  }
  return body
}
