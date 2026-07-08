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
  suggestedBand: string | null
  confirmedBand: string | null
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
    overallBand: string | null
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
  BAND_CONFIRMED: 'Band confirmed',
  CLASSIFICATION_CONFIRMED: 'DORA classification confirmed',
  CLASSIFICATION_OVERRIDDEN: 'DORA classification overridden',
  CERT_ADDED: 'Certification added',
  CERT_DELETED: 'Certification removed',
  QUESTIONNAIRE_TRIGGERED: 'Questionnaire generated',
  REASSESSMENT_SCHEDULED: 'Reassessment scheduled',
  ASSESSMENT_DELETED: 'Assessment deleted',
}

// Band colours (PDF-safe solid colours only — no rgba/opacity)
const BAND_BG: Record<string, string> = {
  'High':         '#EAF3DE',
  'Medium':       '#FAEEDA',
  'Low':          '#FCEBEB',
  'Needs review': '#EEEDFE',
  'Not assessed': '#F4F3F8',
}

const BAND_TEXT: Record<string, string> = {
  'High':         '#27500A',
  'Medium':       '#633806',
  'Low':          '#791F1F',
  'Needs review': '#3C3489',
  'Not assessed': '#5B5478',
}

function bandBg(band: string | null): string {
  return BAND_BG[band ?? 'Not assessed'] ?? '#F4F3F8'
}

function bandText(band: string | null): string {
  return BAND_TEXT[band ?? 'Not assessed'] ?? '#5B5478'
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
  bandBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
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

function BandBadge({ band }: { band: string | null }) {
  const display = band ?? 'Not assessed'
  return (
    <View style={[styles.bandBadge, { backgroundColor: bandBg(band) }]}>
      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: bandText(band) }}>
        {display}
      </Text>
    </View>
  )
}

function PdfSeal({ size = 100 }: { size?: number }) {
  const scale = size / 100
  const subFontSize = Math.max(5, Math.round(7 * scale))
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size, position: 'relative' }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Circle cx={50} cy={50} r={50} stroke={PURPLE} strokeWidth={1.5} fill="none" strokeOpacity={0.45} />
          <Circle cx={50} cy={50} r={38} stroke={PURPLE} strokeWidth={1} fill="none" strokeOpacity={0.3} />
        </Svg>
        <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: 'Times-Roman', fontSize: Math.round(38 * scale), color: PURPLE, lineHeight: 1 }}>F</Text>
          <Text style={{ fontSize: subFontSize, color: PURPLE, letterSpacing: 2, marginTop: 2 }}>FIDES</Text>
        </View>
      </View>
      <Text style={{ fontSize: subFontSize, color: PURPLE, letterSpacing: 1.5, opacity: 0.8, marginTop: 3, textAlign: 'center' }}>
        VENDOR ASSESSMENT
      </Text>
      <Text style={{ fontSize: subFontSize, color: PURPLE, letterSpacing: 1.5, opacity: 0.65, marginTop: 1, textAlign: 'center' }}>
        TRUST & COMPLIANCE
      </Text>
    </View>
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
  if (entry.actionType === 'BAND_CONFIRMED') {
    const dim = (newVal?.dimension as string) ?? ''
    const band = (newVal?.confirmedBand as string) ?? ''
    return [dim.replace(/_/g, ' ').toLowerCase(), band].filter(Boolean).join(' · ')
  }
  if (entry.actionType === 'CERT_ADDED') {
    return ((newVal?.certType as string) ?? '').replace(/_/g, ' ')
  }
  return entry.reason ?? ''
}

// Cert label — for OTHER certs, use notes as the display name (matches app UI)
function certLabel(cert: PdfCert): string {
  if (cert.certType !== 'OTHER') return CERT_LABELS[cert.certType] ?? cert.certType
  return cert.notes ?? 'Other certification'
}

// Cert category — mirrors DimensionCard.getCertCategory
function certCategory(cert: PdfCert): 'security' | 'regulatory' | 'other' {
  if (cert.certType !== 'OTHER') return 'security'
  const label = (cert.notes ?? '').toUpperCase()
  if (/\bDORA\b/.test(label) || /\bGDPR\b/.test(label) || /\bCCPA\b/.test(label)) return 'regulatory'
  if (/EU.US DPF|UK.DPF|SWISS.US DPF|\bCBPR\b|\bPRP\b/.test(label)) return 'regulatory'
  if (/NIST\s*CSF/.test(label)) return 'other'
  return 'security'
}

// ── Pages ─────────────────────────────────────────────────────────────────────

function CoverPage({ data }: { data: AssessmentPdfData }) {
  const { assessment, orgName, assessorName } = data
  const overallBand = assessment.overallBand

  return (
    <Page size="A4" style={styles.page}>
      <PdfPageNumber />
      <View style={{ alignItems: 'center', marginTop: 60, marginBottom: 32 }}>
        <PdfSeal size={120} />
      </View>

      <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 2, color: BODY, textAlign: 'center', marginBottom: 8 }}>
        Vendor Trust Assessment Report
      </Text>

      <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: BODY, textAlign: 'center', marginBottom: 24 }}>
        {assessment.vendorName}
      </Text>

      <View style={{ backgroundColor: '#F9F8FD', borderRadius: 4, padding: 16, marginBottom: 20, marginHorizontal: 40 }}>
        <MetaRow label="Assessment date" value={fmtDate(assessment.createdAt)} />
        <MetaRow label="Assessed by" value={assessorName ?? 'Unknown'} />
        <MetaRow label="Organisation" value={orgName} />
        {assessment.companiesHouseNumber && (
          <MetaRow label="Companies House no." value={assessment.companiesHouseNumber} />
        )}
      </View>

      {/* Overall trust band */}
      <View style={{ alignItems: 'center', marginBottom: 24 }}>
        <Text style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, color: SECONDARY, marginBottom: 6 }}>
          Overall trust
        </Text>
        <View style={[styles.bandBadge, { backgroundColor: bandBg(overallBand), paddingHorizontal: 16, paddingVertical: 8 }]}>
          <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: bandText(overallBand) }}>
            {overallBand ?? 'Not assessed'}
          </Text>
        </View>
      </View>

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

function BandsPage({ data }: { data: AssessmentPdfData }) {
  const { scores, assessment } = data
  const isBandMode = scores.some(s => s.suggestedBand != null)

  return (
    <Page size="A4" style={styles.page}>
      <PdfPageNumber />
      <SectionHeader>Trust Band Assessment</SectionHeader>

      {/* Overall band summary */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 }}>
        <Text style={{ fontSize: 10, color: SECONDARY }}>Overall trust:</Text>
        <BandBadge band={assessment.overallBand} />
      </View>

      {isBandMode ? (
        <>
          {/* Band table */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCellHeader, { width: '32%' }]}>Dimension</Text>
            <Text style={[styles.tableCellHeader, { width: '24%' }]}>Fides suggested</Text>
            <Text style={[styles.tableCellHeader, { width: '24%' }]}>Analyst confirmed</Text>
            <Text style={[styles.tableCellHeader, { width: '20%' }]}>Notes</Text>
          </View>

          {scores.map((score) => {
            const displayBand = score.confirmedBand ?? score.suggestedBand
            const isAnalystSet = score.confirmedBand != null
            return (
              <View key={score.dimension} style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: '32%' }]}>{score.label}</Text>
                <View style={{ width: '24%' }}>
                  {score.suggestedBand ? (
                    <BandBadge band={score.suggestedBand} />
                  ) : (
                    <Text style={[styles.tableCell, { color: SECONDARY }]}>—</Text>
                  )}
                </View>
                <View style={{ width: '24%' }}>
                  {isAnalystSet ? (
                    <BandBadge band={score.confirmedBand} />
                  ) : (
                    <Text style={[styles.tableCell, { color: SECONDARY, fontSize: 8 }]}>
                      {displayBand ?? '—'}
                    </Text>
                  )}
                </View>
                <Text style={[styles.tableCell, { width: '20%', color: SECONDARY, fontSize: 8 }]}>
                  {score.overrideReason ?? (isAnalystSet && score.confirmedBand !== score.suggestedBand ? 'Analyst override' : '')}
                </Text>
              </View>
            )
          })}

          {/* Analyst notes */}
          {scores.some(s => s.isOverridden && s.overrideReason) && (
            <>
              <SectionHeader>Analyst Notes</SectionHeader>
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
        </>
      ) : (
        <Text style={{ fontSize: 10, color: SECONDARY }}>
          Trust band assessment not yet completed for this assessment.
        </Text>
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

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <View style={[styles.bandBadge, { backgroundColor: clsBg }]}>
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

function CertGroup({ title, certs, isManual }: { title: string; certs: PdfCert[]; isManual?: boolean }) {
  if (certs.length === 0) return null
  return (
    <>
      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BODY, marginTop: 10, marginBottom: 4 }}>{title}</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableCellHeader, { width: '32%' }]}>Certification</Text>
        {!isManual && <Text style={[styles.tableCellHeader, { width: '25%' }]}>Source</Text>}
        <Text style={[styles.tableCellHeader, { width: isManual ? '28%' : '23%' }]}>Issuing body</Text>
        <Text style={[styles.tableCellHeader, { width: '15%' }]}>Expiry</Text>
        {isManual && <Text style={[styles.tableCellHeader, { width: '25%' }]}>Notes</Text>}
      </View>
      {certs.map((c, i) => {
        const expired = isExpired(c.expiryDate)
        const expiring = isExpiringWithin90Days(c.expiryDate)
        return (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.tableCell, { width: '32%' }]}>{certLabel(c)}</Text>
            {!isManual && (
              <Text style={[styles.tableCell, { width: '25%', color: SECONDARY, fontSize: 8 }]}>
                {SOURCE_LABELS[c.sourceType] ?? c.sourceType}
              </Text>
            )}
            <Text style={[styles.tableCell, { width: isManual ? '28%' : '23%', color: SECONDARY }]}>
              {c.issuingBody ?? '—'}
            </Text>
            <Text style={[styles.tableCell, { width: '15%', color: expired ? '#791F1F' : expiring ? '#BA7517' : BODY, fontSize: 8 }]}>
              {c.expiryDate ? new Date(c.expiryDate).toLocaleDateString('en-GB') : '—'}
            </Text>
            {isManual && (
              <Text style={[styles.tableCell, { width: '25%', color: SECONDARY, fontSize: 8 }]}>
                {c.notes ?? '—'}
              </Text>
            )}
          </View>
        )
      })}
    </>
  )
}

function TrustCertsPage({ data }: { data: AssessmentPdfData }) {
  const { certifications } = data

  const autoCerts = certifications.filter(c => c.sourceType !== 'MANUAL')
  const manualCerts = certifications.filter(c => c.sourceType === 'MANUAL')

  const securityCerts = autoCerts.filter(c => certCategory(c) === 'security')
  const regulatoryCerts = autoCerts.filter(c => certCategory(c) === 'regulatory')
  const otherCerts = autoCerts.filter(c => certCategory(c) === 'other')

  return (
    <Page size="A4" style={styles.page}>
      <PdfPageNumber />
      <SectionHeader>Trust &amp; Certifications</SectionHeader>

      {autoCerts.length === 0 && manualCerts.length === 0 ? (
        <Text style={{ fontSize: 10, color: SECONDARY }}>No certifications on record for this assessment.</Text>
      ) : (
        <>
          {autoCerts.length === 0 ? (
            <Text style={{ fontSize: 10, color: SECONDARY, marginBottom: 8 }}>No certifications identified via automated checks.</Text>
          ) : (
            <>
              <Text style={{ fontSize: 9, color: SECONDARY, marginBottom: 6 }}>
                Auto-discovered — unverified. Confirm against actual reports before relying on these.
              </Text>
              <CertGroup title="Security certifications" certs={securityCerts} />
              <CertGroup title="Regulatory & privacy frameworks" certs={regulatoryCerts} />
              <CertGroup title="Other frameworks" certs={otherCerts} />
            </>
          )}

          {manualCerts.length > 0 && (
            <CertGroup title="Manually added certifications" certs={manualCerts} isManual />
          )}
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
        <Text style={{ fontSize: 9, color: SECONDARY, textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
          This report was generated by Fides, an AI-assisted vendor trust assessment platform.
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
      title={`Vendor Trust Assessment — ${data.assessment.vendorName}`}
      author={data.orgName}
      subject="Vendor Trust Assessment Report"
      creator="Fides"
    >
      <CoverPage data={data} />
      <ExecutiveSummaryPage data={data} />
      <BandsPage data={data} />
      <DoraPage data={data} />
      <TrustCertsPage data={data} />
      {hasContract && <ContractPage data={data} />}
      {hasAudit && <AuditPage data={data} />}
      <FooterPage data={data} />
    </Document>
  )
}
