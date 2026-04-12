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
// The EU webgate endpoint (webgate.ec.europa.eu) blocks programmatic access.
// We use the OpenSanctions mirror which sources directly from the official EU FSF.
// URL: https://data.opensanctions.org/datasets/latest/eu_fsf/targets.simple.csv

async function fetchEu(): Promise<SanctionRow[]> {
  console.log('[eu] downloading from OpenSanctions mirror...')
  const res = await fetch(
    'https://data.opensanctions.org/datasets/latest/eu_fsf/targets.simple.csv'
  )
  if (!res.ok) throw new Error(`EU download failed: ${res.status}`)
  const text = await res.text()
  const lines = text.split('\n')
  // Header: id,schema,name,aliases,birth_date,countries,addresses,identifiers,
  //         sanctions,phones,emails,program_ids,dataset,first_seen,last_seen,last_change
  const dataLines = lines.slice(1).filter(Boolean)
  const rows: SanctionRow[] = []

  for (const line of dataLines) {
    const cols = parseCSVLine(line)
    if (cols.length < 4) continue

    const refId = cols[0]?.trim()
    const schema = cols[1]?.trim()   // 'Person' | 'Organization' | 'LegalEntity' etc.
    const name = cols[2]?.trim()
    if (!name) continue

    const type: 'individual' | 'entity' = schema === 'Person' ? 'individual' : 'entity'

    // Aliases are semicolon-separated inside the CSV field
    const aliasRaw = cols[3]?.trim()
    const aliases = aliasRaw
      ? aliasRaw.split(';').map((a) => a.trim()).filter((a) => a && a !== name)
      : []

    // Extract listing date from the sanctions field (last date in the program string)
    const sanctionsField = cols[8]?.trim()
    const dateMatch = sanctionsField?.match(/(\d{4}-\d{2}-\d{2})$/)
    const listedAt = dateMatch?.[1]

    rows.push({ name, aliases, source: 'EU', type, referenceNumber: refId, listedAt })
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
