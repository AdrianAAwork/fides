import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Circle,
} from '@react-pdf/renderer'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PdfCert {
  certType: string
  sourceType: string
  issuingBody: string | null
  expiryDate: string | null
  notes: string | null
}

export interface PdfAuditEntry {
  actionType: string
  createdAt: Date
  userDisplayName: string | null
  userEmail: string | null
  reason: string | null
  oldValue: unknown
  newValue: unknown
}

export interface PdfContractData {
  slaUptime?: string
  rto?: string
  rpo?: string
  contractExpiry?: string
  nextReviewDate?: string
  accountManagerName?: string
  accountManagerEmail?: string
  notes?: string
}

export interface PdfDoraData {
  classification: string
  classificationJustification: string
  serviceType: string
  processesPersonalData: boolean
  lossImpactOver2hrs: boolean
  substituteAvailable: boolean
  regulatedActivitySubstitute: boolean
  isOverridden: boolean
  overrideReason: string | null
}

export interface PdfScore {
  dimension: string
  label: string
  weight: number
  rawScore: number
  finalScore: number
  isOverridden: boolean
  overrideReason: string | null
}

export interface AssessmentPdfData {
  assessment: {
    id: string
    vendorName: string
    companiesHouseNumber: string | null
    lei: string | null
    sicCode: string | null
    jurisdiction: string | null
    companyStatus: string | null
    incorporationDate: string | null
    riskTier: string
    overallScore: number
    createdAt: Date
  }
  assessorName: string | null
  orgName: string
  scores: PdfScore[]
  dora: PdfDoraData | null
  certifications: PdfCert[]
  contractDetails: PdfContractData | null
  auditEntries: PdfAuditEntry[]
  execSummary: {
    summary?: string
    recommended_action?: string
    key_concerns?: string[]
  } | null
}

// ── Lookups ───────────────────────────────────────────────────────────────────

const CERT_LABELS: Record<string, string> = {
  SOC2_TYPE_I: 'SOC 2 Type I',
  SOC2_TYPE_II: 'SOC 2 Type II',
  ISO_27001: 'ISO 27001',
  ISO_22301: 'ISO 22301',
  ISO_27701: 'ISO 27701',
  CYBER_ESSENTIALS: 'Cyber Essentials',
  CYBER_ESSENTIALS_PLUS: 'Cyber Essentials Plus',
  PCI_DSS: 'PCI DSS',
  CSA_STAR: 'CSA STAR',
  OTHER: 'Other certification',
}

const SOURCE_LABELS: Record<string, string> = {
  AUTO_VANTA: 'Vanta trust portal',
  AUTO_SAFEBASE: 'SafeBase portal',
  AUTO_WEB: 'Public portal / NCSC',
  MANUAL: 'Manually added',
}

const ACTION_LABELS: Record<string, string> = {
  ASSESSMENT_CREATED: 'Assessment created',
  SCORE_OVERRIDDEN: 'Score adjusted',
  CLASSIFICATION_CONFIRMED: 'DORA classification confirmed',
  CLASSIFICATION_OVERRIDDEN: 'DORA classification overridden',
  CERT_ADDED: 'Certification added',
  CERT_DELETED: 'Certification removed',
  QUESTIONNAIRE_TRIGGERED: 'Questionnaire generated',
  REASSESSMENT_SCHEDULED: 'Reassessment scheduled',
  ASSESSMENT_DELETED: 'Assessment deleted',
}

const TIER_BG: Record<string, string> = {
  LOW: '#E6F1FB',
  MEDIUM: '#EAF3DE',
  HIGH: '#FAEEDA',
  CRITICAL: '#FCEBEB',
}

const TIER_TEXT: Record<string, string> = {
  LOW: '#0C447C',
  MEDIUM: '#27500A',
  HIGH: '#633806',
  CRITICAL: '#791F1F',
}

// ── Styles ────────────────────────────────────────────────────────────────────

const PURPLE = '#5B3FD4'
const BODY = '#1A1625'
const SECONDARY = '#8B85A8'

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 55,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: BODY,
    lineHeight: 1.5,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 25,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: SECONDARY,
  },
  sectionHeader: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: PURPLE,
    marginTop: 18,
    marginBottom: 3,
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: PURPLE,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  col2: {
    width: '50%',
  },
  label: {
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: SECONDARY,
    marginBottom: 2,
  },
  value: {
    fontSize: 10,
    color: BODY,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F4F3F8',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E2DFF0',
  },
  tableCell: {
    fontSize: 9,
    color: BODY,
  },
  tableCellHeader: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: SECONDARY,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 50,
    alignSelf: 'flex-start',
  },
  amber: {
    borderLeftWidth: 3,
    borderLeftColor: '#BA7517',
    backgroundColor: '#FEF9EE',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
    marginTop: 4,
  },
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function PdfPageNumber() {
  return (
    <Text
      style={styles.pageNumber}
      render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        `Page ${pageNumber} of ${totalPages}`
      }
      fixed
    />
  )
}

function SectionHeader({ children }: { children: string }) {
  return (
    <>
      <Text style={styles.sectionHeader}>{children}</Text>
      <View style={styles.divider} />
    </>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.col2}>
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.col2}>
        <Text style={styles.value}>{value || '—'}</Text>
      </View>
    </View>
  )
}

function PdfSeal({ size = 80 }: { size?: number }) {
  const cx = size / 2
  const cy = size / 2
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={cx} cy={cy} r={size * 0.46} stroke={PURPLE} strokeWidth={1.5} fill="none" strokeOpacity={0.45} />
      <Circle cx={cx} cy={cy} r={size * 0.34} stroke={PURPLE} strokeWidth={1} fill="none" strokeOpacity={0.3} />
    </Svg>
  )
}

function isExpiringWithin90Days(expiryDate: string | null): boolean {
  if (!expiryDate) return false
  const expiry = new Date(expiryDate)
  const now = new Date()
  const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays >= 0 && diffDays <= 90
}

function isExpired(expiryDate: string | null): boolean {
  if (!expiryDate) return false
  return new Date(expiryDate) < new Date()
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB')
}

function buildAuditDesc(entry: PdfAuditEntry): string {
  const oldVal = entry.oldValue as Record<string, unknown> | null | undefined
  const newVal = entry.newValue as Record<string, unknown> | null | undefined
  if (entry.actionType === 'SCORE_OVERRIDDEN') {
    const dim = (newVal?.dimension as string) ?? ''
    const parts = [dim.replace(/_/g, ' ').toLowerCase()]
    if (oldVal?.score != null && newVal?.score != null) parts.push(`${oldVal.score} → ${newVal.score}`)
    if (entry.reason) parts.push(entry.reason)
    return parts.filter(Boolean).join(' · ')
  }
  if (entry.actionType === 'CERT_ADDED') {
    return ((newVal?.certType as string) ?? '').replace(/_/g, ' ')
  }
  return entry.reason ?? ''
}

// ── Pages ─────────────────────────────────────────────────────────────────────

function CoverPage({ data }: { data: AssessmentPdfData }) {
  const { assessment, orgName, assessorName } = data
  const tierBg = TIER_BG[assessment.riskTier] ?? '#F4F3F8'
  const tierText = TIER_TEXT[assessment.riskTier] ?? BODY

  return (
    <Page size="A4" style={styles.page}>
      <PdfPageNumber />
      {/* Seal centred */}
      <View style={{ alignItems: 'center', marginTop: 60, marginBottom: 32 }}>
        <PdfSeal size={120} />
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10, marginTop: 10, letterSpacing: 2, color: PURPLE }}>
          FIDES
        </Text>
      </View>

      {/* Title */}
      <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 2, color: BODY, textAlign: 'center', marginBottom: 8 }}>
        Vendor Risk Assessment Report
      </Text>

      {/* Vendor name */}
      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: BODY, textAlign: 'center', marginBottom: 24 }}>
        {assessment.vendorName}
      </Text>

      {/* Meta */}
      <View style={{ backgroundColor: '#F9F8FD', borderRadius: 4, padding: 16, marginBottom: 20, marginHorizontal: 40 }}>
        <MetaRow label="Assessment date" value={fmtDate(assessment.createdAt)} />
        <MetaRow label="Assessed by" value={assessorName ?? 'Unknown'} />
        <MetaRow label="Organisation" value={orgName} />
        {assessment.companiesHouseNumber && (
          <MetaRow label="Companies House no." value={assessment.companiesHouseNumber} />
        )}
      </View>

      {/* Risk tier badge */}
      <View style={{ alignItems: 'center', marginBottom: 24 }}>
        <View style={[styles.tierBadge, { backgroundColor: tierBg }]}>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: tierText, letterSpacing: 1 }}>
            {assessment.riskTier} RISK
          </Text>
        </View>
        <Text style={{ fontSize: 10, color: SECONDARY, marginTop: 4 }}>
          Overall score: {assessment.overallScore}/100
        </Text>
      </View>

      {/* Confidentiality notice */}
      <View style={{ borderTopWidth: 0.5, borderTopColor: '#E2DFF0', paddingTop: 12, marginTop: 'auto' }}>
        <Text style={{ fontSize: 8, color: SECONDARY, textAlign: 'center' }}>
          For internal use only — prepared by {orgName} using Fides
        </Text>
        <Text style={{ fontSize: 8, color: SECONDARY, textAlign: 'center', marginTop: 2 }}>
          Assessment ID: {assessment.id}
        </Text>
      </View>
    </Page>
  )
}

function ExecutiveSummaryPage({ data }: { data: AssessmentPdfData }) {
  const { assessment, execSummary, dora } = data

  return (
    <Page size="A4" style={styles.page}>
      <PdfPageNumber />
      <SectionHeader>Executive Summary</SectionHeader>

      {/* Report metadata table */}
      <View style={{ marginBottom: 12 }}>
        <MetaRow label="CH number" value={assessment.companiesHouseNumber ?? '—'} />
        <MetaRow label="LEI" value={assessment.lei ?? '—'} />
        <MetaRow label="SIC code" value={assessment.sicCode ?? '—'} />
        <MetaRow label="Jurisdiction" value={assessment.jurisdiction ?? '—'} />
        <MetaRow label="Company status" value={assessment.companyStatus ?? '—'} />
        <MetaRow label="Incorporation date" value={fmtDate(assessment.incorporationDate)} />
        <MetaRow label="DORA classification" value={dora?.classification ?? 'Not classified'} />
      </View>

      {execSummary?.summary && (
        <>
          <SectionHeader>Summary</SectionHeader>
          <Text style={{ fontSize: 10, color: BODY, lineHeight: 1.6, marginBottom: 10 }}>
            {execSummary.summary}
          </Text>
        </>
      )}

      {execSummary?.recommended_action && (
        <>
          <SectionHeader>Recommended Action</SectionHeader>
          <View style={styles.amber}>
            <Text style={{ fontSize: 10, color: '#633806', lineHeight: 1.5 }}>
              {execSummary.recommended_action}
            </Text>
          </View>
        </>
      )}

      {execSummary?.key_concerns && execSummary.key_concerns.length > 0 && (
        <>
          <SectionHeader>Key Concerns</SectionHeader>
          {execSummary.key_concerns.map((concern, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 5 }}>
              <Text style={{ color: PURPLE, marginRight: 6, fontSize: 10 }}>›</Text>
              <Text style={{ fontSize: 10, color: BODY, flex: 1, lineHeight: 1.5 }}>{concern}</Text>
            </View>
          ))}
        </>
      )}
    </Page>
  )
}

function ScoresPage({ data }: { data: AssessmentPdfData }) {
  const { scores, assessment } = data

  return (
    <Page size="A4" style={styles.page}>
      <PdfPageNumber />
      <SectionHeader>Risk Dimension Scores</SectionHeader>

      {/* Table header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.tableCellHeader, { width: '35%' }]}>Dimension</Text>
        <Text style={[styles.tableCellHeader, { width: '12%', textAlign: 'right' }]}>Weight</Text>
        <Text style={[styles.tableCellHeader, { width: '13%', textAlign: 'right' }]}>Raw</Text>
        <Text style={[styles.tableCellHeader, { width: '13%', textAlign: 'right' }]}>Final</Text>
        <Text style={[styles.tableCellHeader, { width: '27%' }]}>Notes</Text>
      </View>

      {scores.map((score) => (
        <View key={score.dimension} style={styles.tableRow}>
          <Text style={[styles.tableCell, { width: '35%' }]}>{score.label}</Text>
          <Text style={[styles.tableCell, { width: '12%', textAlign: 'right', color: SECONDARY }]}>{score.weight}%</Text>
          <Text style={[styles.tableCell, { width: '13%', textAlign: 'right' }]}>{score.rawScore}</Text>
          <Text style={[styles.tableCell, { width: '13%', textAlign: 'right', fontFamily: score.isOverridden ? 'Helvetica-Bold' : 'Helvetica', color: score.isOverridden ? PURPLE : BODY }]}>{score.finalScore}</Text>
          <Text style={[styles.tableCell, { width: '27%', color: SECONDARY, fontSize: 8 }]}>{score.isOverridden ? 'Manually adjusted' : ''}</Text>
        </View>
      ))}

      {/* Overall */}
      <View style={[styles.tableRow, { backgroundColor: '#F4F3F8', borderTopWidth: 1, borderTopColor: PURPLE }]}>
        <Text style={[styles.tableCell, { width: '35%', fontFamily: 'Helvetica-Bold' }]}>Overall weighted score</Text>
        <Text style={[styles.tableCell, { width: '12%' }]} />
        <Text style={[styles.tableCell, { width: '13%' }]} />
        <Text style={[styles.tableCell, { width: '13%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{assessment.overallScore}</Text>
        <View style={[styles.tierBadge, { width: '27%', backgroundColor: TIER_BG[assessment.riskTier] ?? '#F4F3F8', paddingVertical: 2, paddingHorizontal: 4 }]}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: TIER_TEXT[assessment.riskTier] ?? BODY }}>
            {assessment.riskTier}
          </Text>
        </View>
      </View>

      {/* Override notes */}
      {scores.some(s => s.isOverridden && s.overrideReason) && (
        <>
          <SectionHeader>Score Adjustment Notes</SectionHeader>
          {scores.filter(s => s.isOverridden && s.overrideReason).map(s => (
            <View key={s.dimension} style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BODY, marginBottom: 2 }}>
                {s.label}
              </Text>
              <Text style={{ fontSize: 9, color: SECONDARY }}>{s.overrideReason}</Text>
            </View>
          ))}
        </>
      )}
    </Page>
  )
}

function DoraPage({ data }: { data: AssessmentPdfData }) {
  const { dora } = data
  if (!dora) {
    return (
      <Page size="A4" style={styles.page}>
        <PdfPageNumber />
        <SectionHeader>DORA / FCA Classification</SectionHeader>
        <Text style={{ color: SECONDARY, fontSize: 10 }}>Classification not yet completed.</Text>
      </Page>
    )
  }

  const clsBg = dora.classification === 'CRITICAL' ? '#FCEBEB' : dora.classification === 'IMPORTANT' ? '#FAEEDA' : '#EAF3DE'
  const clsText = dora.classification === 'CRITICAL' ? '#791F1F' : dora.classification === 'IMPORTANT' ? '#633806' : '#27500A'

  const answers = [
    { label: 'Service type', value: dora.serviceType },
    { label: 'Processes personal data', value: dora.processesPersonalData ? 'Yes' : 'No' },
    { label: 'Unavailability impacts operations >2 hrs', value: dora.lossImpactOver2hrs ? 'Yes' : 'No' },
    { label: 'Readily available substitute exists', value: dora.substituteAvailable ? 'Yes' : 'No' },
    { label: 'Supports directly regulated activity', value: dora.regulatedActivitySubstitute ? 'Yes' : 'No' },
  ]

  return (
    <Page size="A4" style={styles.page}>
      <PdfPageNumber />
      <SectionHeader>DORA / FCA Classification</SectionHeader>

      {/* Classification badge */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <View style={[styles.tierBadge, { backgroundColor: clsBg }]}>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: clsText }}>{dora.classification}</Text>
        </View>
        {dora.isOverridden && (
          <Text style={{ fontSize: 8, color: SECONDARY }}>(Manually adjusted)</Text>
        )}
      </View>

      <SectionHeader>Justification</SectionHeader>
      <Text style={{ fontSize: 10, color: BODY, lineHeight: 1.6, marginBottom: 12 }}>
        {dora.classificationJustification}
      </Text>

      <SectionHeader>Classification Basis</SectionHeader>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableCellHeader, { width: '70%' }]}>Question</Text>
        <Text style={[styles.tableCellHeader, { width: '30%' }]}>Answer</Text>
      </View>
      {answers.map((a) => (
        <View key={a.label} style={styles.tableRow}>
          <Text style={[styles.tableCell, { width: '70%' }]}>{a.label}</Text>
          <Text style={[styles.tableCell, { width: '30%', fontFamily: 'Helvetica-Bold' }]}>{a.value}</Text>
        </View>
      ))}

      {dora.isOverridden && dora.overrideReason && (
        <>
          <SectionHeader>Override Reason</SectionHeader>
          <Text style={{ fontSize: 10, color: BODY }}>{dora.overrideReason}</Text>
        </>
      )}

      <SectionHeader>Article References</SectionHeader>
      <Text style={{ fontSize: 9, color: SECONDARY, lineHeight: 1.5 }}>
        DORA Article 28 — ICT third-party risk management{'\n'}
        DORA Article 29 — Key contractual provisions{'\n'}
        FCA SS2/21 — Outsourcing and third-party risk management{'\n'}
        FCA SYSC 8 — Outsourcing rules
      </Text>
    </Page>
  )
}

function TrustCertsPage({ data }: { data: AssessmentPdfData }) {
  const { certifications } = data
  const autoCerts = certifications.filter(c => c.sourceType !== 'MANUAL')
  const manualCerts = certifications.filter(c => c.sourceType === 'MANUAL')

  return (
    <Page size="A4" style={styles.page}>
      <PdfPageNumber />
      <SectionHeader>Trust &amp; Certifications</SectionHeader>

      <SectionHeader>Portal Check Results</SectionHeader>
      {autoCerts.length === 0 ? (
        <Text style={{ fontSize: 10, color: SECONDARY, marginBottom: 8 }}>No certifications identified via trust portals.</Text>
      ) : (
        <>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCellHeader, { width: '30%' }]}>Certification</Text>
            <Text style={[styles.tableCellHeader, { width: '30%' }]}>Source</Text>
            <Text style={[styles.tableCellHeader, { width: '25%' }]}>Issuing body</Text>
            <Text style={[styles.tableCellHeader, { width: '15%' }]}>Expiry</Text>
          </View>
          {autoCerts.map((c, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '30%' }]}>{CERT_LABELS[c.certType] ?? c.certType}</Text>
              <Text style={[styles.tableCell, { width: '30%', color: SECONDARY }]}>{SOURCE_LABELS[c.sourceType] ?? c.sourceType}</Text>
              <Text style={[styles.tableCell, { width: '25%', color: SECONDARY }]}>{c.issuingBody ?? '—'}</Text>
              <Text style={[styles.tableCell, { width: '15%', color: isExpired(c.expiryDate) ? '#791F1F' : isExpiringWithin90Days(c.expiryDate) ? '#BA7517' : BODY }]}>
                {c.expiryDate ? new Date(c.expiryDate).toLocaleDateString('en-GB') : '—'}
              </Text>
            </View>
          ))}
        </>
      )}

      {manualCerts.length > 0 && (
        <>
          <SectionHeader>Manually Added Certifications</SectionHeader>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCellHeader, { width: '28%' }]}>Certification</Text>
            <Text style={[styles.tableCellHeader, { width: '25%' }]}>Issuing body</Text>
            <Text style={[styles.tableCellHeader, { width: '15%' }]}>Expiry</Text>
            <Text style={[styles.tableCellHeader, { width: '32%' }]}>Notes</Text>
          </View>
          {manualCerts.map((c, i) => {
            const expired = isExpired(c.expiryDate)
            const expiring = isExpiringWithin90Days(c.expiryDate)
            return (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: '28%' }]}>{CERT_LABELS[c.certType] ?? c.certType}</Text>
                <Text style={[styles.tableCell, { width: '25%', color: SECONDARY }]}>{c.issuingBody ?? '—'}</Text>
                <Text style={[styles.tableCell, { width: '15%', color: expired ? '#791F1F' : expiring ? '#BA7517' : BODY }]}>
                  {c.expiryDate ? new Date(c.expiryDate).toLocaleDateString('en-GB') : '—'}
                  {expired ? ' ⚠ Expired' : expiring ? ' ⚠ Expiring' : ''}
                </Text>
                <Text style={[styles.tableCell, { width: '32%', color: SECONDARY, fontSize: 8 }]}>{c.notes ?? '—'}</Text>
              </View>
            )
          })}
        </>
      )}
    </Page>
  )
}

function ContractPage({ data }: { data: AssessmentPdfData }) {
  const { contractDetails } = data
  if (!contractDetails || !Object.values(contractDetails).some(v => v)) return null

  const fields: { key: keyof PdfContractData; label: string }[] = [
    { key: 'slaUptime', label: 'SLA uptime commitment' },
    { key: 'rto', label: 'RTO — Recovery Time Objective' },
    { key: 'rpo', label: 'RPO — Recovery Point Objective' },
    { key: 'contractExpiry', label: 'Contract expiry date' },
    { key: 'nextReviewDate', label: 'Next scheduled review date' },
    { key: 'accountManagerName', label: 'Account manager name' },
    { key: 'accountManagerEmail', label: 'Account manager email' },
    { key: 'notes', label: 'Notes' },
  ]

  const filledFields = fields.filter(f => contractDetails[f.key])

  return (
    <Page size="A4" style={styles.page}>
      <PdfPageNumber />
      <SectionHeader>Contract &amp; SLA</SectionHeader>
      {filledFields.map(({ key, label }) => (
        <View key={key} style={{ marginBottom: 10 }}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{contractDetails[key]}</Text>
        </View>
      ))}
    </Page>
  )
}

function AuditPage({ data }: { data: AssessmentPdfData }) {
  const { auditEntries } = data

  return (
    <Page size="A4" style={styles.page}>
      <PdfPageNumber />
      <SectionHeader>Audit Trail</SectionHeader>

      <View style={styles.tableHeader}>
        <Text style={[styles.tableCellHeader, { width: '22%' }]}>Timestamp</Text>
        <Text style={[styles.tableCellHeader, { width: '28%' }]}>Action</Text>
        <Text style={[styles.tableCellHeader, { width: '30%' }]}>Detail</Text>
        <Text style={[styles.tableCellHeader, { width: '20%' }]}>Performed by</Text>
      </View>

      {auditEntries.map((entry, i) => {
        const desc = buildAuditDesc(entry)
        const performer = entry.userDisplayName ?? entry.userEmail ?? 'System'
        const label = ACTION_LABELS[entry.actionType] ?? entry.actionType
        return (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.tableCell, { width: '22%', fontSize: 8, color: SECONDARY }]}>
              {new Date(entry.createdAt).toLocaleString('en-GB')}
            </Text>
            <Text style={[styles.tableCell, { width: '28%', fontSize: 9 }]}>{label}</Text>
            <Text style={[styles.tableCell, { width: '30%', fontSize: 8, color: SECONDARY }]}>{desc}</Text>
            <Text style={[styles.tableCell, { width: '20%', fontSize: 8, color: SECONDARY }]}>{performer}</Text>
          </View>
        )
      })}
    </Page>
  )
}

function FooterPage({ data }: { data: AssessmentPdfData }) {
  const { assessment, orgName } = data

  return (
    <Page size="A4" style={styles.page}>
      <PdfPageNumber />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <PdfSeal size={80} />
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10, marginTop: 8, letterSpacing: 2, color: PURPLE }}>
          FIDES
        </Text>
        <Text style={{ fontSize: 9, color: SECONDARY, textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
          This report was generated by Fides, an AI-assisted vendor risk assessment platform.
        </Text>
        <Text style={{ fontSize: 9, color: SECONDARY, textAlign: 'center', marginTop: 12, lineHeight: 1.6 }}>
          Data sources: Companies House · GLEIF · OFSI · OFAC · EU sanctions · NCSC · NewsAPI · Have I Been Pwned
        </Text>
        <View style={{ marginTop: 20, borderTopWidth: 0.5, borderTopColor: '#E2DFF0', paddingTop: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 8, color: '#B8B3CE' }}>Assessment ID: {assessment.id}</Text>
          <Text style={{ fontSize: 8, color: '#B8B3CE', marginTop: 2 }}>
            Generated: {new Date().toLocaleString('en-GB')} · Prepared for {orgName}
          </Text>
        </View>
      </View>
    </Page>
  )
}

// ── Document ──────────────────────────────────────────────────────────────────

export default function AssessmentReport({ data }: { data: AssessmentPdfData }) {
  const hasContract = data.contractDetails &&
    Object.values(data.contractDetails).some(v => v)
  const hasAudit = data.auditEntries.length > 0

  return (
    <Document
      title={`Vendor Risk Assessment — ${data.assessment.vendorName}`}
      author={data.orgName}
      subject="Vendor Risk Assessment Report"
      creator="Fides"
    >
      <CoverPage data={data} />
      <ExecutiveSummaryPage data={data} />
      <ScoresPage data={data} />
      <DoraPage data={data} />
      <TrustCertsPage data={data} />
      {hasContract && <ContractPage data={data} />}
      {hasAudit && <AuditPage data={data} />}
      <FooterPage data={data} />
    </Document>
  )
}
