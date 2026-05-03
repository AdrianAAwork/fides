import { handleAuth, handleLogin } from '@auth0/nextjs-auth0'
import { NextRequest } from 'next/server'

export const GET = handleAuth({
  login: handleLogin((req: NextRequest) => {
    const screenHint = req.nextUrl.searchParams.get('screen_hint')
    return {
      authorizationParams: {
        ...(screenHint === 'signup' ? { screen_hint: 'signup' } : {}),
      },
    }
  }),
})
