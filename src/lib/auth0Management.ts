type CachedToken = {
  token: string
  expiresAt: number
}

let cachedToken: CachedToken | null = null

async function getManagementToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }

  const domain = process.env.AUTH0_M2M_DOMAIN
  const clientId = process.env.AUTH0_M2M_CLIENT_ID
  const clientSecret = process.env.AUTH0_M2M_CLIENT_SECRET

  if (!domain || !clientId || !clientSecret) {
    throw new Error('Auth0 Management API credentials not configured')
  }

  const response = await fetch(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to get management token: ${response.status}`)
  }

  const data = await response.json() as { access_token: string; expires_in: number }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return cachedToken.token
}

export async function sendVerificationEmail(auth0UserId: string): Promise<void> {
  const token = await getManagementToken()
  const domain = process.env.AUTH0_M2M_DOMAIN!

  const response = await fetch(`https://${domain}/api/v2/jobs/verification-email`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: auth0UserId }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Failed to send verification email: ${response.status} ${body}`)
  }
}
