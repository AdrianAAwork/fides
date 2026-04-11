import { getSession } from '@auth0/nextjs-auth0'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/src/db'
import { organisations, users, inviteTokens } from '@/src/db/schema'
import { eq } from 'drizzle-orm'

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
    .replace(/^-|-$/g, '')
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base}-${suffix}`
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const auth0Id: string = session.user.sub
  const email: string = session.user.email ?? ''

  const body = await req.json()
  const orgName: string = (body.orgName ?? '').trim()
  const displayName: string = (body.displayName ?? '').trim()

  if (!orgName || !displayName) {
    return NextResponse.json(
      { error: 'Organisation name and your name are required' },
      { status: 400 },
    )
  }

  // Idempotent — if user record already exists return error
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.auth0Id, auth0Id))
    .limit(1)

  if (existing) {
    return NextResponse.json(
      { error: 'Account already exists' },
      { status: 409 },
    )
  }

  const slug = generateSlug(orgName)

  const [org] = await db
    .insert(organisations)
    .values({ name: orgName, slug, accountType: 'ORGANISATION' })
    .returning()

  const [user] = await db
    .insert(users)
    .values({
      auth0Id,
      orgId: org.id,
      email,
      displayName,
      role: 'ADMIN',
    })
    .returning()

  // Generate 7-day invite token
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await db.insert(inviteTokens).values({
    orgId: org.id,
    token,
    createdBy: user.id,
    expiresAt,
  })

  const baseUrl = process.env.AUTH0_BASE_URL ?? 'https://fides-eight.vercel.app'
  const inviteUrl = `${baseUrl}/join?token=${token}`

  return NextResponse.json({ inviteUrl })
}
