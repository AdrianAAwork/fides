import { getSession } from '@auth0/nextjs-auth0'
import { NextResponse } from 'next/server'
import { db } from '@/src/db'
import { inviteTokens, organisations, users } from '@/src/db/schema'
import { and, count, eq, gt, isNull } from 'drizzle-orm'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const auth0Id: string = session.user.sub
  const email: string = session.user.email ?? ''
  const displayName: string = session.user.name ?? email

  const body = await req.json()
  let rawToken: string = (body.token ?? '').trim()

  // Accept either a full invite URL or a raw token
  if (rawToken.includes('token=')) {
    try {
      rawToken = new URL(rawToken).searchParams.get('token') ?? rawToken
    } catch {
      // not a valid URL — use as-is
    }
  }

  if (!rawToken) {
    return NextResponse.json(
      { error: 'Invite code is required' },
      { status: 400 },
    )
  }

  // Look up a valid, unused, unexpired token
  const [row] = await db
    .select({ token: inviteTokens, org: organisations })
    .from(inviteTokens)
    .innerJoin(organisations, eq(inviteTokens.orgId, organisations.id))
    .where(
      and(
        eq(inviteTokens.token, rawToken),
        isNull(inviteTokens.usedAt),
        gt(inviteTokens.expiresAt, new Date()),
        isNull(organisations.deletedAt),
      ),
    )
    .limit(1)

  if (!row) {
    return NextResponse.json(
      { error: 'This invite link is invalid or has expired.' },
      { status: 400 },
    )
  }

  // Idempotent — user already exists
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.auth0Id, auth0Id))
    .limit(1)

  if (existing) {
    return NextResponse.json({ error: 'Account already exists' }, { status: 409 })
  }

  // Count current active members
  const [{ memberCount }] = await db
    .select({ memberCount: count() })
    .from(users)
    .where(and(eq(users.orgId, row.org.id), isNull(users.deletedAt)))

  const atLimit = memberCount >= row.org.memberLimit
  const tokenStatus = atLimit ? 'PENDING_UPGRADE' : 'ACCEPTED'

  const [newUser] = await db
    .insert(users)
    .values({
      auth0Id,
      orgId: row.org.id,
      email,
      displayName,
      role: 'ANALYST',
    })
    .returning()

  await db
    .update(inviteTokens)
    .set({ usedAt: new Date(), usedBy: newUser.id, status: tokenStatus })
    .where(eq(inviteTokens.id, row.token.id))

  return NextResponse.json({ status: tokenStatus })
}
