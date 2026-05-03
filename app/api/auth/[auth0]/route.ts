import { handleAuth, handleLogin } from '@auth0/nextjs-auth0'

export const GET = handleAuth({
  login: handleLogin((req) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const screenHint = url.searchParams.get('screen_hint')
    return {
      authorizationParams: {
        ...(screenHint === 'signup' ? { screen_hint: 'signup' } : {}),
      },
    }
  }),
})
