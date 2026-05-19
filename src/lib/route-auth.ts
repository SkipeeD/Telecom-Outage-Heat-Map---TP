import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getAdminAuth } from './firebase-admin'
import type { DecodedIdToken } from 'firebase-admin/auth'

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

export function isAuthError(v: unknown): v is NextResponse {
  return v instanceof NextResponse
}
