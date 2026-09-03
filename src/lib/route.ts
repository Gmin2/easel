// where a file lives in the address bar: /file/<fileId>/<pageId>#<nodeId>.
// the hash is the selection and is handled next to the selection code

export function parse(pathname = location.pathname): { file: string; page?: string } | null {
  const m = /^\/file\/([\w-]+)(?:\/([\w-]+))?\/?$/.exec(pathname)
  return m ? { file: m[1], ...(m[2] && { page: m[2] }) } : null
}

export const pathFor = (file: string, page?: string) =>
  page ? `/file/${file}/${page}` : `/file/${file}`
