import { getSession } from '@auth0/nextjs-auth0'
import { NextResponse } from 'next/server'
import { db } from '@/src/db'
import { organisations, users } from '@/src/db/schema'
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
  const name: string = (body.name ?? '').trim()
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  // Idempotent — if user record already exists return success
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.auth0Id, auth0Id))
    .limit(1)

  if (existing) {
    return NextResponse.json({ success: true })
  }

  const slug = generateSlug(name)

  const [org] = await db
    .insert(organisations)
    .values({ name, slug, accountType: 'SOLO' })
    .returning()

  await db.insert(users).values({
    auth0Id,
    orgId: org.id,
    email,
    displayName: name,
    role: 'ADMIN',
  })

  return NextResponse.json({ success: true })
}
