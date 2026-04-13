import { NextResponse } from 'next/server'
import { db } from '@/src/db'
import { certifications, certAlerts, assessments } from '@/src/db/schema'
import { and, isNull, isNotNull, lte, eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET
  const incoming = req.headers.get('x-vercel-cron-secret')
  if (!cronSecret || incoming !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find all non-deleted certs with an expiry date within 90 days
  const ninetyDaysFromNow = new Date()
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90)

  const expiringSoon = await db
    .select({
      id: certifications.id,
      assessmentId: certifications.assessmentId,
      orgId: certifications.orgId,
      expiryDate: certifications.expiryDate,
    })
    .from(certifications)
    .where(
      and(
        isNotNull(certifications.expiryDate),
        isNull(certifications.deletedAt),
        lte(certifications.expiryDate, ninetyDaysFromNow.toISOString().split('T')[0]),
      )
    )

  let alertsCreated = 0

  for (const cert of expiringSoon) {
    if (!cert.expiryDate) continue
    const expiry = new Date(cert.expiryDate)
    const now = new Date()
    const daysRemaining = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    const isExpired = daysRemaining < 0
    const alertType: 'EXPIRING_SOON' | 'EXPIRED' = isExpired ? 'EXPIRED' : 'EXPIRING_SOON'

    // Upsert: update daysRemaining if row already exists for this cert+alertType
    try {
      await db
        .insert(certAlerts)
        .values({
          certId: cert.id,
          assessmentId: cert.assessmentId,
          orgId: cert.orgId,
          alertType,
          daysRemaining: Math.max(0, daysRemaining),
          acknowledged: false,
        })
        .onConflictDoUpdate({
          target: [certAlerts.certId, certAlerts.alertType],
          set: {
            daysRemaining: sql`excluded.days_remaining`,
            acknowledged: false,
          },
        })
      alertsCreated++
    } catch (err) {
      console.error('[cert-alerts] failed to upsert alert for cert', cert.id, err)
    }
  }

  console.log(`[cert-alerts] processed ${expiringSoon.length} certs, created/updated ${alertsCreated} alerts`)

  return NextResponse.json({
    processed: expiringSoon.length,
    alertsCreated,
  })
}
