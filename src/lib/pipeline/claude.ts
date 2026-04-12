import Anthropic from '@anthropic-ai/sdk'
import type {
  GoingConcernResult,
  NewsSentimentResult,
  ExecSummaryResult,
  NewsArticle,
  PipelineScores,
} from './types'

const MODEL = 'claude-sonnet-4-5'
const TIMEOUT_MS = 30_000

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

async function callClaude(
  systemPrompt: string,
  userContent: string
): Promise<string | null> {
  const client = getClient()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userContent }],
    })
    const block = msg.content[0]
    return block.type === 'text' ? block.text : null
  } catch (err) {
    console.error('[pipeline:claude] error:', err instanceof Error ? err.message : err)
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
    const parsed = JSON.parse(result) as GoingConcernResult
    return { ...parsed, status: 'checked' }
  } catch {
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
    const parsed = JSON.parse(result) as NewsSentimentResult
    return { ...parsed, status: 'checked' }
  } catch {
    return { sentiment: 'neutral', risk_items: [], summary: '', status: 'summary_unavailable' }
  }
}

export async function callExecSummary(
  scores: PipelineScores,
  vendorName: string
): Promise<ExecSummaryResult> {
  const system =
    'You are a senior GRC analyst writing a vendor risk report. Based on the assessment results, write a concise executive summary. Reply with JSON only, no other text.'

  const scoresSummary = {
    vendor: vendorName,
    overall_score: scores.overallScore,
    risk_tier: scores.riskTier,
    dimensions: Object.entries(scores)
      .filter(([k]) => !['overallScore', 'riskTier'].includes(k))
      .map(([k, v]) => ({
        dimension: k,
        score: (v as { finalScore: number }).finalScore,
      })),
  }

  const result = await callClaude(
    system,
    `Assessment results:\n${JSON.stringify(scoresSummary, null, 2)}`
  )

  if (!result) {
    return { summary: '', recommended_action: '', key_concerns: [], status: 'summary_unavailable' }
  }

  try {
    const parsed = JSON.parse(result) as ExecSummaryResult
    return { ...parsed, status: 'checked' }
  } catch {
    return { summary: '', recommended_action: '', key_concerns: [], status: 'summary_unavailable' }
  }
}
