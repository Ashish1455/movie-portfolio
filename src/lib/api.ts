import { useAuth } from '@clerk/clerk-react'

type Opts = Omit<RequestInit, 'body'> & { body?: unknown }

export function useApi() {
  const { getToken } = useAuth()

  async function req<T>(path: string, opts: Opts = {}): Promise<T> {
    const token = await getToken()
    const { body, headers: extraHeaders, ...rest } = opts
    const res = await fetch(`/api${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(extraHeaders as Record<string, string> | undefined),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }))
      throw new Error((err as { error?: string }).error ?? 'Request failed')
    }
    if (res.status === 204) return {} as T
    return res.json() as Promise<T>
  }

  return {
    get:    <T>(path: string)                   => req<T>(path, { method: 'GET' }),
    post:   <T>(path: string, body?: unknown)   => req<T>(path, { method: 'POST', body }),
    patch:  <T>(path: string, body?: unknown)   => req<T>(path, { method: 'PATCH', body }),
    put:    <T>(path: string, body?: unknown)   => req<T>(path, { method: 'PUT', body }),
    del:    <T>(path: string)                   => req<T>(path, { method: 'DELETE' }),
  }
}

/** For public routes that don't need an auth token */
export async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Not found' }))
    throw new Error((err as { error?: string }).error ?? 'Not found')
  }
  return res.json() as Promise<T>
}
