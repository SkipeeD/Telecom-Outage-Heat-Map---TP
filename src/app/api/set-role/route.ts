import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminAuth = getAdminAuth()
    const idToken = authHeader.slice(7)
    const caller = await adminAuth.verifyIdToken(idToken)

    if (caller.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { uid, role } = await req.json()
    if (!uid || !['user', 'engineer', 'technician'].includes(role)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    await adminAuth.setCustomUserClaims(uid, { role })

    try {
      await getAdminDb().collection('users').doc(uid).set({ role }, { merge: true })
    } catch (error) {
      console.error('Failed to sync Firestore user role:', error)
      return NextResponse.json({
        success: true,
        warning: 'Auth claim was updated, but Firestore profile sync failed.',
      })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
