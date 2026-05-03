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
  // TODO: SECURITY (LOW) — api/onboarding is excluded from the Auth0 middleware because these
  // routes must be reachable before the session cookie carries an org claim. The routes protect
  // themselves by calling getSession() and returning 401 for unauthenticated requests. This is
  // intentional but represents a defence-in-depth gap: if Auth0's getSession() ever returns a
  // falsy session for a legitimate authenticated request (e.g. cookie parsing edge case), the
  // routes fall back to 401 rather than being backed by the middleware redirect. Consider whether
  // /api/onboarding/* can be moved to the protected matcher with an exemption only for the
  // unauthenticated invite-lookup pre-check if one exists.
  matcher: [
    '/((?!api/auth|api/onboarding|_next/static|_next/image|logos|icon|favicon|apple-touch-icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico|woff|woff2|ttf|css|js)).*)',
  ],
}
