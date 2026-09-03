import { ensure, sql } from './_db'

export interface Generation {
  owner: string
  fileId?: string | null
  kind: 'design' | 'edits' | 'image' | 'svg'
  prompt: string
  provider?: string
  model?: string
  exemplar?: string | null
  request?: unknown
  response?: unknown
  ms?: number
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/**
 * Write the record after the answer is already on its way back.
 *
 * A failed insert must never turn a good generation into an error, so this
 * swallows and logs. The exemplar html is large and already in the template
 * folder, so only its id is kept; the response is kept whole because it is
 * what "regenerate" and "show me what the model did" read.
 */
export async function record(g: Generation): Promise<void> {
  try {
    await ensure()
    await sql()`insert into generations (id, owner, file_id, kind, prompt, provider, model, exemplar, request, response, ms, created)
      values (${newId()}, ${g.owner}, ${g.fileId ?? null}, ${g.kind}, ${g.prompt.slice(0, 4000)}, ${g.provider ?? null}, ${g.model ?? null},
        ${g.exemplar ?? null}, ${JSON.stringify(g.request ?? null)}::jsonb, ${JSON.stringify(g.response ?? null)}::jsonb, ${g.ms ?? null}, ${Date.now()})`
  } catch (e) {
    console.error('generations: not recorded:', e instanceof Error ? e.message : e)
  }
}
