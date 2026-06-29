import Anthropic from '@anthropic-ai/sdk'
import type {
  GoingConcernResult,
  NewsSentimentResult,
  ExecSummaryResult,
  NewsArticle,
  PipelineScores,
  TrustPortalsData,
  GleifData,
  HibpData,
} from './types'

interface ExecSummaryContext {
  trustPortals: TrustPortalsData
  gleif: GleifData
  hibp: HibpData
}

const MODEL = 'claude-sonnet-4-6'
const TIMEOUT_MS = 30_000

/**
 * Extract the first complete {...} JSON object from a string.
 * Handles cases where the model wraps output in markdown fences or adds
 * preamble text before the JSON.
 */
function extractJson(raw: string): string {
  // Strip markdown code fences before parsing (model sometimes wraps output in ```json ... ```)
  const fenceStripped = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()

  const start = fenceStripped.indexOf('{')
  if (start === -1) return fenceStripped.trim()

  // Brace-depth walk so we stop at the true closing brace, not the last } in the string
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < fenceStripped.length; i++) {
    const ch = fenceStripped[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return fenceStripped.slice(start, i + 1)
    }
  }

  const end = fenceStripped.lastIndexOf('}')
  if (end < start) return fenceStripped.trim()
  return fenceStripped.slice(start, end + 1)
}

export function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[pipeline:claude] ANTHROPIC_API_KEY is not set')
  } else {
    console.log('[pipeline:claude] ANTHROPIC_API_KEY is present (length:', apiKey.length, ')')
  }
  return new Anthropic({ apiKey })
}

async function callClaude(
  systemPrompt: string,
  userContent: string,
  maxTokens = 512,
): Promise<string | null> {
  const client = getClient()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const msg = await client.messages.create(
      {
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      },
      { signal: controller.signal }
    )
    const block = msg.content[0]
    return block.type === 'text' ? block.text : null
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(
        `[pipeline:claude] APIError status=${err.status} name=${err.name} message=${err.message}`
      )
    } else if (err instanceof Error && err.name === 'AbortError') {
      console.error('[pipeline:claude] request aborted — exceeded', TIMEOUT_MS, 'ms timeout')
    } else {
      console.error('[pipeline:claude] unexpected error:', err)
    }
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function callGoingConcern(filingText: string | null): Promise<GoingConcernResult> {
  if (!filingText) {
    return { going_concern: false, confidence: 'low', summary: '', status: 'not_checked' }
  }

  const system =
    'You are a financial risk analyst. Review auditor notes and determine if there are going concern warnings, material uncertainty statements, or indicators of financial distress. Reply with JSON only, no other text.'
  const result = await callClaude(
    system,
    `Analyse these auditor notes:\n\n${filingText.slice(0, 4000)}`
  )

  if (!result) {
    return { going_concern: false, confidence: 'low', summary: '', status: 'summary_unavailable' }
  }

  try {
    const raw = extractJson(result)
    const parsed = JSON.parse(raw) as GoingConcernResult
    return { ...parsed, status: 'checked' }
  } catch (err) {
    console.error('[pipeline:claude] going-concern JSON parse failed. Raw result:', result, 'Error:', err)
    return { going_concern: false, confidence: 'low', summary: '', status: 'summary_unavailable' }
  }
}

export async function callNewsSentiment(
  vendorName: string,
  articles: NewsArticle[]
): Promise<NewsSentimentResult> {
  if (articles.length === 0) {
    return { sentiment: 'neutral', risk_items: [], summary: 'No news articles available.', status: 'not_checked' }
  }

  const system =
    'You are a GRC analyst assessing vendor risk. Review news headlines and identify any that indicate regulatory action, data breaches, financial distress, legal issues, service failures, or reputational risk. Reply with JSON only, no other text.'

  const articlesText = articles
    .map((a) => `- ${a.title}${a.description ? `: ${a.description}` : ''}`)
    .join('\n')

  const result = await callClaude(
    system,
    `Review these recent news headlines about ${vendorName}:\n\n${articlesText}`
  )

  if (!result) {
    return { sentiment: 'neutral', risk_items: [], summary: '', status: 'summary_unavailable' }
  }

  try {
    const raw = extractJson(result)
    const parsed = JSON.parse(raw) as NewsSentimentResult
    return { ...parsed, status: 'checked' }
  } catch (err) {
    console.error('[pipeline:claude] news-sentiment JSON parse failed. Raw result:', result, 'Error:', err)
    return { sentiment: 'neutral', risk_items: [], summary: '', status: 'summary_unavailable' }
  }
}

const CERT_DISPLAY: Record<string, string> = {
  SOC2_TYPE_I: 'SOC 2 Type I', SOC2_TYPE_II: 'SOC 2 Type II',
  ISO_27001: 'ISO 27001', ISO_22301: 'ISO 22301', ISO_27701: 'ISO 27701',
  CYBER_ESSENTIALS: 'Cyber Essentials', CYBER_ESSENTIALS_PLUS: 'Cyber Essentials Plus',
  PCI_DSS: 'PCI DSS', CSA_STAR: 'CSA STAR',
}

export async function callExecSummary(
  scores: PipelineScores,
  vendorName: string,
  context: ExecSummaryContext,
): Promise<ExecSummaryResult> {
  const system = `You are a senior GRC analyst writing a concise executive summary for an internal vendor risk report.

GROUNDING RULES — follow all without exception:
1. Certifications: if any certifications appear in the "certs_found" list, they were auto-discovered from the vendor's trust page. Describe them as "auto-discovered, pending analyst verification". NEVER say the vendor lacks or may lack certifications that are already in certs_found. NEVER recommend providing certs already found.
2. Ownership / GLEIF: if "gleif_record_found" is false, the ownership score is low because no public GLEIF registry entry exists — NOT because a risk was detected. Many legitimate entities are not GLEIF-registered. Describe this as data unavailability, NOT as concealment, hidden relationships, or conflicts of interest.
3. Only describe something as a concern when the underlying data explicitly shows a risk (confirmed breach, risky jurisdiction, sanctions match) — never infer risk from a low score alone when the score reflects missing data.
4. Tone: neutral, professional, due-diligence language. Frame next steps as routine analyst actions (verify, obtain, confirm). Avoid loaded terms (deficiencies, concealment, conflicts of interest, undisclosed, materially elevated) unless the data genuinely supports them.

Reply with a single JSON object using EXACTLY these three keys — no wrapper, no extra keys, no markdown fences:
{"summary":"2-3 sentence overview grounded in the actual findings","recommended_action":"one clear next step for the analyst","key_concerns":["concern grounded in data","concern grounded in data"]}`

  // ── Build grounded findings context ──────────────────────────────────────

  // Trust certs
  const certNames = context.trustPortals.certs_found.map(c =>
    c.certType === 'OTHER' && c.notes ? c.notes : (CERT_DISPLAY[c.certType] ?? c.certType)
  )
  const trustNote =
    context.trustPortals.status === 'found'
      ? `Trust page found and read. ${certNames.length} certification(s) auto-discovered (UNVERIFIED — not confirmed against audit reports): ${certNames.join(', ') || 'none listed'}.`
      : context.trustPortals.status === 'inconclusive'
      ? 'A trust page was located but its contents could not be read (JS-rendered or access-gated). No certifications extracted — this does not mean none exist.'
      : 'No trust page found at common locations. Absence of data only — vendor may have a private or custom portal.'

  // GLEIF / ownership
  const gleifHasRecord = !!context.gleif.lei
  let gleifNote: string
  if (context.gleif.error) {
    gleifNote = `GLEIF lookup failed (technical error). Ownership score reflects data unavailability, not a detected risk.`
  } else if (!gleifHasRecord) {
    gleifNote = `No GLEIF record found. Ownership score is 40 because no public registry data is available — NOT because a risk was detected. Many legitimate entities, especially foreign-registered companies, are not in the GLEIF registry. This is absence of data, not a risk signal.`
  } else {
    const nameMatchNote = context.gleif.matchMethod === 'nameSearch'
      ? ' Matched via name search (not registry number) — analyst should confirm this is the correct legal entity.'
      : ''
    gleifNote = `GLEIF record found. Legal name: ${context.gleif.legalName ?? vendorName}. Jurisdiction: ${context.gleif.jurisdiction ?? 'unknown'}. LEI: ${context.gleif.lei}.${nameMatchNote}`
  }

  // Breach history
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 24)
  let breachNote: string
  if (!context.hibp.enabled) {
    breachNote = 'Breach history check not configured.'
  } else if (context.hibp.error) {
    breachNote = `Breach history check failed. Score reflects data unavailability.`
  } else {
    const recent = context.hibp.breaches.filter(b => new Date(b.BreachDate) >= cutoff)
    breachNote = recent.length > 0
      ? `${recent.length} breach(es) within last 24 months: ${recent.map(b => b.Name).join(', ')}.`
      : context.hibp.breaches.length > 0
      ? 'No recent breaches (older breaches exist but outside 24-month window).'
      : 'No breaches found on vendor domain.'
  }

  const findings = {
    vendor: vendorName,
    overall_score: scores.overallScore,
    risk_tier: scores.riskTier,
    dimension_scores: Object.entries(scores)
      .filter(([k]) => !['overallScore', 'riskTier'].includes(k))
      .map(([k, v]) => ({ dimension: k, score: (v as { finalScore: number }).finalScore })),
    gleif_record_found: gleifHasRecord,
    gleif_context: gleifNote,
    trust_cert_status: context.trustPortals.status,
    certs_found: certNames,
    trust_context: trustNote,
    breach_context: breachNote,
  }

  const result = await callClaude(
    system,
    `Assessment findings:\n${JSON.stringify(findings, null, 2)}`,
    4096,
  )

  if (!result) {
    return { summary: '', recommended_action: '', key_concerns: [], status: 'summary_unavailable' }
  }

  try {
    const raw = extractJson(result)
    const parsed = JSON.parse(raw) as Record<string, unknown>

    // Normalise: handle both flat shape { summary, recommended_action, key_concerns }
    // and the wrapped shape the model sometimes produces { executive_summary: { ... } }.
    const node: Record<string, unknown> =
      typeof parsed.executive_summary === 'object' && parsed.executive_summary !== null
        ? (parsed.executive_summary as Record<string, unknown>)
        : parsed

    const summary = typeof node.summary === 'string' ? node.summary : ''

    // Model may return recommendations as an array or recommended_action as a string
    const rawAction = node.recommended_action ?? node.recommendations
    const recommended_action = Array.isArray(rawAction)
      ? (rawAction as string[]).join(' ')
      : typeof rawAction === 'string' ? rawAction : ''

    // key_concerns or aliased as risks / key_risks
    const rawConcerns = node.key_concerns ?? node.risks ?? node.key_risks
    const key_concerns: string[] = Array.isArray(rawConcerns)
      ? (rawConcerns as unknown[]).map(String)
      : []

    return { summary, recommended_action, key_concerns, status: 'checked' }
  } catch (err) {
    console.error('[pipeline:claude] exec-summary JSON parse failed. Raw result:', result, 'Error:', err)
    return { summary: '', recommended_action: '', key_concerns: [], status: 'summary_unavailable' }
  }
}
