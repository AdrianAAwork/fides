import { drizzle } from 'drizzle-orm/neon-serverless'
import { Pool } from '@neondatabase/serverless'
import { sanctionsEntries } from '../src/db/schema'
import { eq } from 'drizzle-orm'

const pool = new Pool({ connectionString: process.env.DATABASE_URL_DIRECT! })
const db = drizzle(pool)

type SanctionRow = {
  name: string
  aliases: string[]
  source: 'OFSI' | 'OFAC' | 'EU'
  type: 'individual' | 'entity'
  referenceNumber?: string
  listedAt?: string
}

// ─── OFSI ─────────────────────────────────────────────────────────────────────

async function fetchOfsi(): Promise<SanctionRow[]> {
  console.log('[ofsi] downloading...')
  const res = await fetch(
    'https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv'
  )
  if (!res.ok) throw new Error(`OFSI download failed: ${res.status}`)
  const text = await res.text()
  const lines = text.split('\n')
  // Skip header rows (first 2 lines are metadata, line 3 is header)
  const dataLines = lines.slice(3).filter(Boolean)
  const rows: SanctionRow[] = []

  for (const line of dataLines) {
    const cols = parseCSVLine(line)
    if (cols.length < 5) continue
    const name = cols[0]?.trim()
    if (!name) continue
    const type = cols[2]?.toLowerCase().includes('individual') ? 'individual' : 'entity'
    const ref = cols[1]?.trim()
    const aliasRaw = cols[4]?.trim()
    const aliases = aliasRaw ? aliasRaw.split(';').map((a) => a.trim()).filter(Boolean) : []
    rows.push({ name, aliases, source: 'OFSI', type, referenceNumber: ref })
  }

  console.log(`[ofsi] parsed ${rows.length} entries`)
  return rows
}

// ─── OFAC ─────────────────────────────────────────────────────────────────────

async function fetchOfac(): Promise<SanctionRow[]> {
  console.log('[ofac] downloading...')
  const res = await fetch('https://www.treasury.gov/ofac/downloads/sdn.xml')
  if (!res.ok) throw new Error(`OFAC download failed: ${res.status}`)
  const text = await res.text()
  const rows: SanctionRow[] = []

  // Simple regex-based XML extraction (no DOM dependency in scripts)
  const sdnEntries = text.matchAll(/<sdnEntry>([\s\S]*?)<\/sdnEntry>/g)
  for (const match of sdnEntries) {
    const entry = match[1]
    const uid = (entry.match(/<uid>(\d+)<\/uid>/) ?? [])[1] ?? ''
    const lastName = (entry.match(/<lastName>([^<]+)<\/lastName>/) ?? [])[1]?.trim() ?? ''
    const firstName = (entry.match(/<firstName>([^<]+)<\/firstName>/) ?? [])[1]?.trim() ?? ''
    const sdnType = (entry.match(/<sdnType>([^<]+)<\/sdnType>/) ?? [])[1]?.trim().toLowerCase() ?? ''
    const dateOfListing = (entry.match(/<dateOfListing>([^<]+)<\/dateOfListing>/) ?? [])[1]?.trim()

    if (!lastName) continue

    const name = firstName ? `${lastName} ${firstName}` : lastName
    const type: 'individual' | 'entity' = sdnType === 'individual' ? 'individual' : 'entity'

    // Extract aliases
    const aliasMatches = entry.matchAll(/<aka>[\s\S]*?<lastName>([^<]+)<\/lastName>[\s\S]*?<\/aka>/g)
    const aliases: string[] = []
    for (const aka of aliasMatches) {
      const akaName = aka[1]?.trim()
      if (akaName) aliases.push(akaName)
    }

    rows.push({ name, aliases, source: 'OFAC', type, referenceNumber: uid, listedAt: dateOfListing })
  }

  console.log(`[ofac] parsed ${rows.length} entries`)
  return rows
}

// ─── EU ───────────────────────────────────────────────────────────────────────

async function fetchEu(): Promise<SanctionRow[]> {
  console.log('[eu] downloading...')
  const res = await fetch(
    'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content'
  )
  if (!res.ok) throw new Error(`EU download failed: ${res.status}`)
  const text = await res.text()
  const rows: SanctionRow[] = []

  const subjectMatches = text.matchAll(/<sanctionEntity>([\s\S]*?)<\/sanctionEntity>/g)
  for (const match of subjectMatches) {
    const entry = match[1]
    const logicalId = (entry.match(/logicalId="([^"]+)"/) ?? [])[1] ?? ''
    const subjectType = entry.includes('physicalperson') ? 'individual' : 'entity'

    const nameMatch = entry.match(/<wholeName>([^<]+)<\/wholeName>/)
    const name = nameMatch?.[1]?.trim()
    if (!name) continue

    const aliasMatches = entry.matchAll(/<nameAlias[^>]*>([\s\S]*?)<\/nameAlias>/g)
    const aliases: string[] = []
    for (const alias of aliasMatches) {
      const akaWhole = alias[1].match(/<wholeName>([^<]+)<\/wholeName>/)?.[1]?.trim()
      if (akaWhole && akaWhole !== name) aliases.push(akaWhole)
    }

    rows.push({ name, aliases, source: 'EU', type: subjectType, referenceNumber: logicalId })
  }

  console.log(`[eu] parsed ${rows.length} entries`)
  return rows
}

// ─── CSV helper ───────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let inQuote = false
  let current = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Updating sanctions database...')

  let allRows: SanctionRow[] = []

  try { allRows = [...allRows, ...(await fetchOfsi())] }
  catch (err) { console.error('[ofsi] failed:', err instanceof Error ? err.message : err) }

  try { allRows = [...allRows, ...(await fetchOfac())] }
  catch (err) { console.error('[ofac] failed:', err instanceof Error ? err.message : err) }

  try { allRows = [...allRows, ...(await fetchEu())] }
  catch (err) { console.error('[eu] failed:', err instanceof Error ? err.message : err) }

  if (allRows.length === 0) {
    console.error('No entries fetched — aborting to avoid clearing the table')
    process.exit(1)
  }

  console.log(`Total entries to upsert: ${allRows.length}`)

  // Clear existing entries per source and reinsert (bulk replace strategy)
  for (const source of ['OFSI', 'OFAC', 'EU'] as const) {
    const sourceRows = allRows.filter((r) => r.source === source)
    if (sourceRows.length === 0) continue

    console.log(`[${source}] replacing ${sourceRows.length} entries...`)
    await db.delete(sanctionsEntries).where(eq(sanctionsEntries.source, source))

    // Insert in batches of 500
    for (let i = 0; i < sourceRows.length; i += 500) {
      const batch = sourceRows.slice(i, i + 500)
      await db.insert(sanctionsEntries).values(
        batch.map((r) => ({
          name: r.name,
          aliases: r.aliases,
          source: r.source,
          type: r.type,
          referenceNumber: r.referenceNumber ?? null,
          listedAt: r.listedAt ?? null,
        }))
      )
    }
    console.log(`[${source}] done`)
  }

  console.log('Sanctions database updated successfully.')
  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
