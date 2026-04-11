import { getSession } from '@auth0/nextjs-auth0'
import { db } from '@/src/db'
import { organisations, users } from '@/src/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { CLAIMS } from './auth'

/**
 * Returns the authenticated user and their organisation from the database,
 * using the org slug from the verified JWT claim as the lookup key.
 * Returns null if unauthenticated, needs onboarding, or records are missing.
 */
export async function getDbContext() {
  const session = await getSession()
  if (!session?.user) return null

  const auth0Id: string = session.user.sub
  const orgSlug: string | undefined = session.user[CLAIMS.ORG_ID]
  if (!orgSlug) return null

  const [org] = await db
    .select()
    .from(organisations)
    .where(and(eq(organisations.slug, orgSlug), isNull(organisations.deletedAt)))
    .limit(1)

  if (!org) return null

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.auth0Id, auth0Id), isNull(users.deletedAt)))
    .limit(1)

  if (!user) return null

  return { org, user, session }
}
