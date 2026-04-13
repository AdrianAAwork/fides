# Fides — Phase 6 Brief
## Risk Scoring Engine UI & DORA/FCA Classification

### Context
Phases 1-5 are complete and deployed at fides-eight.vercel.app.
The assessment pipeline runs and produces scored results across 6 
dimensions. Phase 6 adds the intelligence layer on top — manual 
overrides, audit trail display, and DORA/FCA classification.

Read the entire codebase before writing any code.
Do not modify the pipeline or scoring logic — only add UI and 
new API routes on top of existing data.

---

### Part 1 — Manual Score Overrides

On the assessment detail page, each dimension card gets an 
"Adjust score" button (visible to ANALYST and ADMIN only, 
hidden for VIEWER).

**Override flow:**
1. Analyst clicks "Adjust score" on a dimension card
2. A small inline form appears showing:
   - Current score (read-only)
   - New score input (0-100, number field)
   - Reason field (textarea, mandatory, minimum 10 characters)
   - Save and Cancel buttons
3. On save:
   - Update final_score in assessment_scores table
   - Set is_overridden = true
   - Set override_reason, overridden_by, overridden_at
   - Insert an entry into audit_log:
     - action: 'SCORE_OVERRIDE'
     - entity_type: 'assessment_score'
     - entity_id: the score row id
     - details: JSON with dimension, old_score, new_score, reason
   - Recalculate the overall weighted score and risk_tier on 
     the assessment record
   - Update the UI to show the new score with a "Manually 
     adjusted" badge
4. Overridden dimensions show:
   - The new final_score in the card header
   - A purple "Manually adjusted" badge next to the score
   - The override reason and timestamp in the explanation panel
   - The original raw_score shown as "Original system score: X"

**API route:** PUT /api/assessments/[id]/scores/[dimension]
- Validate org_id from JWT (never from request body)
- Validate role is ANALYST or ADMIN
- Validate new score is 0-100
- Validate reason is present and at least 10 characters
- Run recalculation after saving

**Overall score recalculation:**
Use the existing dimension weights from the scoring logic.
After any override, recalculate:
- Weighted average across all 6 final_scores
- Apply special override rules:
  - Any sanctions match → minimum HIGH tier
  - Company status not active → minimum HIGH tier  
  - Going concern confirmed high confidence → minimum MEDIUM tier
- Update assessment.risk_tier and a computed overall_score field

---

### Part 2 — Audit Trail Display

Add an Audit trail section at the bottom of the assessment 
detail page.

**What to show:**
- Every entry in audit_log for this assessment_id
- Columns: timestamp, action, description, performed by
- System-generated entries show "System" as performer
- Manual entries show the user's email
- Most recent first
- Format action codes as readable labels:
  - ASSESSMENT_CREATED → "Assessment created"
  - SCORE_OVERRIDE → "Score manually adjusted"
  - RISK_TIER_OVERRIDE → "Risk tier manually adjusted"

**API route:** GET /api/assessments/[id]/audit
- Filter by assessment_id AND org_id
- Return all entries ordered by created_at DESC

---

### Part 3 — DORA/FCA Classification

Add a DORA classification card on the assessment detail page,
below the dimension scores. Initially shows "Pending — complete 
the classification questionnaire" with a button to start it.

**The intake form (5 questions):**

Q1: What type of service does this vendor provide?
Options: Cloud/hosting, Software/SaaS, Data/analytics, 
Payment processing, IT support/managed services, Other

Q2: Does this vendor process, store or transmit personal data 
on your behalf?
Options: Yes / No

Q3: If this vendor became unavailable, would it impact your 
operations for more than 2 hours?
Options: Yes / No / Unsure

Q4: Is there a readily available alternative vendor you could 
switch to within 1 month?
Options: Yes / No / Unsure

Q5: Does this vendor perform or support any activity that is 
directly regulated (e.g. payment processing, credit decisions, 
regulated reporting)?
Options: Yes / No

**Classification logic:**

CRITICAL if ANY of:
- Processes personal data AND loss impacts ops >2hrs AND 
  no substitute available
- Supports directly regulated activity AND no substitute

IMPORTANT if ANY of:
- Processes personal data AND loss impacts ops >2hrs
- Supports directly regulated activity
- Cloud/hosting/payment processing type AND no substitute

STANDARD: everything else

**Output display:**
- Classification badge: CRITICAL (red) / IMPORTANT (amber) / 
  STANDARD (green)
- Plain English justification paragraph explaining why this 
  classification was reached
- The 5 answers shown as a summary table
- Clickable article references:
  - DORA Article 28: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32022R2554
  - FCA outsourcing guidance: https://www.fca.org.uk/publications/finalised-guidance/fg16-5-guidance-outsourcing
- Manual override button (ADMIN only):
  - Dropdown to select different classification
  - Mandatory reason field
  - Saves to dora_classification table with override fields
  - Audit log entry

**Database:**
Use the existing dora_classification table.
Insert one row per assessment when form is submitted.
If a row already exists, update it (UNIQUE constraint on 
assessment_id already exists).

**API routes:**
POST /api/assessments/[id]/dora — submit the 5 answers, 
run classification logic, save result, return classification
PUT /api/assessments/[id]/dora — manual override by ADMIN

---

### Part 4 — News Score Adjustment

Change the neutral news score from 70 to 80 when no relevant 
headlines are found but no risk items were identified either.
The message should read: "No risk-relevant headlines identified. 
A neutral-positive score has been applied."

This is a one-line change in the scoring logic.

---

### Success Criteria for Phase 6

- Analyst can override any dimension score with a reason
- Overridden scores show "Manually adjusted" badge
- Overall risk tier recalculates after any override
- Audit trail section shows all system and manual entries
- DORA classification form appears and can be completed
- Classification shows correct tier with justification
- Article reference links open the correct EUR-Lex and FCA pages
- ADMIN can override the classification
- News neutral score is now 80 not 70
- VIEWER cannot see override buttons

---

### Do Not Build in Phase 6
- PDF export (Phase 8)
- Questionnaire generation (Phase 8)
- Cert alerts cron job (Phase 8)
- Bulk operations
- Any changes to the data pipeline
- Payment processing