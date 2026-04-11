import { withMiddlewareAuthRequired } from '@auth0/nextjs-auth0/edge'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const authMiddleware = withMiddlewareAuthRequired()

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Root login page is public
  if (pathname === '/') {
    return NextResponse.next()
  }

  return authMiddleware(req, {} as never)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
}
