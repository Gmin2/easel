import { serve } from './_core.js'

/** POST /api/svg — a prompt in, vector markup out */
// named method exports get vercel's web handler signature: a Request in, a
// Response out. a default export would be handed node's req and res instead
export const GET = serve
export const POST = serve
export const PUT = serve
export const DELETE = serve
export const OPTIONS = serve
