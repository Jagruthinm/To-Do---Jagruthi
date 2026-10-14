import { getToken } from './useAuth'
import { enqueue } from './useOfflineQueue'

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const method = (options.method ?? 'GET').toUpperCase()

  try {
    return await fetch(path, { ...options, headers })
  } catch (err) {
    // TypeError = network failure (offline). Only queue mutation requests.
    if (err instanceof TypeError && method !== 'GET') {
      enqueue(method, path, options.body ? JSON.parse(options.body as string) : null)
      // Return a synthetic 202 so callers can detect the queued case via res.status === 202
      return new Response(JSON.stringify({ __queued: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    throw err
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json()
}

export async function apiPost<T>(path: string, body: unknown): Promise<T | null> {
  const res = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) })
  if (res.status === 202) return null   // queued offline
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `POST ${path} failed`)
  }
  return res.json()
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T | null> {
  const res = await apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) })
  if (res.status === 202) return null   // queued offline
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `PATCH ${path} failed`)
  }
  return res.json()
}

export async function apiDelete(path: string): Promise<void> {
  const res = await apiFetch(path, { method: 'DELETE' })
  if (res.status === 202) return        // queued offline
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`)
}
