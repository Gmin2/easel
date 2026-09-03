import { serve } from './_core'

/** POST /api/image — a prompt in, a `data:` URI out */
export default (req: Request) => serve('image', req)
