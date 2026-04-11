import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/src/db'
import { inviteTokens, users } from '@/src/db/schema'
import { and, count, eq, isNull } from 'drizzle-orm'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'

export async function POST() {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  if (!hasRole(ctx.user.role, 'ADMIN')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  // Count current active members to determine initial token status
  const [{ memberCount }] = await db
    .select({ memberCount: count() })
    .from(users)
    .where(and(eq(users.orgId, ctx.org.id), isNull(users.deletedAt)))

  const atLimit = memberCount >= ctx.org.memberLimit
  const initialStatus = atLimit ? 'PENDING_UPGRADE' : 'PENDING'

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await db.insert(inviteTokens).values({
    orgId: ctx.org.id,
    token,
    createdBy: ctx.user.id,
    expiresAt,
    status: initialStatus,
  })

  const baseUrl = process.env.AUTH0_BASE_URL ?? 'https://fides-eight.vercel.app'
  const inviteUrl = `${baseUrl}/join?token=${token}`

  return NextResponse.json({ inviteUrl, atLimit })
}
