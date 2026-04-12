import { distance } from 'fastest-levenshtein'
import { db } from '@/src/db'
import { sanctionsEntries } from '@/src/db/schema'
import type { SanctionsData, SanctionMatch, SanctionMatchLevel } from './types'

function similarityScore(a: string, b: string): number {
  const normA = a.toLowerCase().trim()
  const normB = b.toLowerCase().trim()
  const maxLen = Math.max(normA.length, normB.length)
  if (maxLen === 0) return 100
  return ((maxLen - distance(normA, normB)) / maxLen) * 100
}

export async function screenSanctions(
  vendorName: string,
  officerNames: string[]
): Promise<SanctionsData> {
  try {
    const entries = await db.select().from(sanctionsEntries)

    const namesToScreen = [vendorName, ...officerNames].filter(Boolean)
    const matches: SanctionMatch[] = []

    for (const screenName of namesToScreen) {
      for (const entry of entries) {
        // Screen against main name
        const mainSim = similarityScore(screenName, entry.name)
        if (mainSim >= 85) {
          const level: SanctionMatchLevel = mainSim >= 95 ? 'confirmed' : 'possible'
          matches.push({
            name: screenName,
            matchedAgainst: entry.name,
            similarity: Math.round(mainSim),
            level,
            source: entry.source,
            referenceNumber: entry.referenceNumber,
          })
          continue
        }

        // Screen against aliases
        const aliases = Array.isArray(entry.aliases) ? entry.aliases as string[] : []
        for (const alias of aliases) {
          if (typeof alias !== 'string') continue
          const aliasSim = similarityScore(screenName, alias)
          if (aliasSim >= 85) {
            const level: SanctionMatchLevel = aliasSim >= 95 ? 'confirmed' : 'possible'
            matches.push({
              name: screenName,
              matchedAgainst: alias,
              similarity: Math.round(aliasSim),
              level,
              source: entry.source,
              referenceNumber: entry.referenceNumber,
            })
            break
          }
        }
      }
    }

    const highestLevel: SanctionMatchLevel =
      matches.some((m) => m.level === 'confirmed')
        ? 'confirmed'
        : matches.some((m) => m.level === 'possible')
        ? 'possible'
        : 'none'

    return { screened: namesToScreen, matches, highestLevel }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pipeline:sanctions] error:', msg)
    return { screened: [vendorName, ...officerNames], matches: [], highestLevel: 'none', error: msg }
  }
}
