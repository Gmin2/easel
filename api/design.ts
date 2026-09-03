import { serve } from './_core'

/** POST /api/design — a prompt in, an HTML fragment out */
export default (req: Request) => serve('design', req)
