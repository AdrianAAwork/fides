import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { db } from '@/src/db'
import { organisations } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { getDbContext } from '@/src/lib/session'
import { hasRole } from '@/src/lib/auth'

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

function detectImageType(buf: Buffer): string | null {
  // PNG: 89 50 4E 47
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png'
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg'
  // WebP: RIFF....WEBP
  if (buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp'
  return null
}

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

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be under 2MB' }, { status: 400 })
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(await file.arrayBuffer())
  } catch (err) {
    console.error('[logo upload] failed to read file buffer:', err)
    return NextResponse.json({ error: 'Failed to read uploaded file.' }, { status: 500 })
  }

  const detectedType = detectImageType(buffer)
  if (!detectedType) {
    return NextResponse.json(
      { error: 'Invalid file format. Only PNG, JPEG, and WebP are supported.' },
      { status: 400 },
    )
  }

  const ext = detectedType === 'image/png' ? 'png' : detectedType === 'image/webp' ? 'webp' : 'jpg'
  const filename = `logos/${ctx.org.id}-${Date.now()}.${ext}`

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (!blobToken) {
    console.error('[logo upload] BLOB_READ_WRITE_TOKEN is not set')
    return NextResponse.json({ error: 'Blob storage is not configured on this server.' }, { status: 500 })
  }

  let blobUrl: string
  try {
    console.log('[logo upload] calling put:', filename, detectedType, buffer.length, 'bytes')
    const blob = await put(filename, buffer, {
      access: 'private',
      contentType: detectedType,
      token: blobToken,
    })
    blobUrl = blob.url
    console.log('[logo upload] put succeeded, url:', blobUrl)
  } catch (err) {
    console.error('[logo upload] Vercel Blob put failed:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Blob upload failed: ${msg}` }, { status: 500 })
  }

  const [updated] = await db
    .update(organisations)
    .set({ logoUrl: blobUrl })
    .where(and(eq(organisations.id, ctx.org.id), isNull(organisations.deletedAt)))
    .returning()

  console.log('[logo upload] DB updated, logoUrl:', updated?.logoUrl)
  return NextResponse.json({ logoUrl: updated.logoUrl })
}
