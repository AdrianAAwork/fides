import { db } from '@/src/db'
import {
  assessments,
  assessmentScores,
  certifications,
  auditLog,
  reassessmentSchedule,
  questionnaires,
} from '@/src/db/schema'
import { fetchCompaniesHouseProfile } from './companies-house'
import { fetchGleif } from './gleif'
import { screenSanctions } from './sanctions'
import { fetchNews, fetchHibp } from './news'
import { fetchTrustPortals } from './trust-portals'
import { callGoingConcern, callNewsSentiment, callExecSummary } from './claude'
import { calculateScores, shouldTriggerQuestionnaire } from './scoring'
import type { PipelineResult } from './types'

export interface PipelineInput {
  vendorName: string
  companiesHouseNumber?: string
  orgId: string
  userId: string
}

export type PipelineEvent =
  | { type: 'step'; step: string; status: 'running' | 'done' | 'warn'; message?: string }
  | { type: 'complete'; assessmentId: string; riskTier: string; overallScore: number }
  | { type: 'error'; message: string }

export async function* runPipeline(input: PipelineInput): AsyncGenerator<PipelineEvent> {
  const { vendorName, companiesHouseNumber, orgId, userId } = input

  yield { type: 'step', step: 'companies_house', status: 'running' }
  const ch = companiesHouseNumber
    ? await fetchCompaniesHouseProfile(companiesHouseNumber)
    : {
        company_name: vendorName,
        company_number: '',
        company_status: 'unknown',
        officers: [],
        psc: [],
        filings: [],
      }
  yield {
    type: 'step',
    step: 'companies_house',
    status: ch.error ? 'warn' : 'done',
    message: ch.error,
  }

  yield { type: 'step', step: 'gleif', status: 'running' }
  yield { type: 'step', step: 'sanctions', status: 'running' }
  yield { type: 'step', step: 'news', status: 'running' }
  yield { type: 'step', step: 'trust_portals', status: 'running' }

  const officerNames = ch.officers.filter((o) => !o.resigned_on).map((o) => o.name)
  const website = ch.website

  // Phase A — parallel
  const [gleif, sanctions, news, trustPortals, hibp] = await Promise.all([
    fetchGleif(vendorName),
    screenSanctions(vendorName, officerNames),
    fetchNews(vendorName),
    fetchTrustPortals(ch.company_name || vendorName, website),
    fetchHibp(website ? new URL(website.startsWith('http') ? website : `https://${website}`).hostname : ''),
  ])

  yield { type: 'step', step: 'gleif', status: gleif.error ? 'warn' : 'done', message: gleif.error }
  yield { type: 'step', step: 'sanctions', status: sanctions.error ? 'warn' : 'done', message: sanctions.error }
  yield { type: 'step', step: 'news', status: news.error ? 'warn' : 'done', message: news.error }
  yield { type: 'step', step: 'trust_portals', status: trustPortals.error ? 'warn' : 'done', message: trustPortals.error }

  // Phase B — Claude calls (sequential, needs Phase A data)
  yield { type: 'step', step: 'ai_analysis', status: 'running' }
  const filingText = ch.filings.map((f) => f.description).join('\n') || null
  const [goingConcern, newsSentiment] = await Promise.all([
    callGoingConcern(filingText),
    callNewsSentiment(vendorName, news.articles),
  ])
  yield { type: 'step', step: 'ai_analysis', status: 'done' }

  // Phase C — scoring
  yield { type: 'step', step: 'scoring', status: 'running' }
  const scores = calculateScores(ch, gleif, sanctions, news, hibp, trustPortals, goingConcern, newsSentiment)
  yield { type: 'step', step: 'scoring', status: 'done' }

  // Phase D — exec summary
  yield { type: 'step', step: 'summary', status: 'running' }
  const execSummary = await callExecSummary(scores, vendorName)
  yield { type: 'step', step: 'summary', status: execSummary.status === 'summary_unavailable' ? 'warn' : 'done' }

  // Phase E — DB writes in a single transaction
  yield { type: 'step', step: 'saving', status: 'running' }

  let assessmentId: string

  try {
    const result = await db.transaction(async (tx) => {
      // Insert assessment
      const [assessment] = await tx.insert(assessments).values({
        orgId,
        createdBy: userId,
        vendorName: ch.company_name || vendorName,
        companiesHouseNumber: ch.company_number || null,
        lei: gleif.lei ?? null,
        sicCode: ch.sic_codes?.[0] ?? null,
        jurisdiction: gleif.jurisdiction ?? ch.registered_office_address?.country ?? null,
        incorporationDate: ch.date_of_creation ?? null,
        companyStatus: ch.company_status ?? null,
        assessmentStatus: 'COMPLETE',
        riskTier: scores.riskTier,
        overallScore: scores.overallScore,
        execSummaryJson: execSummary as unknown as Record<string, unknown>,
      }).returning({ id: assessments.id })

      const aId = assessment.id

      // Insert 6 dimension scores
      const dimensionRows = [
        scores.financial_health,
        scores.breach_history,
        scores.sanctions,
        scores.ownership,
        scores.trust_certs,
        scores.news_sentiment,
      ] as const

      for (const dim of dimensionRows) {
        await tx.insert(assessmentScores).values({
          assessmentId: aId,
          orgId,
          dimension: dim.dimension as 'FINANCIAL_HEALTH' | 'BREACH_HISTORY' | 'SANCTIONS' | 'OWNERSHIP' | 'TRUST_CERTS' | 'NEWS_SENTIMENT',
          rawScore: dim.rawScore,
          finalScore: dim.finalScore,
          sourceData: dim.sourceData as Record<string, unknown>,
          fetchedAt: dim.fetchedAt,
        })
      }

      // Insert certifications found
      for (const cert of trustPortals.certs_found) {
        await tx.insert(certifications).values({
          assessmentId: aId,
          orgId,
          certType: cert.certType as 'SOC2_TYPE_I' | 'SOC2_TYPE_II' | 'ISO_27001' | 'ISO_22301' | 'ISO_27701' | 'CYBER_ESSENTIALS' | 'CYBER_ESSENTIALS_PLUS' | 'PCI_DSS' | 'CSA_STAR' | 'OTHER',
          sourceType: cert.source === 'ncsc'
            ? 'AUTO_WEB'
            : cert.source === 'vanta'
            ? 'AUTO_VANTA'
            : cert.source === 'safebase'
            ? 'AUTO_SAFEBASE'
            : 'AUTO_WEB',
          sourceUrl: null,
          issuingBody: cert.issuingBody ?? null,
          expiryDate: cert.expiryDate ?? null,
          retrievedAt: new Date(),
        })
      }

      // Audit log
      await tx.insert(auditLog).values({
        assessmentId: aId,
        orgId,
        userId,
        actionType: 'ASSESSMENT_CREATED',
        newValue: { riskTier: scores.riskTier, overallScore: scores.overallScore } as Record<string, unknown>,
      })

      // Reassessment schedule — 1 year from now
      const scheduledDate = new Date()
      scheduledDate.setFullYear(scheduledDate.getFullYear() + 1)
      await tx.insert(reassessmentSchedule).values({
        assessmentId: aId,
        orgId,
        scheduledDate: scheduledDate.toISOString().split('T')[0],
        triggerType: 'ANNUAL',
      })

      // Questionnaire trigger
      const shouldTrigger = shouldTriggerQuestionnaire(
        ch, sanctions, hibp, trustPortals,
        scores.financial_health, newsSentiment, gleif, goingConcern
      )

      if (shouldTrigger) {
        const reasons: string[] = []
        if (sanctions.highestLevel === 'confirmed') reasons.push('sanctions_confirmed')
        if (ch.company_status !== 'active') reasons.push('company_not_active')
        if (trustPortals.certs_found.length === 0) reasons.push('no_trust_certs')
        if (scores.financial_health.finalScore < 40) reasons.push('low_financial_health')
        if (newsSentiment.sentiment === 'negative') reasons.push('negative_news')
        if (goingConcern.going_concern) reasons.push('going_concern')

        await tx.insert(questionnaires).values({
          assessmentId: aId,
          orgId,
          triggerReasons: reasons as unknown as Record<string, unknown>,
        })
      }

      return aId
    })

    assessmentId = result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[pipeline] DB transaction failed:', msg)
    yield { type: 'error', message: 'Failed to save assessment: ' + msg }
    return
  }

  yield { type: 'step', step: 'saving', status: 'done' }
  yield { type: 'complete', assessmentId, riskTier: scores.riskTier, overallScore: scores.overallScore }
}
