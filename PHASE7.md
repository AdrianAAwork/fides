# Fides — Phase 7 Brief
## Full report UI, design system, and polish

### Context
Phases 1-6 are complete and deployed at fides-eight.vercel.app.
Phase 7 applies a cohesive design system across the entire 
application and adds the remaining report panels.

Read the entire codebase before writing any code.
Do not modify any pipeline, scoring, or API logic.
This phase is UI and design only, plus two new data panels.

---

### Design system — apply globally

**Colour palette:**
- Page background: #F4F3F8
- Card background: #FFFFFF
- Card border: 0.5px solid #E2DFF0
- Secondary surface: #F9F8FD
- Secondary border: #E2DFF0
- Primary text: #1A1625
- Secondary text: #5B5478
- Tertiary text / labels: #8B85A8
- Muted / timestamps: #B8B3CE
- Purple accent: #5B3FD4
- Purple light: #EEEDFE
- Purple dark: #3C3489

**Risk tier colours — do not change:**
- CRITICAL: background #FCEBEB, text #791F1F
- HIGH: background #FAEEDA, text #633806
- MEDIUM: background #EAF3DE, text #27500A
- LOW: background #E6F1FB, text #0C447C

**Typography:**
- Font: Inter (already in stack via Tailwind)
- Section labels: 11px, uppercase, letter-spacing 0.06em,
  color #8B85A8
- Body: 14px, line-height 1.75, color #1A1625
- Card titles: 15px, font-weight 500
- Score numbers: 28px, font-weight 500
- Links and interactive elements: color #5B3FD4

**Cards:**
- border-radius: 12px
- border: 0.5px solid #E2DFF0
- background: #FFFFFF
- padding: 20px 24px
- margin-bottom: 12px

**Buttons:**
- Primary: background #5B3FD4, text white, border-radius 8px,
  padding 8px 16px, font-size 13px, no box-shadow
- Secondary/ghost: border 0.5px solid #E2DFF0, 
  background transparent, text #5B3FD4
- Destructive: border 0.5px solid #FCEBEB, text #791F1F
- Hover: darken by 8%

**Navigation/header:**
- Background: #FFFFFF
- Border-bottom: 0.5px solid #E2DFF0
- Logo mark: 32px square, background #5B3FD4, 
  white "F" inside, border-radius 8px
- "Fides" wordmark: font-size 15px, font-weight 500, 
  color #1A1625

Apply this design system to ALL existing pages:
- Login page
- Onboarding flow
- Dashboard
- Assessments list
- New assessment (vendor search)
- Assessment detail (report page)
- Organisation settings
- Profile settings

---

### Part 1 — Report page layout

Redesign the assessment detail page top to bottom:

**1. Report header card**
- Vendor name: 22px, font-weight 500, color #1A1625
- Subtitle: CH number · LEI · SIC · Jurisdiction · 
  Status, font-size 13px, color #8B85A8
- Top right: risk tier badge (font-size 14px, 
  padding 5px 14px) with overall score below
- Meta grid (4 columns): Company status, Jurisdiction,
  DORA classification, Next review due
  Each meta card: background #F9F8FD, border #E2DFF0

**2. Executive summary card**
- Label: "EXECUTIVE SUMMARY"
- Claude paragraph: 14px, line-height 1.75
- Recommended action box:
  border-left: 3px solid #BA7517
  background: #FEF9EE
  text color: #633806

**3. Dimension scores card**
- Label: "DIMENSION SCORES"
- Each row: name + weight % left, score right
- 3px progress bar below name, colour-coded:
  green #3B6D11 for ≥80, amber #BA7517 for 50-79,
  red #A32D2D for <50
- Score: 14px, font-weight 500, colour-coded
- "Manually adjusted" badge: background #EEEDFE, 
  text #5B3FD4 — only shown if overridden
- Expand chevron far right
- "Adjust score" button ONLY in expanded panel,
  never in the collapsed row header

**4. DORA classification card** — restyle only

**5. Contract & SLA panel** — see Part 2

**6. Regulatory references panel** — see Part 3

**7. Audit trail card** — restyle only

**8. Report footer with seal** — see Part 4

---

### Part 2 — Contract & SLA metadata panel

New manually-editable panel between DORA card and 
regulatory references.

**Fields (all optional):**
- SLA uptime commitment (text)
- RTO — Recovery Time Objective (text)
- RPO — Recovery Point Objective (text)
- Contract expiry date (date picker)
- Next scheduled review date (date picker)
- Account manager name (text)
- Account manager email (text)
- Notes (textarea, max 500 chars)

**Behaviour:**
- Read-only summary card when data exists
- "Edit" button (ANALYST+ only) opens inline form
- "Add contract details" prompt when empty
- VIEWER can see but not edit
- PUT /api/assessments/[id]/contract
- Store in contract_details JSONB column on assessments

**Database — run in Neon SQL editor:**
ALTER TABLE assessments ADD COLUMN contract_details JSONB;
Also add to src/db/schema.ts:
contractDetails: jsonb('contract_details')

---

### Part 3 — Regulatory references panel

New panel below contract details. Shows 7 articles,
each with title, one-line description, "View article"
button and external link.

Create src/lib/regulatoryReferences.ts with this 
exact structure:

```typescript
export const regulatoryReferences = [
  {
    id: 'dora-28',
    article: 'DORA Article 28',
    title: 'ICT third-party risk management',
    description: 'Defines obligations for managing risk 
      from ICT third-party service providers.',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32022R2554',
    regulator: 'EUR-Lex',
    fullText: `Article 28 — ICT third-party risk management
    
Financial entities shall manage ICT third-party risk as 
an integral component of ICT risk within their ICT risk 
management framework and in accordance with the following 
principles:

(a) financial entities that have in place contractual 
arrangements for the use of ICT services shall at all 
times remain fully responsible for compliance with and 
the discharge of all obligations under this Regulation 
and applicable financial services law;

(b) financial entities' management of ICT third-party 
risk shall be implemented in light of the principle of 
proportionality, taking into account the nature, scale, 
complexity and importance of ICT-related dependencies, 
and the risks arising from contractual arrangements on 
the use of ICT services concluded with ICT third-party 
service providers.`
  },
  {
    id: 'dora-29',
    article: 'DORA Article 29',
    title: 'Key contractual provisions',
    description: 'Sets out minimum contractual requirements 
      for ICT third-party arrangements.',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32022R2554',
    regulator: 'EUR-Lex',
    fullText: `Article 29 — Key contractual provisions

Contractual arrangements on the use of ICT services shall 
include at minimum:

(a) a clear and complete description of all functions and 
ICT services to be provided by the ICT third-party service 
provider;

(b) the locations where the contracted or subcontracted 
functions and ICT services are to be provided and where 
data is to be processed;

(c) provisions on availability, authenticity, integrity 
and confidentiality in relation to the protection of data;

(d) provisions on ensuring access, recovery and return 
in the case of insolvency, resolution or discontinuation 
of business operations of the ICT third-party service 
provider;

(e) service level descriptions, including updates and 
revisions thereof;

(f) the right of the financial entity to monitor on an 
ongoing basis the ICT third-party service provider's 
performance.`
  },
  {
    id: 'dora-30',
    article: 'DORA Article 30',
    title: 'Critical ICT third-party providers',
    description: 'Covers designation and oversight of 
      systemically important ICT providers.',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32022R2554',
    regulator: 'EUR-Lex',
    fullText: `Article 30 — Designation of critical ICT 
third-party service providers

The ESAs, through the Joint Committee, shall designate 
ICT third-party service providers that are critical for 
financial entities on the basis of criteria such as:

(a) the systemic impact on the stability, continuity or 
quality of the provision of financial services in the 
event that the relevant ICT third-party service provider 
faces a large scale operational failure;

(b) the systemic character or importance of the financial 
entities that rely on the relevant ICT third-party service 
provider;

(c) the reliance of financial entities on the services 
provided by the relevant ICT third-party service provider 
in relation to critical or important functions;

(d) the degree of substitutability of the ICT third-party 
service provider.`
  },
  {
    id: 'dora-31',
    article: 'DORA Article 31',
    title: 'Oversight framework',
    description: 'Defines the regulatory oversight framework 
      for critical third-party providers.',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32022R2554',
    regulator: 'EUR-Lex',
    fullText: `Article 31 — Structure of the Oversight Framework

Critical ICT third-party service providers shall be 
subject to oversight by a Lead Overseer designated from 
among the ESAs.

The Lead Overseer shall have the following powers:

(a) to request all relevant information and documentation;

(b) to carry out general investigations and inspections 
at the premises of the critical ICT third-party service 
provider;

(c) to issue recommendations on ICT security and other 
operational risk-related measures;

(d) to request remediation plans addressing identified 
risks within defined timeframes.

Financial entities shall only use services from critical 
ICT third-party service providers that comply with the 
Oversight Framework.`
  },
  {
    id: 'dora-recital-64',
    article: 'DORA Recital 64',
    title: 'Proportionality principle',
    description: 'Clarifies that requirements apply 
      proportionately based on entity size and risk profile.',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32022R2554',
    regulator: 'EUR-Lex',
    fullText: `Recital 64 — Proportionality

In order to ensure proportionate application of the 
requirements, smaller and non-interconnected financial 
entities, namely microenterprises as well as small and 
non-interconnected investment firms and financial 
entities referred to in Article 2(5), points (e) to (g), 
should be subject to a limited set of requirements.

Member States and competent authorities should take 
into account the principle of proportionality when 
assessing compliance, recognising that a small payment 
institution processing low volumes poses materially 
different risks to a systemically important bank with 
complex ICT dependencies across multiple jurisdictions.

This proportionality principle does not exempt entities 
from the core obligations of third-party risk management, 
but permits a scaled approach to implementation 
commensurate with the nature, scale and complexity of 
their activities.`
  },
  {
    id: 'fca-ss221',
    article: 'FCA SS2/21',
    title: 'Outsourcing and third-party risk management',
    description: 'The FCA supervisory statement on 
      outsourcing for UK-regulated firms.',
    url: 'https://www.fca.org.uk/publications/supervisory-statements/ss2-21-outsourcing-and-third-party-risk-management',
    regulator: 'FCA',
    fullText: `FCA Supervisory Statement SS2/21
Outsourcing and third-party risk management

This supervisory statement sets out the FCA's expectations 
for firms when outsourcing to third-party service providers, 
including cloud services.

Key expectations:

Governance: Firms must maintain a comprehensive register 
of all material outsourcing arrangements. The board retains 
full responsibility for outsourced activities and must 
receive regular MI on third-party performance and risk.

Due diligence: Before entering any material outsourcing 
arrangement, firms must conduct thorough due diligence 
covering the provider's financial health, operational 
resilience, security standards, and regulatory status.

Contractual requirements: Material outsourcing contracts 
must include provisions for audit rights, sub-outsourcing 
controls, data security, business continuity, and exit 
planning.

Operational resilience: Firms must ensure outsourcing 
arrangements do not compromise their ability to meet 
impact tolerances for important business services.

Exit planning: Firms must maintain documented, tested 
exit plans for all material outsourcing arrangements, 
including the ability to repatriate services or transition 
to an alternative provider within a defined timeframe.`
  },
  {
    id: 'fca-sysc8',
    article: 'FCA SYSC 8',
    title: 'Outsourcing rules',
    description: 'The binding FCA Handbook rules on 
      outsourcing for regulated firms.',
    url: 'https://www.handbook.fca.org.uk/handbook/SYSC/8/',
    regulator: 'FCA',
    fullText: `FCA SYSC 8 — Outsourcing

SYSC 8.1 — General outsourcing requirements

A firm must:

(1) when relying on a third party for the performance 
of operational functions which are critical or important 
for the performance of regulated activities, take 
reasonable steps to avoid undue additional operational 
risk;

(2) not undertake the outsourcing of important 
operational functions in such a way as to impair 
materially the quality of its internal control and the 
ability of the FCA to monitor the firm's compliance 
with its obligations;

(3) have in place a written contract with the service 
provider that clearly allocates the respective rights 
and obligations.

SYSC 8.1.8 — The firm remains fully responsible for 
discharging all of its obligations under the regulatory 
system and must retain the necessary expertise to 
supervise the outsourced functions effectively.`
  }
]
```

**Slide-over panel:**
- Right-aligned panel, width 480px
- Position absolute within the report page layout,
  NOT position fixed
- Shows article title, description, full text
- "Open on [regulator] ↗" link at bottom
- Close button top right
- Background #FFFFFF, border-left 0.5px solid #E2DFF0

---

### Part 4 — FidesSeal component

Create src/components/FidesSeal.tsx.
Accepts size prop (number, default 60).
Use this EXACT SVG — do not modify the structure:

```tsx
import React from 'react'

interface FidesSealProps {
  size?: number
}

export default function FidesSeal({ size = 60 }: FidesSealProps) {
  const id = React.useId().replace(/:/g, '')
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 140 140" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="70" cy="70" r="64" fill="none" 
        stroke="#5B3FD4" strokeWidth="1.5" opacity="0.45"/>
      <circle cx="70" cy="70" r="48" fill="none" 
        stroke="#5B3FD4" strokeWidth="1" opacity="0.3"/>
      <path id={`top-${id}`} 
        d="M 70,70 m -56,0 a 56,56 0 0,1 112,0" fill="none"/>
      <text fontFamily="Inter,sans-serif" fontSize="8" 
        fill="#5B3FD4" fillOpacity="0.72" letterSpacing="2">
        <textPath 
          href={`#top-${id}`} 
          startOffset="50%" 
          textAnchor="middle" 
          dy="-8"
        >
          VENDOR ASSESSMENT
        </textPath>
      </text>
      <path id={`bot-${id}`} 
        d="M 70,70 m -56,0 a 56,56 0 0,0 112,0" fill="none"/>
      <text fontFamily="Inter,sans-serif" fontSize="8" 
        fill="#5B3FD4" fillOpacity="0.58" letterSpacing="2">
        <textPath 
          href={`#bot-${id}`} 
          startOffset="50%" 
          textAnchor="middle" 
          dy="16"
        >
          RISK MANAGEMENT
        </textPath>
      </text>
      <text fontFamily="Inter,sans-serif" fontSize="7" 
        fill="#5B3FD4" fillOpacity="0.6" 
        textAnchor="middle" x="14" y="73">✦</text>
      <text fontFamily="Inter,sans-serif" fontSize="7" 
        fill="#5B3FD4" fillOpacity="0.6" 
        textAnchor="middle" x="126" y="73">✦</text>
      <text fontFamily="Georgia,serif" fontSize="30" 
        fill="#5B3FD4" fillOpacity="0.72" 
        textAnchor="middle" x="70" y="65">F</text>
      <text fontFamily="Inter,sans-serif" fontSize="8.5" 
        fill="#5B3FD4" fillOpacity="0.4" 
        textAnchor="middle" x="70" y="80" 
        letterSpacing="5">FIDES</text>
    </svg>
  )
}
```

Note: React.useId() ensures unique path IDs when the 
component is used multiple times on the same page.

**Report footer:**
After the audit trail, add a footer section:
- Left: <FidesSeal size={56} />
- Right (font-size 12px, color #8B85A8):
  Line 1: "Generated by Fides · AI-assisted vendor 
           risk assessment"
  Line 2: "Companies House · GLEIF · OFSI/OFAC/EU 
           sanctions · NCSC · NewsAPI"
  Line 3 (color #B8B3CE): "Assessment ID: [id] · 
           [date] · For internal use only"
- Layout: flex, align-items center, gap 20px
- Container: white card, border #E2DFF0, 
  border-radius 12px, padding 20px 28px

---

### Part 5 — UI fixes

1. "Adjust score" button: move into expanded panel only.
   Collapsed row shows only score, label, weight, 
   progress bar, and chevron.

2. Assessments list: add thin colour-coded bar under 
   each score number for quick visual scanning.

3. Dashboard recent assessments: show risk tier badge
   colour-coded, vendor name, CH number, date.
   Each row clickable → assessment detail page.

4. New assessment confirmation screen: after company 
   is confirmed, show the 6 data sources that will be 
   checked before the Start assessment button.

---

### Part 6 — Login page redesign

Centred layout, max-width 400px, page bg #F4F3F8:
- <FidesSeal size={80} /> centred at top
- "Fides" — 24px, font-weight 500, #1A1625, centred
- "Vendor Risk Assessment" — 13px, #8B85A8, centred
- Gap
- "Sign in with your organisation account" — 13px, 
  #8B85A8, centred
- Auth0 sign in button: full width, bg #5B3FD4, 
  white text, border-radius 8px, padding 12px
- Bottom: "Powered by Anthropic · Companies House · GLEIF"
  11px, #B8B3CE, centred

---

### Success criteria

- Entire app uses purple design system consistently
- Report page matches Part 1 layout top to bottom
- Contract & SLA panel saves and displays correctly
- Regulatory references shows all 7 articles
- Slide-over opens with correct full text
- FidesSeal lives at src/components/FidesSeal.tsx
- Seal appears in report footer with attribution text
- Login page uses seal and purple design system
- Adjust score only visible in expanded panel
- No pipeline, scoring, or auth logic modified

---

### Do not build in Phase 7
- PDF export (Phase 8)
- Questionnaire generation (Phase 8)
- Cert alerts cron job (Phase 8)
- Login animations (Phase 8)
- Payment processing
- Any changes to assessment pipeline