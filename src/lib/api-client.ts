import { auth } from './firebase'

/**
 * Thin wrapper around `fetch` that attaches the current user's Firebase ID token
 * as a Bearer header. Throws if the user is not authenticated or if the server
 * returns a non-2xx status. Automatically sets Content-Type: application/json
 * for JSON bodies, but leaves it unset for FormData so the browser can set the
 * correct multipart boundary.
 */
export async function apiFetch<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken()
  if (!idToken) throw new Error('Not authenticated')

  const hasBody = options?.body !== undefined
  const isFormData = hasBody && options?.body instanceof FormData

  const res = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(hasBody && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error ?? `API error ${res.status}`)
  }

  return res.json() as Promise<T>
}
