import { adminAuth } from '@/lib/firebase-admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const idToken = authHeader.slice(7)
    const caller = await adminAuth.verifyIdToken(idToken)

    if (caller.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { uid, role } = await req.json()
    if (!uid || !['user', 'engineer'].includes(role)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    await adminAuth.setCustomUserClaims(uid, { role })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
