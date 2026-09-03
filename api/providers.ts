import { serve } from './_core.js'

/**
 * GET /api/providers — which models are actually reachable.
 *
 * The model chip is built from this rather than from a hardcoded list, so what
 * it offers is what the keys on this deployment can really do. It reports
 * whether each key is present, never the key.
 */
// named method exports get vercel's web handler signature: a Request in, a
// Response out. a default export would be handed node's req and res instead
export const GET = serve
export const POST = serve
export const PUT = serve
export const DELETE = serve
export const OPTIONS = serve
