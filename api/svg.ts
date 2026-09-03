import { serve } from './_core'

/** POST /api/svg — a prompt in, raw SVG markup out */
export default (req: Request) => serve('svg', req)
