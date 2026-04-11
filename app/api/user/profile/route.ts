import { NextResponse } from 'next/server'
import { db } from '@/src/db'
import { users } from '@/src/db/schema'
import { eq } from 'drizzle-orm'
import { getDbContext } from '@/src/lib/session'

export async function PATCH(req: Request) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const body = await req.json()
  const displayName: string = (body.displayName ?? '').trim()

  if (!displayName) {
    return NextResponse.json({ error: 'Display name cannot be empty' }, { status: 400 })
  }

  const [updated] = await db
    .update(users)
    .set({ displayName })
    .where(eq(users.id, ctx.user.id))
    .returning()

  return NextResponse.json({ user: updated })
}
