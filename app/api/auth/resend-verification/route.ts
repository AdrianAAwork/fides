import { getSession } from '@auth0/nextjs-auth0'
import { NextResponse } from 'next/server'
import { db } from '@/src/db'
import { verificationEmailSends } from '@/src/db/schema'
import { eq } from 'drizzle-orm'
import { sendVerificationEmail } from '@/src/lib/auth0Management'

const RESEND_COOLDOWN_SECONDS = 60

export async function POST() {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ success: false, message: 'Not authenticated.' }, { status: 401 })
  }

  const auth0Id: string = session.user.sub

  const [existing] = await db
    .select({ lastSentAt: verificationEmailSends.lastSentAt })
    .from(verificationEmailSends)
    .where(eq(verificationEmailSends.auth0Id, auth0Id))
    .limit(1)

  if (existing) {
    const secondsSince = (Date.now() - existing.lastSentAt.getTime()) / 1000
    if (secondsSince < RESEND_COOLDOWN_SECONDS) {
      const retryAfterSeconds = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSince)
      return NextResponse.json({
        success: false,
        message: 'Please wait before requesting another email.',
        retryAfterSeconds,
      }, { status: 429 })
    }
  }

  // Record the attempt before calling Auth0 — rate-limits spam even on transient failures
  const now = new Date()
  await db
    .insert(verificationEmailSends)
    .values({ auth0Id, lastSentAt: now })
    .onConflictDoUpdate({
      target: verificationEmailSends.auth0Id,
      set: { lastSentAt: now },
    })

  try {
    await sendVerificationEmail(auth0Id)
  } catch (err) {
    console.error('[resend-verification] Auth0 API error:', err)
    return NextResponse.json({
      success: false,
      message: 'Could not send email right now. Please try again in a moment.',
    }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Verification email sent. Check your inbox.' })
}
