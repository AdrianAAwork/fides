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

export interface QuestionItem {
  number: string
  questionText: string
  prefillNote?: string
}

export interface QuestionnaireSection {
  title: string
  questions: QuestionItem[]
}

export interface QuestionnairePdfData {
  vendorName: string
  orgName: string
  assessmentId: string
  generatedDate: string   // ISO date string
  sections: QuestionnaireSection[]
}

// ── Styles ────────────────────────────────────────────────────────────────────

const PURPLE = '#5B3FD4'
const BODY = '#1A1625'
const SECONDARY = '#8B85A8'

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: BODY,
    lineHeight: 1.5,
  },
  sectionHeader: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: PURPLE,
    marginTop: 16,
    marginBottom: 3,
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: PURPLE,
    marginBottom: 10,
  },
  questionDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#E2DFF0',
    marginTop: 10,
    marginBottom: 10,
  },
  pageFooter: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})

function PdfSeal({ size = 20 }: { size?: number }) {
  const cx = size / 2
  const cy = size / 2
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={cx} cy={cy} r={size * 0.46} stroke={PURPLE} strokeWidth={1} fill="none" strokeOpacity={0.5} />
      <Circle cx={cx} cy={cy} r={size * 0.3} stroke={PURPLE} strokeWidth={0.5} fill="none" strokeOpacity={0.3} />
    </Svg>
  )
}

function PageFooter({ orgName, assessmentId }: { orgName: string; assessmentId: string }) {
  return (
    <View style={styles.pageFooter} fixed>
      <PdfSeal size={18} />
      <Text style={{ fontSize: 7, color: SECONDARY }}>
        Assessment ID: {assessmentId} · Confidential — {orgName}
      </Text>
      <Text
        style={{ fontSize: 7, color: SECONDARY }}
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
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

// ── Document ──────────────────────────────────────────────────────────────────

export default function Questionnaire({ data }: { data: QuestionnairePdfData }) {
  const { vendorName, orgName, assessmentId, generatedDate, sections } = data

  return (
    <Document
      title={`Third-Party Security Questionnaire — ${vendorName}`}
      author={orgName}
      creator="Fides"
    >
      {/* Cover page */}
      <Page size="A4" style={styles.page}>
        <PageFooter orgName={orgName} assessmentId={assessmentId} />

        {/* Seal centred */}
        <View style={{ alignItems: 'center', marginTop: 50, marginBottom: 24 }}>
          <Svg width={80} height={80} viewBox="0 0 80 80">
            <Circle cx={40} cy={40} r={36} stroke={PURPLE} strokeWidth={1.5} fill="none" strokeOpacity={0.45} />
            <Circle cx={40} cy={40} r={26} stroke={PURPLE} strokeWidth={1} fill="none" strokeOpacity={0.3} />
          </Svg>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, marginTop: 6, letterSpacing: 2, color: PURPLE }}>FIDES</Text>
        </View>

        {/* Title */}
        <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 2, color: BODY, textAlign: 'center', marginBottom: 6 }}>
          Third-Party Security Questionnaire
        </Text>

        {/* Addressed to */}
        <Text style={{ fontSize: 12, color: BODY, textAlign: 'center', marginBottom: 28 }}>
          Addressed to: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{vendorName}</Text>
        </Text>

        {/* Meta box */}
        <View style={{ backgroundColor: '#F9F8FD', borderRadius: 4, padding: 16, marginHorizontal: 30, marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={{ width: '40%', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.8, color: SECONDARY }}>Prepared by</Text>
            <Text style={{ width: '60%', fontSize: 10 }}>{orgName}</Text>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={{ width: '40%', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.8, color: SECONDARY }}>Date</Text>
            <Text style={{ width: '60%', fontSize: 10 }}>{new Date(generatedDate).toLocaleDateString('en-GB')}</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ width: '40%', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.8, color: SECONDARY }}>Reference</Text>
            <Text style={{ width: '60%', fontSize: 9, color: SECONDARY }}>Assessment ID {assessmentId}</Text>
          </View>
        </View>

        {/* Instructions */}
        <View style={{ borderLeftWidth: 3, borderLeftColor: PURPLE, paddingLeft: 10, paddingVertical: 6, marginHorizontal: 20 }}>
          <Text style={{ fontSize: 9, color: BODY, lineHeight: 1.6 }}>
            Please complete all sections and return within 14 days. Where questions are pre-populated with information from our records, please confirm or correct as appropriate. All responses will be treated in confidence and used solely for the purposes of third-party risk management.
          </Text>
        </View>
      </Page>

      {/* Questions pages */}
      <Page size="A4" style={styles.page}>
        <PageFooter orgName={orgName} assessmentId={assessmentId} />

        {sections.map((section, si) => (
          <View key={si}>
            <SectionHeader>{`Section ${si + 1} — ${section.title}`}</SectionHeader>

            {section.questions.map((q, qi) => (
              <View key={qi} wrap={false}>
                {/* Question text */}
                <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10, width: 28, color: PURPLE }}>
                    {q.number}.
                  </Text>
                  <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10, flex: 1, color: BODY, lineHeight: 1.5 }}>
                    {q.questionText}
                  </Text>
                </View>

                {/* Pre-fill context note */}
                {q.prefillNote && (
                  <View style={{ marginLeft: 28, marginBottom: 4 }}>
                    <Text style={{ fontFamily: 'Helvetica-Oblique', fontSize: 9, color: SECONDARY, lineHeight: 1.5 }}>
                      {q.prefillNote}
                    </Text>
                  </View>
                )}

                {/* Response area */}
                <View style={{ marginLeft: 28, marginTop: 2 }}>
                  <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, color: SECONDARY, marginBottom: 4 }}>
                    Response:
                  </Text>
                  {/* 6 blank lines */}
                  {[...Array(6)].map((_, li) => (
                    <View key={li} style={{ borderBottomWidth: 0.5, borderBottomColor: '#E2DFF0', marginBottom: 9 }} />
                  ))}
                </View>

                <View style={styles.questionDivider} />
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  )
}
