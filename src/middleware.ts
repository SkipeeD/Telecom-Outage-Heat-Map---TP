import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const authSession = request.cookies.get('auth-session')
  const { pathname } = request.nextUrl

  const publicRoutes = ['/login', '/register']
  const isPublicRoute = publicRoutes.includes(pathname)

  // If no auth cookie and not on a public route, redirect to login
  if (!authSession && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // If auth cookie exists and on a public route, redirect to home
  if (authSession && isPublicRoute) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
