import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getAdminAuth } from './firebase-admin'
import type { DecodedIdToken } from 'firebase-admin/auth'

/**
 * Verifies the Firebase ID token from the request's Authorization header.
 * Returns the decoded token on success, or a 401 NextResponse on failure.
 * API routes should call this first and use `isAuthError` to distinguish
 * the two return types before proceeding with the handler logic.
 *
 * @example
 * const caller = await requireAuth(req)
 * if (isAuthError(caller)) return caller  // short-circuit with 401
 * // caller is now a DecodedIdToken
 */
export async function requireAuth(req: NextRequest): Promise<DecodedIdToken | NextResponse> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return await getAdminAuth().verifyIdToken(authHeader.slice(7))
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

/**
 * Type guard that narrows the return value of `requireAuth` to NextResponse.
 * Use this to return the 401 error response from an API route handler.
 */
export function isAuthError(v: unknown): v is NextResponse {
  return v instanceof NextResponse
}
