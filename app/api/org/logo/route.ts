import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { db } from '@/src/db'
import { organisations } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml']
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

export async function POST(req: Request) {
  const ctx = await getDbContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  if (!hasRole(ctx.user.role, 'ADMIN')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('logo')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'File must be PNG, JPEG, or SVG' },
      { status: 400 },
    )
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'File must be under 2MB' },
      { status: 400 },
    )
  }

  const ext = file.type === 'image/svg+xml' ? 'svg'
    : file.type === 'image/png' ? 'png'
    : 'jpg'

  const filename = `logos/${ctx.org.id}-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const blob = await put(filename, buffer, {
    access: 'public',
    contentType: file.type,
  })

  const [updated] = await db
    .update(organisations)
    .set({ logoUrl: blob.url })
    .where(and(eq(organisations.id, ctx.org.id), isNull(organisations.deletedAt)))
    .returning()

  return NextResponse.json({ logoUrl: updated.logoUrl })
}
