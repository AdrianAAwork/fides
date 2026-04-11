# Fides — Vendor Risk Assessment Tool
## Claude Code Scaffold Brief

### What is Fides?
Fides is a multi-tenant B2B web application for GRC (Governance, Risk & Compliance) 
analysts to assess third-party vendor risk. Analysts input a vendor name, the tool 
pulls data from Companies House, GLEIF, sanctions lists, and news sources, then 
generates a structured risk report with DORA/FCA regulatory classification. Named 
after the Roman goddess of trust and good faith in contracts.

---

### Architecture decisions — do not deviate from these

- **Next.js 14+ App Router** — NOT Pages Router. This distinction is critical for 
  the Auth0 SDK version.
- **Auth0 @auth0/nextjs-auth0 v3** — the App Router compatible version specifically. 
  v1 and v2 have a completely different API and will not work.
- **Drizzle ORM** — explicit migrations, never auto-sync. Schema-first approach.
- **Neon Postgres** — use @neondatabase/serverless driver. Two connection strings 
  exist: pooled for all app queries, direct for migrations only. Never swap these.
- **Multi-tenancy via org_id** — every database query must filter by org_id. This 
  value comes exclusively from the verified JWT claim. Never trust org_id from the 
  request body.
- **No credentials ever hardcoded** — all sensitive values from process.env only, 
  no exceptions. Repo will be public.

---

### Environment variables
All are already configured in Vercel. Use process.env throughout. Never hardcode values.
AUTH0_SECRET
AUTH0_BASE_URL
AUTH0_ISSUER_BASE_URL
AUTH0_CLIENT_ID
AUTH0_CLIENT_SECRET
DATABASE_URL              # pooled — use for ALL app queries
DATABASE_URL_DIRECT       # direct/unpooled — use ONLY in drizzle.config.ts
ANTHROPIC_API_KEY
COMPANIES_HOUSE_API_KEY
NEWS_API_KEY
HIBP_API_KEY              # empty for now
HIBP_ENABLED              # string "false" — feature flag, check before any HIBP call
Create .env.local (gitignored) with all variable names and empty values for local 
development. Create .env.example (committed to git) with all variable names and 
empty values — no actual secrets ever in .env.example.

---

### Auth0 specifics
- SDK: @auth0/nextjs-auth0 v3, App Router pattern
- JWT claim namespace: https://fides.app
- org_id claim location in JWT: https://fides.app/org_id
- An Auth0 Action is already deployed that injects org_id from the user's email 
  domain on every login. For example jane@acmecorp.com gets org_id: acmecorp-com
- Callback URL pattern: {AUTH0_BASE_URL}/api/auth/callback
- Auth0 route handler lives at: app/api/auth/[auth0]/route.ts
- Middleware protects all routes except /api/auth/* and the root login page

---

### Neon connection string usage
DATABASE_URL — pooled via PgBouncer. Use this in your Drizzle db client for all 
application queries. Required for serverless functions to avoid connection exhaustion.

DATABASE_URL_DIRECT — direct connection to Postgres. Use this ONLY in 
drizzle.config.ts for running migrations. Never use in application code.

drizzle.config.ts example:
```typescript
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT!,
  },
})
```

---

### HIBP feature flag pattern
Before any HIBP API call, always check:
```typescript
if (process.env.HIBP_ENABLED === 'true') {
  // make HIBP API call
} else {
  // return manual entry state
}
```
HIBP is intentionally disabled. The code must exist but never execute unless the 
flag is explicitly enabled.

---

### Companies House API authentication
Companies House uses HTTP Basic Auth with the API key as username and empty password:
```typescript
headers: {
  'Authorization': 'Basic ' + 
    Buffer.from(process.env.COMPANIES_HOUSE_API_KEY + ':').toString('base64')
}
```
The colon with nothing after it is intentional — it represents an empty password.

---

### Critical rules that apply to every file

1. org_id always comes from verified JWT claims, never from request body
2. audit_log is insert-only — no UPDATE or DELETE operations ever on this table
3. All queries on tenant-scoped tables filter by BOTH org_id AND deleted_at IS NULL
4. updated_at is managed by a Postgres trigger, not application code
5. No credentials, API keys, or secrets ever in source code
6. Use DATABASE_URL for queries, DATABASE_URL_DIRECT for migrations only
7. Check HIBP_ENABLED feature flag before any HIBP-related code executes

---

### Build phases — complete and verify each before moving to the next

**Phase 1 — Project foundation**
1. Scaffold: npx create-next-app@latest . --typescript --tailwind --app 
   --no-src-dir --import-alias "@/*"
2. Install dependencies:
   npm install @auth0/nextjs-auth0@3 drizzle-orm @neondatabase/serverless
   npm install -D drizzle-kit
3. Create .env.local and .env.example as described above
4. Verify .env.local is in .gitignore
5. Configure Auth0 v3 App Router:
   - Create app/api/auth/[auth0]/route.ts
   - Create middleware.ts at project root
6. Create a root login page at app/page.tsx
7. Create a protected dashboard skeleton at app/dashboard/page.tsx that shows 
   the logged-in user's email and org_id

Phase 1 success criteria:
- App runs locally on localhost:3000
- Visiting /dashboard redirects unauthenticated users to Auth0 login
- After login, /dashboard renders and shows user email and org_id claim
- org_id is being read from the https://fides.app/org_id JWT claim

**Phase 2 — Database**
1. Create drizzle.config.ts using DATABASE_URL_DIRECT
2. Create src/db/schema.ts with all 11 tables (full schema below)
3. Create src/db/index.ts — Drizzle client using DATABASE_URL with 
   @neondatabase/serverless
4. Run the Postgres trigger SQL in Neon SQL editor (provided below)
5. Run: npx drizzle-kit generate
6. Run: npx drizzle-kit migrate
7. Verify all 11 tables exist in Neon dashboard

Phase 2 success criteria:
- All 11 tables visible in Neon dashboard Tables section
- Schema matches spec including all unique constraints and soft delete columns

**Phase 3 — Push and deploy**
1. Commit everything to main branch
2. Push to GitHub
3. Vercel auto-deploys
4. Add Vercel deployment URL to AUTH0_BASE_URL environment variable in Vercel
5. Add callback and logout URLs to Auth0 application settings:
   - Allowed Callback URLs: {VERCEL_URL}/api/auth/callback
   - Allowed Logout URLs: {VERCEL_URL}
6. Test login flow on the deployed Vercel URL

Phase 3 success criteria:
- Deployed app accessible at Vercel URL
- Login flow works end to end on production URL
- Dashboard shows correct user email and org_id after login

---

### Postgres trigger SQL
Run this in the Neon SQL editor before or alongside the first migration.
This manages updated_at automatically — do not set updated_at in application code.

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_assessments
  BEFORE UPDATE ON assessments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_certifications
  BEFORE UPDATE ON certifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_dora_classification
  BEFORE UPDATE ON dora_classification
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_questionnaires
  BEFORE UPDATE ON questionnaires
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### Database schema — src/db/schema.ts
Use Drizzle ORM with postgres-js dialect. Define all enums first, then tables.

**Enums to define:**
```typescript
export const roleType = pgEnum('role_type', ['VIEWER', 'ANALYST', 'ADMIN'])
export const assessmentStatusType = pgEnum('assessment_status_type', ['DRAFT', 'COMPLETE'])
export const riskTierType = pgEnum('risk_tier_type', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
export const dimensionType = pgEnum('dimension_type', [
  'FINANCIAL_HEALTH', 'BREACH_HISTORY', 'SANCTIONS', 
  'OWNERSHIP', 'TRUST_CERTS', 'NEWS_SENTIMENT'
])
export const certTypeType = pgEnum('cert_type_type', [
  'SOC2_TYPE_I', 'SOC2_TYPE_II', 'ISO_27001', 'ISO_22301', 
  'ISO_27701', 'CYBER_ESSENTIALS', 'CYBER_ESSENTIALS_PLUS', 
  'PCI_DSS', 'CSA_STAR', 'OTHER'
])
export const certSourceType = pgEnum('cert_source_type', [
  'AUTO_VANTA', 'AUTO_SAFEBASE', 'AUTO_WEB', 'MANUAL'
])
export const doraClassificationType = pgEnum('dora_classification_type', [
  'CRITICAL', 'IMPORTANT', 'STANDARD'
])
export const auditActionType = pgEnum('audit_action_type', [
  'ASSESSMENT_CREATED', 'SCORE_OVERRIDDEN', 'CLASSIFICATION_CONFIRMED',
  'CLASSIFICATION_OVERRIDDEN', 'CERT_ADDED', 'CERT_DELETED',
  'QUESTIONNAIRE_TRIGGERED', 'REASSESSMENT_SCHEDULED', 'ASSESSMENT_DELETED'
])
export const questionnaireStatusType = pgEnum('questionnaire_status_type', [
  'PENDING', 'DISPATCHED', 'RESPONDED', 'CLOSED'
])
export const reassessmentTriggerType = pgEnum('reassessment_trigger_type', [
  'ANNUAL', 'BREACH_DETECTED', 'CERT_EXPIRING', 'MANUAL'
])
export const certAlertType = pgEnum('cert_alert_type', [
  'EXPIRING_SOON', 'EXPIRED', 'STALE'
])
```

**Tables:**

```typescript
// organisations
export const organisations = pgTable('organisations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// users
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

// assessments
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

// assessment_scores
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

// certifications
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

// dora_classification
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

// audit_log — INSERT ONLY, never update or delete
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

// questionnaires
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

// reassessment_schedule
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

// rate_limits
export const rateLimits = pgTable('rate_limits', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  orgId: uuid('org_id').notNull().references(() => organisations.id),
  date: date('date').notNull(),
  assessmentCount: smallint('assessment_count').notNull().default(0),
}, (table) => ({
  uniqueUserDate: unique().on(table.userId, table.date),
}))

// cert_alerts
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
```

---

### After Phase 3 is complete and verified, we will separately brief:
- Phase 4: Companies House API integration and vendor search
- Phase 5: Risk scoring engine
- Phase 6: DORA/FCA classification
- Phase 7: Report UI
- Phase 8: PDF export and questionnaire generation

Do not build ahead of the current phase. Complete each phase fully, 
verify the success criteria, then wait for the next brief.