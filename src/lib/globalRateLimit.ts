import { db } from '@/src/db'
import { globalRateLimits } from '@/src/db/schema'
import { eq, sql } from 'drizzle-orm'

const GLOBAL_DAILY_CEILING = parseInt(process.env.GLOBAL_DAILY_REPORT_CEILING ?? '200', 10)

/**
 * Checks the global daily assessment ceiling and increments the counter if below limit.
 * Returns true if the ceiling has been reached (caller should return 429).
 */
export async function checkGlobalCeiling(): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0]

  const [row] = await db
    .select({ count: globalRateLimits.count })
    .from(globalRateLimits)
    .where(eq(globalRateLimits.date, today))
    .limit(1)

  if ((row?.count ?? 0) >= GLOBAL_DAILY_CEILING) {
    console.log(`[globalRateLimit] daily ceiling reached: count=${row?.count}, date=${today}`)
    return true
  }

  await db
    .insert(globalRateLimits)
    .values({ date: today, count: 1 })
    .onConflictDoUpdate({
      target: [globalRateLimits.date],
      set: { count: sql`${globalRateLimits.count} + 1` },
    })

  return false
}
