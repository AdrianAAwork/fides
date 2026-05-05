import { db } from '@/src/db'
import { globalRateLimits } from '@/src/db/schema'
import { sql } from 'drizzle-orm'

const GLOBAL_DAILY_CEILING = parseInt(process.env.GLOBAL_DAILY_REPORT_CEILING ?? '200', 10)

// Returns true if the ceiling has been reached (caller should return 429).
// Single atomic upsert — concurrent requests serialise in the DB and get distinct post-increment
// counts, eliminating the TOCTOU race. Slight overshoot at the boundary is acceptable; this is a
// soft abuse cap, not a hard billing limit.
export async function checkGlobalCeiling(): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0]

  const [row] = await db
    .insert(globalRateLimits)
    .values({ date: today, count: 1 })
    .onConflictDoUpdate({
      target: [globalRateLimits.date],
      set: { count: sql`${globalRateLimits.count} + 1` },
    })
    .returning()

  if (row.count > GLOBAL_DAILY_CEILING) {
    console.log(`[globalRateLimit] daily ceiling exceeded: count=${row.count}, date=${today}`)
    return true
  }

  return false
}
