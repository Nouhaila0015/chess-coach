// Tous les appels du front passent par le BFF.
async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erreur ${res.status}`)
  return data as T
}

export const get = <T>(url: string) => request<T>('GET', url)
export const post = <T>(url: string, body: unknown = {}) => request<T>('POST', url, body)
