# Fides — Phase 5 Brief
## Vendor assessment pipeline

### Context
Phases 1-4 are complete and deployed at fides-eight.vercel.app.
Authentication, organisation management, and role enforcement are working.
The database has all tables including assessments, assessment_scores,
certifications, and audit_log.

Read the entire existing codebase before writing any code.
Understand what exists before adding to it.
All API keys are in environment variables — never hardcode values.
No credentials, API keys, or secrets ever in source code.

---

### What Phase 5 builds

1. Vendor search form with Companies House autocomplete
2. Company confirmation and pipeline trigger
3. Parallel data collection across all sources
4. Claude AI analysis layer (3 calls only)
5. Assessment record creation with all scores stored
6. Assessment list view showing completed assessments
7. Sanctions data infrastructure using Neon database

---

### Schema addition — new sanctions_entries table

Add to src/db/schema.ts:

```typescript
export const sanctionSource = pgEnum('sanction_source',
  ['OFSI', 'OFAC', 'EU']
)

export const sanctionType = pgEnum('sanction_type',
  ['individual', 'entity']
)

export const sanctionsEntries = pgTable('sanctions_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 500 }).notNull(),
  aliases: jsonb('aliases').notNull().default('[]'),
  source: sanctionSource('source').notNull(),
  type: sanctionType('type').notNull(),
  referenceNumber: varchar('reference_number', { length: 100 }),
  listedAt: date('listed_at'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow().notNull(),
}, (table) => ({
  nameIdx: index('sanctions_name_idx').on(table.name),
  sourceIdx: index('sanctions_source_idx').on(table.source),
}))
```

After updating schema.ts run:
npx drizzle-kit generate
npx drizzle-kit migrate

---

### Sanctions list infrastructure

Create a script at scripts/update-sanctions.ts that:
1. Downloads the three government sanctions lists
2. Parses them into unified format
3. Upserts all entries into the sanctions_entries table in Neon
4. Logs how many entries were added, updated, removed

Sources:
- OFSI (UK):
  https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv
- OFAC (US):
  https://www.treasury.gov/ofac/downloads/sdn.xml
- EU Consolidated:
  https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content

The script uses DATABASE_URL_DIRECT from environment variables.
Never hardcode the connection string.

Add to package.json scripts:
"sanctions:update": "tsx scripts/update-sanctions.ts"

Run the script once now to populate the initial data:
npx tsx scripts/update-sanctions.ts

The pipeline queries sanctions_entries in Neon during assessments.
No flat files needed. Data persists and can be updated without
redeployment.

---

### New pages and routes

Pages:
- /assessments — list of all assessments for the org
- /assessments/new — vendor search and pipeline flow
- /assessments/[id] — assessment detail stub

API routes:
- GET /api/companies-house/search?q= — proxies CH search
- GET /api/companies-house/company/[number] — full profile
- POST /api/assessments — runs full pipeline, creates assessment
- GET /api/assessments — org assessment list
- GET /api/assessments/[id] — single assessment with scores

All routes enforce org_id from JWT — never from request body.
All routes check role — minimum ANALYST to create assessments,
minimum VIEWER to read them.

---

### Companies House API integration

Base URL: https://api.company-information.service.gov.uk

Authentication:
```typescript
const auth = Buffer.from(
  process.env.COMPANIES_HOUSE_API_KEY + ':'
).toString('base64')

headers: {
  'Authorization': `Basic ${auth}`
}
```

Never hardcode the API key. Always use process.env.

Endpoints:
- Search: GET /search/companies?q={name}&items_per_page=10
- Profile: GET /company/{company_number}
- Officers: GET /company/{company_number}/officers
- PSC: GET /company/{company_number}/persons-with-significant-control
- Filings: GET /company/{company_number}/filing-history

Extract and store in source_data JSONB:
- company_name, company_number, company_status
- date_of_creation, registered_office_address
- sic_codes, type
- accounts.next_due, accounts.overdue
- confirmation_statement.next_due, overdue
- Officers: name, role, appointed_on, resigned_on
- PSC: name, nationality, natures_of_control, ceased
- Filing history: last 5 filings with date and description

Financial health scoring (0-100):
- Start at 100
- Accounts overdue: -40
- Confirmation statement overdue: -20
- Company status not active: -60
- No accounts filed in last 18 months: -30
- Going concern flag from Claude: -30
- Minimum score: 0

---

### GLEIF API integration

Base URL: https://api.gleif.org/api/v1
No authentication required.

Search: GET /fuzzycompanyquery?q={name}&page[size]=5
Fetch: GET /lei-records/{lei}

Extract:
- lei, entity.legalName.name
- entity.jurisdiction, entity.category
- entity.status
- entity.registeredAs
- relationships.ultimateParent (follow to get parent details)

Store in source_data for OWNERSHIP dimension.

Jurisdiction risk scoring (0-100):
- UK, US, EU member states, Australia, Canada, Japan,
  Switzerland, Norway, New Zealand, Singapore: 90-100
- All other FATF member states in good standing: 60-75
- FATF grey list: 30-50
- FATF black list: 0-20
- Unknown or missing jurisdiction: 40

Hardcode FATF lists in src/lib/fatf.ts:

```typescript
export const FATF_GREY_LIST = [
  'Bulgaria', 'Burkina Faso', 'Cameroon', "Cote d'Ivoire",
  'Croatia', 'Democratic Republic of Congo', 'Haiti', 'Kenya',
  'Mali', 'Monaco', 'Mozambique', 'Namibia', 'Nigeria',
  'Philippines', 'Senegal', 'South Africa', 'South Sudan',
  'Syria', 'Tanzania', 'Venezuela', 'Vietnam', 'Yemen'
]

export const FATF_BLACK_LIST = [
  'Iran', 'North Korea', 'Myanmar'
]
```

---

### Sanctions screening

Query the sanctions_entries table in Neon.
Use fuzzy string matching with the fastest-levenshtein package.

Install: npm install fastest-levenshtein

Screening logic:
```typescript
import { distance } from 'fastest-levenshtein'

function similarityScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 100
  return ((maxLen - distance(a, b)) / maxLen) * 100
}
```

Screen the vendor name and all officer names from Companies
House against all names and aliases in sanctions_entries.

Match thresholds:
- 95%+ similarity: confirmed match — score 0, Critical tier
- 85-94% similarity: possible match — score 40, flag for review
- Below 85%: no match

Sanctions dimension score (0-100):
- No matches: 100
- Possible match: 40
- Confirmed match: 0

Store full match details in source_data including which names
were screened and which list they matched against.

---

### NewsAPI integration

Base URL: https://newsapi.org/v2

```typescript
headers: {
  'X-Api-Key': process.env.NEWS_API_KEY
}
```

Endpoint: GET /everything?q={vendor_name}&language=en
  &sortBy=publishedAt&pageSize=10

Extract article titles and descriptions only.
Never pass full article content to Claude.
This keeps costs minimal and avoids copyright issues.

HIBP integration — always check feature flag first:
```typescript
if (process.env.HIBP_ENABLED === 'true') {
  const response = await fetch(
    `https://haveibeenpwned.com/api/v3/breacheddomain/${domain}`,
    { headers: { 'hibp-api-key': process.env.HIBP_API_KEY } }
  )
} else {
  return { enabled: false, breaches: [] }
}
```

---

### Trust portal lookup chain

Install: npm install cheerio
Use cheerio for HTML parsing. Never use regex to parse HTML.

Wrap every step in try/catch.
A failed step returns { attempted: true, found: false, error: string }
Never let a scrape failure crash the assessment.

Store scrape metadata in source_data JSONB for the TRUST_CERTS
dimension so failures are visible and debuggable:

```json
{
  "certs_found": [],
  "scrape_metadata": {
    "ncsc": {
      "attempted": true,
      "http_status": 200,
      "found": false,
      "error": null
    },
    "vanta": {
      "attempted": true,
      "http_status": 200,
      "found": false,
      "error": null
    },
    "safebase": {
      "attempted": true,
      "http_status": 404,
      "found": false,
      "error": "404 not found"
    },
    "vendor_site": {
      "attempted": true,
      "http_status": 200,
      "found": true,
      "keywords_found": ["ISO 27001", "in progress"],
      "error": null
    }
  }
}
```

Step 1 — NCSC Cyber Essentials registry:
URL: https://www.ncsc.gov.uk/cyberessentials/search
Search by organisation name.
This is a government service — more stable than commercial sites.
Parse JSON response for certificate holder name and expiry.

Step 2 — Vanta public directory:
Try: https://trust.vanta.com/{slug}
Generate slug variants: lowercase, hyphens, no spaces.
Use cheerio to parse for cert badges and dates.

Step 3 — SafeBase directory:
Try: https://{slug}.safebase.io
Same slug approach.
Parse for cert listings.

Step 4 — Vendor website scrape:
If company website known from Companies House or GLEIF,
attempt these paths:
{domain}/security
{domain}/trust
{domain}/compliance
{domain}/certifications
{domain}/.well-known/security.txt

Look for keywords: SOC 2, ISO 27001, Cyber Essentials,
ISO 22301, PCI DSS, certificate, audit report, trust center.

Step 5 — Inconclusive handling:
If all steps return found: false, mark the dimension with
status: inconclusive not not_found.
The UI shows "Automated check inconclusive —
manual verification recommended" not "No certs found."
This is more honest and better GRC practice.

Trust cert scoring (0-100):
- SOC 2 Type II confirmed valid under 12 months: +40
- ISO 27001 confirmed valid: +30
- Cyber Essentials Plus confirmed: +20
- Cyber Essentials standard confirmed: +15
- ISO 22301 confirmed: +10
- Any cert found but validity unconfirmed: +15 per cert
- All steps inconclusive: base score 25
- Nothing found anywhere: base score 15
- Score capped at 100

---

### Claude API calls

Three calls only. All use claude-sonnet-4-5 model.
Use process.env.ANTHROPIC_API_KEY — never hardcode.
Estimated cost per assessment: approximately $0.002 total.

Graceful degradation: if any Claude call fails, mark that
dimension result as summary_unavailable and continue.
Never crash the pipeline because a Claude call failed.

Call 1 — Going concern detection:
Only run if Companies House filing text is available as text.
If filing is PDF only and cannot be parsed, skip and mark
as not_checked.

Prompt:
You are a financial risk analyst. Review these auditor notes
and determine if there are any going concern warnings,
material uncertainty statements, or indicators of financial
distress. Reply with JSON only, no other text:
{
  "going_concern": boolean,
  "confidence": "high" | "medium" | "low",
  "summary": string (max 100 characters)
}

Call 2 — News sentiment:
Input: array of article titles and descriptions only.

Prompt:
You are a GRC analyst assessing vendor risk. Review these
recent news headlines about [vendor_name] and identify any
that indicate regulatory action, data breaches, financial
distress, legal issues, service failures, or reputational risk.
Reply with JSON only, no other text:
{
  "sentiment": "positive" | "neutral" | "negative" | "mixed",
  "risk_items": [{ "headline": string, "risk_type": string }],
  "summary": string (max 150 characters)
}

Call 3 — Executive summary:
Input: structured JSON of all dimension scores and key findings.
Run after all scores are calculated.

Prompt:
You are a senior GRC analyst writing a vendor risk report.
Based on these assessment results, write a concise executive
summary. Reply with JSON only, no other text:
{
  "summary": string (2-3 sentences, max 400 characters),
  "recommended_action": string (max 150 characters),
  "key_concerns": string[] (maximum 3 items)
}

---

### Pipeline orchestration

Phase A — parallel using Promise.all:
- Companies House full profile, officers, PSC, filings
- GLEIF lookup by vendor name
- Sanctions screening (queries Neon sanctions_entries table)
- NewsAPI headlines fetch
- Trust portal chain (10 second timeout)
- HIBP check (only if HIBP_ENABLED === 'true')

Timeouts:
- Companies House: 10 seconds
- GLEIF: 8 seconds
- NewsAPI: 5 seconds
- Trust portals: 10 seconds
- Claude calls: 30 seconds each

Phase B — sequential after Phase A completes:
- Claude going concern call (needs Companies House data)
- Claude news sentiment call (needs NewsAPI headlines)

Phase C — scoring:
- Calculate all 6 dimension scores
- Apply special override rules
- Calculate weighted overall score
- Determine risk tier

Phase D — Claude executive summary:
- Pass all scores and findings as structured JSON
- Generate summary, recommended action, key concerns

Phase E — database writes in a single Drizzle transaction:
- Insert assessment record
- Insert assessment_scores (6 rows, one per dimension)
- Insert certifications rows for any certs found
- Insert audit_log entry: ASSESSMENT_CREATED
- Insert reassessment_schedule entry (annual, 1 year from now)
- Check questionnaire triggers
- Auto-create questionnaire record if triggered

All Phase E writes use a Drizzle transaction. Either
everything succeeds or nothing is written.

---

### Questionnaire trigger logic

Always trigger regardless of other conditions:
- Sanctions confirmed match found
- Company status not active

Trigger if 2 or more of these are true:
- No trust portal certs found and status is inconclusive
- Breach found within last 24 months (HIBP enabled only)
- Financial health score below 40
- News sentiment is negative
- Jurisdiction is FATF grey or black list
- Going concern flag confirmed

---

### Weighted scoring formula

Dimension weights summing to 100:
- Financial health: 20
- Breach history: 25
- Sanctions: 15
- Ownership and jurisdiction: 10
- Trust and certifications: 20
- News sentiment: 10

Overall score = sum of (dimension_score x weight / 100)

Risk tier thresholds:
- 75-100: LOW
- 50-74: MEDIUM
- 25-49: HIGH
- 0-24: CRITICAL

Special override rules applied after score calculation:
- Any sanctions match at any confidence: minimum HIGH tier
- Company status not active: minimum HIGH tier
- Going concern confirmed with high confidence: minimum MEDIUM tier

---

### Progress UI — /assessments/new

Step 1 — Search:
- Text input: Enter vendor or company name
- Debounced 300ms on input
- Calls /api/companies-house/search
- Shows dropdown of up to 10 results with company name,
  number, status, and registered address
- Each result is clickable
- Cannot find the company link opens manual entry form
  where analyst enters vendor name without a CH number

Step 2 — Running assessment:
Show live progress steps. Each ticks as complete.
Failures show a warning icon not an error — pipeline continues.

On completion show risk tier badge and View assessment button
linking to /assessments/[id].

---

### Assessment list — /assessments

Table columns:
- Vendor name
- Risk tier badge (green LOW, amber MEDIUM, orange HIGH, red CRITICAL)
- Date assessed
- Assessed by
- Status (DRAFT or COMPLETE)
- View link

Features:
- Filter by risk tier
- Sort by date newest first by default
- Pagination if over 20 results

Empty state message with button to /assessments/new.

Add to dashboard:
- New assessment button linking to /assessments/new
- Recent assessments section showing last 3
- View all assessments link

---

### Assessment detail stub — /assessments/[id]

Phase 5 stub only. Full report UI in Phase 7.

Show:
- Vendor name and Companies House number
- Risk tier badge
- Assessment date and assessed by
- DORA classification placeholder
- 6 dimension score cards with score, risk level,
  data source, fetched timestamp, and availability status
- Executive summary from Claude if available
- Key concerns list if available
- Recommended action if available

---

### Error handling rules

Every external call must:
1. Have a timeout as specified
2. Be wrapped in try/catch
3. On failure: log error, mark dimension as data_unavailable,
   continue pipeline
4. Never crash assessment because one source failed

Log all pipeline errors with assessment ID, source name,
error message, and timestamp.

---

### Packages to install

npm install cheerio fastest-levenshtein tsx

---

### Success criteria for Phase 5

- Searching a vendor name shows Companies House results
- Selecting a company triggers the full pipeline
- Progress steps display and update correctly
- Assessment record created in Neon with correct org_id
- All 6 dimension scores in assessment_scores table
- source_data JSONB populated for each dimension
- scrape_metadata stored for TRUST_CERTS dimension
- Certifications table populated if any certs found
- audit_log has ASSESSMENT_CREATED entry
- reassessment_schedule created for 1 year from now
- Assessment list shows completed assessment with correct tier
- Risk tier calculated correctly from weighted scores
- Special override rules applied correctly
- Claude summaries stored and displayed
- Questionnaire auto-created when triggers met
- Sanctions entries populated in Neon after running
  npm run sanctions:update
- Sanctions screening queries Neon not a flat file
- HIBP feature flag respected — no HIBP calls if false
- org_id isolation confirmed — assessments not visible
  across organisations
- All API keys read from process.env — nothing hardcoded

---

### Do not build in Phase 5
- Full report UI (Phase 7)
- PDF export (Phase 8)
- Manual score overrides UI (Phase 6)
- DORA/FCA classification UI (Phase 6)
- Cert alerts cron job (Phase 8)
- Payment features
- Email notifications
