import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/src/db'
import { users } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'
import type { Role } from '@/src/lib/auth'

const VALID_ROLES: Role[] = ['VIEWER', 'ANALYST', 'ADMIN']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  if (!hasRole(ctx.user.role, 'ADMIN')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { userId } = await params
  const body = await req.json()
  const role: unknown = body.role

  if (!VALID_ROLES.includes(role as Role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  // Verify the target user belongs to the same org
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.orgId, ctx.org.id),
        isNull(users.deletedAt),
      ),
    )
    .limit(1)

  if (!target) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  const [updated] = await db
    .update(users)
    .set({ role: role as Role })
    .where(eq(users.id, userId))
    .returning()

  return NextResponse.json({ member: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  if (!hasRole(ctx.user.role, 'ADMIN')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { userId } = await params

  // Cannot remove yourself
  if (userId === ctx.user.id) {
    return NextResponse.json(
      { error: 'You cannot remove yourself from the organisation' },
      { status: 400 },
    )
  }

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.orgId, ctx.org.id),
        isNull(users.deletedAt),
      ),
    )
    .limit(1)

  if (!target) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  await db
    .update(users)
    .set({ deletedAt: new Date() })
    .where(eq(users.id, userId))

  return NextResponse.json({ success: true })
}
