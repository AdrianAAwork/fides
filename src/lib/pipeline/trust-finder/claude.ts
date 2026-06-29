import { getClient } from '../claude'
import type { CertClaimed } from './types'

const MODEL = 'claude-sonnet-4-6'
const TIMEOUT_MS = 30_000

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#[\d]+;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractJson(raw: string): string {
  const fenceStripped = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()

  const start = fenceStripped.indexOf('{')
  if (start === -1) return fenceStripped.trim()

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

async function callClaude(
  systemPrompt: string,
  userContent: string,
  maxTokens = 1024
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
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[trust-finder:claude] request aborted — exceeded', TIMEOUT_MS, 'ms timeout')
    } else {
      console.error('[trust-finder:claude] unexpected error:', err)
    }
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function callHomepageAnalysis(homeHtml: string, domain: string): Promise<string[]> {
  const system = `You are a security compliance researcher. Given a vendor's homepage HTML, identify at most 2 URLs that lead to their trust center, security page, compliance page, or certification pages. Only return absolute URLs on the domain "${domain}" or well-known trust platforms (safebase.io, vanta.com, whistic.com, drata.com, conveyor.security, trustpage.com). Reply with JSON only, no other text: {"trustUrls": ["https://...", "https://..."]}`

  const result = await callClaude(system, `Homepage HTML:\n\n${homeHtml.slice(0, 8000)}`)
  if (!result) return []

  try {
    const raw = extractJson(result)
    const parsed = JSON.parse(raw) as { trustUrls?: unknown }
    const urls = parsed.trustUrls
    if (!Array.isArray(urls)) return []
    return urls.filter((u): u is string => typeof u === 'string').slice(0, 2)
  } catch (err) {
    console.error('[trust-finder:claude] homepage-analysis JSON parse failed:', err)
    return []
  }
}

export async function callCertExtraction(pageText: string): Promise<CertClaimed[]> {
  const system = `You are a security compliance analyst. Extract ONLY certifications and compliance frameworks that the vendor HOLDS — not ones they merely reference or benchmark against.

HELD — extract these:
- Entries in a dedicated Compliance or Certifications section (badges, named items, rows with an auditor)
- On SafeBase pages: each item with its own ?itemUid= URL is a held certification — section membership is the primary signal
- Explicit vendor claims: "we are X certified", "X compliant", "we have achieved X", "audited against X"

REFERENCED — do NOT extract:
- Standards cited as benchmarks in prose: "aligned with", "based on", "in line with", "following"
- Standards named inline within a control description, e.g. "ISO 27001 A.9.4.3" inside a password-policy paragraph, or "NIST SP 800-63B" inside an authentication section — these are control clause citations, not held certifications
- Anything the vendor uses as a guideline but does not claim to hold a certificate or attestation for

RULES:
- Be EXHAUSTIVE — extract every distinct held certification; do not sample or truncate
- foundInText: quote the shortest exact substring from the page that proves this cert is HELD (a badge label, section entry name, or "certified/compliant" statement). This must be a verbatim quote. If you cannot find a real supporting substring, omit the cert entirely.
- auditor: the named third-party auditor if the page provides one (e.g. "Dot.Bit d.o.o."), else null
- rawLabel: the label exactly as it appears on the page
- Do NOT include dates, audit periods, expiry dates, scores, risk ratings, or impact levels
- Do NOT infer certifications the vendor "likely" holds based on their industry — only what is explicit

Normalised certType values — use exactly these strings:
Security/audit certs: SOC1, SOC2_TYPE_I, SOC2_TYPE_II (use SOC2_TYPE_II when type I/II unspecified), SOC3, ISO_27001, ISO_27017, ISO_27018, ISO_27701, ISO_22301, ISO_42001, PCI_DSS, PCI_3DS, PCI_PIN, PCI_PA_DSS, EMVCO, CYBER_ESSENTIALS, CYBER_ESSENTIALS_PLUS, CSA_STAR, NIST_CSF, GDPR, DORA, FEDRAMP, HIPAA, C5, TISAX, OTHER (for unrecognised items — preserve rawLabel exactly)
Privacy compliance frameworks (self-certification, NOT third-party audits): EU_US_DPF, UK_DPF, SWISS_US_DPF, CBPR, PRP

For PCI DSS: use PCI_DSS regardless of level; preserve the full level detail in rawLabel (e.g. "PCI DSS Service Provider Level 1").

Add a "category" field to each cert:
- "security_cert" for security/audit certifications (SOC, ISO, PCI, Cyber Essentials, CSA STAR, NIST CSF, GDPR, DORA, FedRAMP, HIPAA, C5, TISAX, EMVCo, OTHER)
- "privacy_framework" for privacy compliance/self-certification frameworks (EU_US_DPF, UK_DPF, SWISS_US_DPF, CBPR, PRP)
- "other" only if category is genuinely unclear

Reply with JSON only, no other text. Use JSON null (not the string "null") for auditor when no auditor is named on the page:
{"certs": [{"certType": "...", "rawLabel": "...", "foundInText": "...", "auditor": "Auditor Name or null", "category": "security_cert"}]}`

  const visibleText = htmlToText(pageText)
  const result = await callClaude(system, `Trust page content:\n\n${visibleText.slice(0, 6000)}`, 1024)
  if (!result) return []

  try {
    const raw = extractJson(result)
    const parsed = JSON.parse(raw) as { certs?: unknown }
    const certs = parsed.certs
    if (!Array.isArray(certs)) return []
    const VALID_CATEGORIES = new Set(['security_cert', 'privacy_framework', 'other'])
    return certs
      .filter(
        (c): c is Record<string, unknown> =>
          typeof c === 'object' &&
          c !== null &&
          typeof (c as Record<string, unknown>).certType === 'string' &&
          typeof (c as Record<string, unknown>).rawLabel === 'string' &&
          typeof (c as Record<string, unknown>).foundInText === 'string' &&
          ((c as Record<string, unknown>).auditor === null ||
            typeof (c as Record<string, unknown>).auditor === 'string')
      )
      .map((c): CertClaimed => ({
        certType: c.certType as string,
        rawLabel: c.rawLabel as string,
        foundInText: c.foundInText as string,
        auditor: c.auditor as string | null,
        category: VALID_CATEGORIES.has(c.category as string)
          ? (c.category as CertClaimed['category'])
          : 'other',
      }))
  } catch (err) {
    console.error('[trust-finder:claude] cert-extraction JSON parse failed:', err)
    return []
  }
}
