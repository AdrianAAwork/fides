import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  smallint,
  timestamp,
  date,
  jsonb,
  unique,
  index,
} from 'drizzle-orm/pg-core'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const accountType = pgEnum('account_type', ['SOLO', 'ORGANISATION'])

export const inviteStatus = pgEnum('invite_status', [
  'PENDING',
  'ACCEPTED',
  'EXPIRED',
  'PENDING_UPGRADE',
])

export const roleType = pgEnum('role_type', ['VIEWER', 'ANALYST', 'ADMIN'])

export const assessmentStatusType = pgEnum('assessment_status_type', [
  'DRAFT',
  'COMPLETE',
])

export const riskTierType = pgEnum('risk_tier_type', [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
])

export const dimensionType = pgEnum('dimension_type', [
  'FINANCIAL_HEALTH',
  'BREACH_HISTORY',
  'SANCTIONS',
  'OWNERSHIP',
  'TRUST_CERTS',
  'NEWS_SENTIMENT',
])

export const certTypeType = pgEnum('cert_type_type', [
  'SOC2_TYPE_I',
  'SOC2_TYPE_II',
  'ISO_27001',
  'ISO_22301',
  'ISO_27701',
  'CYBER_ESSENTIALS',
  'CYBER_ESSENTIALS_PLUS',
  'PCI_DSS',
  'CSA_STAR',
  'OTHER',
])

export const certSourceType = pgEnum('cert_source_type', [
  'AUTO_VANTA',
  'AUTO_SAFEBASE',
  'AUTO_WEB',
  'MANUAL',
])

export const doraClassificationType = pgEnum('dora_classification_type', [
  'CRITICAL',
  'IMPORTANT',
  'STANDARD',
])

export const auditActionType = pgEnum('audit_action_type', [
  'ASSESSMENT_CREATED',
  'SCORE_OVERRIDDEN',
  'CLASSIFICATION_CONFIRMED',
  'CLASSIFICATION_OVERRIDDEN',
  'CERT_ADDED',
  'CERT_DELETED',
  'QUESTIONNAIRE_TRIGGERED',
  'REASSESSMENT_SCHEDULED',
  'ASSESSMENT_DELETED',
])

export const questionnaireStatusType = pgEnum('questionnaire_status_type', [
  'PENDING',
  'DISPATCHED',
  'RESPONDED',
  'CLOSED',
])

export const reassessmentTriggerType = pgEnum('reassessment_trigger_type', [
  'ANNUAL',
  'BREACH_DETECTED',
  'CERT_EXPIRING',
  'MANUAL',
])

export const certAlertType = pgEnum('cert_alert_type', [
  'EXPIRING_SOON',
  'EXPIRED',
  'STALE',
])

export const sanctionSource = pgEnum('sanction_source', ['OFSI', 'OFAC', 'EU'])

export const sanctionType = pgEnum('sanction_type', ['individual', 'entity'])

// ─── Tables ───────────────────────────────────────────────────────────────────

// 1. organisations
export const organisations = pgTable('organisations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  accountType: accountType('account_type').notNull().default('SOLO'),
  logoUrl: varchar('logo_url', { length: 500 }),
  brandColor: varchar('brand_color', { length: 7 }),
  memberLimit: smallint('member_limit').notNull().default(5),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// 2. users
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  auth0Id: varchar('auth0_id', { length: 128 }).notNull().unique(),
  orgId: uuid('org_id').notNull().references(() => organisations.id),
  email: varchar('email', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  role: roleType('role').notNull().default('ANALYST'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// 3. assessments
export const assessments = pgTable('assessments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organisations.id),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  previousAssessmentId: uuid('previous_assessment_id'),
  vendorName: varchar('vendor_name', { length: 255 }).notNull(),
  companiesHouseNumber: varchar('companies_house_number', { length: 20 }),
  lei: varchar('lei', { length: 20 }),
  sicCode: varchar('sic_code', { length: 10 }),
  jurisdiction: varchar('jurisdiction', { length: 100 }),
  incorporationDate: date('incorporation_date'),
  companyStatus: varchar('company_status', { length: 50 }),
  assessmentStatus: assessmentStatusType('assessment_status').notNull().default('DRAFT'),
  riskTier: riskTierType('risk_tier'),
  riskTierOverride: boolean('risk_tier_override').notNull().default(false),
  riskTierOverrideReason: text('risk_tier_override_reason'),
  overallScore: smallint('overall_score'),
  execSummaryJson: jsonb('exec_summary_json'),
  contractDetails: jsonb('contract_details'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// 4. assessment_scores
export const assessmentScores = pgTable('assessment_scores', {
  id: uuid('id').defaultRandom().primaryKey(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id),
  orgId: uuid('org_id').notNull().references(() => organisations.id),
  dimension: dimensionType('dimension').notNull(),
  rawScore: smallint('raw_score').notNull(),
  finalScore: smallint('final_score').notNull(),
  isOverridden: boolean('is_overridden').notNull().default(false),
  overrideReason: text('override_reason'),
  overriddenBy: uuid('overridden_by').references(() => users.id),
  overriddenAt: timestamp('overridden_at', { withTimezone: true }),
  sourceData: jsonb('source_data'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueAssessmentDimension: unique().on(table.assessmentId, table.dimension),
}))

// 5. certifications
export const certifications = pgTable('certifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id),
  orgId: uuid('org_id').notNull().references(() => organisations.id),
  certType: certTypeType('cert_type').notNull(),
  issuingBody: varchar('issuing_body', { length: 255 }),
  auditPeriodStart: date('audit_period_start'),
  auditPeriodEnd: date('audit_period_end'),
  expiryDate: date('expiry_date'),
  sourceType: certSourceType('source_type').notNull(),
  sourceUrl: text('source_url'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  verifiedBy: uuid('verified_by').references(() => users.id),
  retrievedAt: timestamp('retrieved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// 6. dora_classification
export const doraClassification = pgTable('dora_classification', {
  id: uuid('id').defaultRandom().primaryKey(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id).unique(),
  orgId: uuid('org_id').notNull().references(() => organisations.id),
  serviceType: varchar('service_type', { length: 100 }).notNull(),
  processesPersonalData: boolean('processes_personal_data').notNull(),
  lossImpactOver2hrs: boolean('loss_impact_over_2hrs').notNull(),
  substituteAvailable: boolean('substitute_available').notNull(),
  regulatedActivitySubstitute: boolean('regulated_activity_substitute').notNull(),
  classification: doraClassificationType('classification').notNull(),
  classificationJustification: text('classification_justification').notNull(),
  isOverridden: boolean('is_overridden').notNull().default(false),
  overrideReason: text('override_reason'),
  overriddenBy: uuid('overridden_by').references(() => users.id),
  overriddenAt: timestamp('overridden_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// 7. audit_log — INSERT ONLY, never update or delete
export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id),
  orgId: uuid('org_id').notNull().references(() => organisations.id),
  userId: uuid('user_id').references(() => users.id),
  actionType: auditActionType('action_type').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// 8. questionnaires
export const questionnaires = pgTable('questionnaires', {
  id: uuid('id').defaultRandom().primaryKey(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id),
  orgId: uuid('org_id').notNull().references(() => organisations.id),
  status: questionnaireStatusType('status').notNull().default('PENDING'),
  triggerReasons: jsonb('trigger_reasons').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// 9. reassessment_schedule
export const reassessmentSchedule = pgTable('reassessment_schedule', {
  id: uuid('id').defaultRandom().primaryKey(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id),
  orgId: uuid('org_id').notNull().references(() => organisations.id),
  scheduledDate: date('scheduled_date').notNull(),
  triggerType: reassessmentTriggerType('trigger_type').notNull(),
  isComplete: boolean('is_complete').notNull().default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// 10. rate_limits
export const rateLimits = pgTable('rate_limits', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  orgId: uuid('org_id').notNull().references(() => organisations.id),
  date: date('date').notNull(),
  assessmentCount: smallint('assessment_count').notNull().default(0),
}, (table) => ({
  uniqueUserDate: unique().on(table.userId, table.date),
}))

// 11. cert_alerts
export const certAlerts = pgTable('cert_alerts', {
  id: uuid('id').defaultRandom().primaryKey(),
  certId: uuid('cert_id').notNull().references(() => certifications.id),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id),
  orgId: uuid('org_id').notNull().references(() => organisations.id),
  alertType: certAlertType('alert_type').notNull(),
  daysRemaining: smallint('days_remaining'),
  acknowledged: boolean('acknowledged').notNull().default(false),
  acknowledgedBy: uuid('acknowledged_by').references(() => users.id),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueCertAlertDay: unique().on(table.certId, table.alertType),
}))

// 12. invite_tokens
export const inviteTokens = pgTable('invite_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organisations.id),
  token: varchar('token', { length: 64 }).notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  usedBy: uuid('used_by').references(() => users.id),
  status: inviteStatus('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueToken: unique().on(table.token),
}))

// 13. sanctions_entries
export const sanctionsEntries = pgTable('sanctions_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 500 }).notNull(),
  aliases: jsonb('aliases').notNull().default('[]'),
  source: sanctionSource('source').notNull(),
  type: sanctionType('type').notNull(),
  referenceNumber: varchar('reference_number', { length: 100 }),
  listedAt: date('listed_at'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  nameIdx: index('sanctions_name_idx').on(table.name),
  sourceIdx: index('sanctions_source_idx').on(table.source),
}))
