import { serve } from './_core.ts'

/**
 * GET /api/providers — which models are actually reachable.
 *
 * The model chip is built from this rather than from a hardcoded list, so what
 * it offers is what the keys on this deployment can really do. It reports
 * whether each key is present, never the key.
 */
export default (req: Request) => serve('providers', req)
