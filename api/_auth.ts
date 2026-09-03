import { verifyToken } from '@clerk/backend'

/**
 * Who is calling.
 *
 * The client sends Clerk's session token as a bearer, and this checks its
 * signature against the secret key. Nothing else about the user is needed
 * server-side: files are keyed on the subject and that is the whole model.
 */
export interface User { id: string }

export async function userFrom(authorization: string | null | undefined): Promise<User | null> {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return null
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) throw new Error('CLERK_SECRET_KEY is not set on this deployment.')
  try {
    const claims = await verifyToken(token, { secretKey })
    return claims.sub ? { id: claims.sub } : null
  } catch {
    return null
  }
}
