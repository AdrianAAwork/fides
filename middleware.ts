import { withMiddlewareAuthRequired, getSession } from '@auth0/nextjs-auth0/edge'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { CLAIMS } from '@/src/lib/auth'

const authMiddleware = withMiddlewareAuthRequired()

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Root login page: if already authenticated, redirect to dashboard
  if (pathname === '/') {
    const res = NextResponse.next()
    const session = await getSession(req, res)
    if (session?.user) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return res
  }

  // Require authentication for all other matched routes
  const authResult = await authMiddleware(req, {} as never)
  // Auth guard redirected (unauthenticated) — let it through
  if (!authResult || authResult.status !== 200) {
    return authResult ?? NextResponse.next()
  }

  const res = NextResponse.next()
  const session = await getSession(req, res)
  const needsOnboarding = session?.user?.[CLAIMS.NEEDS_ONBOARDING] === true

  if (needsOnboarding && pathname !== '/onboarding') {
    const target = new URL('/onboarding', req.url)
    // Preserve invite token when redirected from /join
    if (pathname === '/join') {
      const token = req.nextUrl.searchParams.get('token')
      if (token) {
        target.searchParams.set('mode', 'join')
        target.searchParams.set('token', token)
      }
    }
    return NextResponse.redirect(target)
  }

  // Onboarding complete — don't let them back to the onboarding page
  if (!needsOnboarding && pathname === '/onboarding') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  // Exclude: static assets, Auth0 routes, onboarding API (needs unauthenticated access)
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth|api/onboarding).*)',
  ],
}
