// the client side of a generation that lands as it is written. one fetch,
// an event stream back, one callback per event. see api/_stream.ts

import * as auth from './auth'

export type Op = import('./ops').Op

export interface DesignHandlers {
  meta?(m: { provider: string; label: string; model: string }): void
  open(html: string): void
  node(html: string): void
  close?(): void
  done?(html: string): void
}

export interface EditsHandlers {
  meta?(m: { provider: string; label: string; model: string }): void
  op(op: Op): void
  done?(r: { ops: Op[]; dropped: string[]; summary?: string }): void
}

async function open(path: string, input: object): Promise<Response> {
  if (!auth.guestCanGenerate()) {
    auth.requestSignIn()
    throw new Error('That was the free one. Sign in to keep generating; your files stay where they are.')
  }
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await auth.headers()) },
      body: JSON.stringify({ ...input, stream: true }),
    })
  } catch {
    throw new Error('Could not reach the generation endpoint. Is the dev server running?')
  }
  if (res.status === 401) { auth.requestSignIn(); throw new Error('Sign in to generate. Your files stay where they are.') }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? `The generator answered ${res.status}.`)
  }
  return res
}

/** read "event: x / data: json" frames off a response body */
async function frames(res: Response, on: (type: string, data: Record<string, unknown>) => void): Promise<void> {
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2)
      let type = 'message', data = ''
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) type = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      try { on(type, JSON.parse(data)) } catch { /* a torn frame */ }
    }
  }
}

export async function design(input: { prompt: string; width: number; height?: number; tokens?: Record<string, string>; provider?: string; fileId?: string }, h: DesignHandlers): Promise<string> {
  const res = await open('/api/design', input)
  let html = ''
  let failed: string | null = null
  await frames(res, (type, d) => {
    if (type === 'meta') h.meta?.(d as { provider: string; label: string; model: string })
    else if (type === 'open') h.open(String(d.html))
    else if (type === 'node') h.node(String(d.html))
    else if (type === 'close') h.close?.()
    else if (type === 'done') { html = String(d.html ?? ''); h.done?.(html) }
    else if (type === 'error') failed = String(d.message)
  })
  if (failed) throw new Error(failed)
  if (!html) throw new Error('The stream ended before the design did.')
  auth.guestGenerated()
  return html
}

export async function edits(input: { prompt: string; artboardId: string; outline: string; ids: string[]; width: number; tokens?: Record<string, string>; provider?: string; fileId?: string }, h: EditsHandlers): Promise<{ ops: Op[]; dropped: string[]; summary?: string; label: string }> {
  const res = await open('/api/edits', input)
  let out: { ops: Op[]; dropped: string[]; summary?: string } | null = null
  let failed: string | null = null
  let label = 'model'
  await frames(res, (type, d) => {
    if (type === 'meta') { label = String(d.label); h.meta?.(d as { provider: string; label: string; model: string }) }
    else if (type === 'op') h.op(d.op as Op)
    else if (type === 'done') { out = { ops: (d.ops as Op[]) ?? [], dropped: (d.dropped as string[]) ?? [], summary: d.summary as string | undefined }; h.done?.(out) }
    else if (type === 'error') failed = String(d.message)
  })
  if (failed) throw new Error(failed)
  if (!out) throw new Error('The stream ended before the edits did.')
  auth.guestGenerated()
  return { ...(out as { ops: Op[]; dropped: string[]; summary?: string }), label }
}
