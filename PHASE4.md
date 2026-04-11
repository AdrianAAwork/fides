# Fides — Phase 4 Brief
## Organisation management, auth fix, onboarding flow

### Context
The skeleton from Phases 1-3 is deployed at fides-eight.vercel.app.
Auth0 login works. Dashboard shows email and org_id from JWT.
Currently org_id is derived from email domain — this must be fixed.
All 11 tables exist in Neon but contain no data.
A Vercel Blob store called fides-logos has been created in London region.
BLOB_READ_WRITE_TOKEN is already set in Vercel automatically.
It has also been added manually to .env.local — do not add it again.

Read the entire existing codebase before writing any code.
Understand what exists before adding to it.

---

### Environment variables needed for this phase
All already set in Vercel and .env.local:
- BLOB_READ_WRITE_TOKEN — already configured, do not modify

---

### Schema additions — run as a new Drizzle migration

Add these to src/db/schema.ts:

**New enum types:**
```typescript
export const accountType = pgEnum('account_type', ['SOLO', 'ORGANISATION'])
export const inviteStatus = pgEnum('invite_status', [
  'PENDING', 'ACCEPTED', 'EXPIRED', 'PENDING_UPGRADE'
])
```

**Modify organisations table — add these columns:**
```typescript
accountType: accountType('account_type').notNull().default('SOLO'),
logoUrl: varchar('logo_url', { length: 500 }),
brandColor: varchar('brand_color', { length: 7 }),
memberLimit: smallint('member_limit').notNull().default(5),
```

**New invite_tokens table:**
```typescript
export const inviteTokens = pgTable('invite_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organisations.id),
  token: varchar('token', { length: 64 }).notNull().unique(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  usedBy: uuid('used_by').references(() => users.id),
  status: inviteStatus('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow().notNull(),
}, (table) => ({
  uniqueToken: unique().on(table.token),
}))
```

After updating schema.ts run:
npx drizzle-kit generate
npx drizzle-kit migrate

Also run this in Neon SQL editor after migration:
```sql
CREATE TRIGGER set_updated_at_organisations
  BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### Auth0 Action fix — most delicate part

The current Action derives org_id from email domain. This must be
replaced with a database lookup.

New approach:
1. User logs in
2. Action checks if a user record exists in the database for this auth0_id
3. If yes — read their org_id from the database and stamp it into JWT
4. If no — stamp needs_onboarding: true into the JWT so the app
   knows to show the onboarding flow

Updated Auth0 Action code to paste into the Auth0 dashboard
under Actions → Library → inject-org-id → edit:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://fides.app';

  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: event.secrets.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    const result = await pool.query(
      `SELECT u.id, u.org_id, u.role, o.account_type, o.slug
       FROM users u
       JOIN organisations o ON u.org_id = o.id
       WHERE u.auth0_id = $1
       AND u.deleted_at IS NULL`,
      [event.user.user_id]
    );

    await pool.end();

    if (result.rows.length > 0) {
      const user = result.rows[0];
      api.idToken.setCustomClaim(`${namespace}/org_id`, user.slug);
      api.idToken.setCustomClaim(`${namespace}/role`, user.role);
      api.idToken.setCustomClaim(
        `${namespace}/account_type`, user.account_type
      );
      api.idToken.setCustomClaim(
        `${namespace}/needs_onboarding`, false
      );
    } else {
      api.idToken.setCustomClaim(
        `${namespace}/needs_onboarding`, true
      );
    }
  } catch (err) {
    api.idToken.setCustomClaim(
      `${namespace}/needs_onboarding`, true
    );
  }
};
```

IMPORTANT — Auth0 Action secret:
In the Auth0 Action editor, click the Secrets panel on the left sidebar.
Add a secret named DATABASE_URL with the pooled Neon connection string
as the value. This is Auth0's secure secrets storage — the value is
never in any code file. Never hardcode the connection string.

---

### Middleware update

Update middleware.ts to handle the onboarding redirect:

- If user is authenticated and JWT has needs_onboarding: true
  → redirect to /onboarding
- If user is authenticated and JWT has needs_onboarding: false
  and visits / → redirect to /dashboard
- Protect /dashboard, /onboarding, /settings/* routes
- Allow /api/auth/*, / unauthenticated
- Allow /api/onboarding/* unauthenticated (needed for signup flow)

---

### Onboarding flow — /onboarding page

Shown to any authenticated user whose JWT has needs_onboarding: true.

Step 1 — Choose account type

Two cards side by side:

Solo user card:
- Title: "Just me"
- Description: "I am an independent analyst or consultant working
  alone. My own private workspace."
- Button: "Set up my workspace"

Organisation card:
- Title: "My organisation"
- Description: "I am part of a team. We will share a vendor register
  and collaborate on assessments."
- Two options appear below when selected:
  - "Create a new organisation"
  - "Join with an invite code"

Solo path:
- One field: "Your name" (pre-filled from Auth0 profile if available)
- Click "Get started"
- App creates organisation record with account_type: SOLO
- Slug derived from their name plus a short random suffix to ensure
  uniqueness e.g. jane-smith-x4k2
- Creates user record linked to that org with role: ADMIN
- Redirects to /dashboard

Create organisation path:
- Field: "Organisation name"
- Field: "Your name"
- Click "Create organisation"
- App creates organisation with account_type: ORGANISATION
- Creates user as ADMIN
- Shows success screen with invite link they can copy and share
- Invite link format: https://fides-eight.vercel.app/join?token=xxx
- Button: "Go to dashboard"

Join organisation path:
- Field: "Invite code or paste invite link"
- Click "Join"
- Validates token — if valid and not expired and org is under
  member limit: creates user record, marks token ACCEPTED,
  redirects to dashboard
- If org is at member limit (5 free members): creates user record,
  marks token PENDING_UPGRADE, redirects to dashboard with banner:
  "Your account is pending activation. The organisation admin has
  been notified to upgrade their plan."
- If token invalid or expired: shows clear error message

---

### Dashboard update

Update /dashboard to use real user and organisation data from
the database, not just raw JWT claims.

Display:
- Organisation name (not slug)
- Organisation logo if set — shown in top left header area
- If no logo set: show a subtle clickable placeholder with a
  small upload icon and tooltip on hover: "Add your organisation
  logo" — clicking opens the logo upload dialog
- User display name and role badge
- For ORGANISATION accounts: member count e.g. "3 of 5 members"
- For SOLO accounts: show "My Workspace" label, no member count
  visible

---

### Organisation settings page — /settings/organisation

Accessible to ADMIN role only.
VIEWER and ANALYST attempting to access this page see a clean
403 message: "You do not have permission to access this page."

Sections:

Organisation profile:
- Organisation name field (editable, save button)
- Organisation slug (read only, shown as small muted text)
- Brand color: hex input field with a live color preview swatch
  next to it. On save updates brand_color in database.
- Logo upload area:
  - Shows current logo if set, otherwise a dashed placeholder
    with upload icon
  - Clicking either opens a non-intrusive dialog (not a full
    page modal — a small centered overlay)
  - Dialog title: "Upload your organisation logo"
  - Sub-copy: "PNG, JPG or SVG · Max 2MB · Square or horizontal
    works best for display in the header and on reports"
  - File input restricted to: image/png, image/jpeg, image/svg+xml
  - 2MB size limit enforced client-side before upload attempt
  - Show a preview of the selected image before saving
  - On save: upload to Vercel Blob using BLOB_READ_WRITE_TOKEN,
    save returned URL to organisations.logo_url in database
  - On success: dialog closes, new logo appears immediately
  - If no logo: placeholder remains, no broken image shown

Members section:
- Table showing: display name, email, role, date joined
- Admin can change any member's role via a dropdown
  (VIEWER / ANALYST / ADMIN)
- Admin can remove a member — with a confirmation step:
  "Remove [name] from [org name]? They will lose access
  immediately."
- Member count shown as: "3 of 5 free members"

Invite members section:
(Only shown for ORGANISATION account type, not for SOLO)
- Button: "Generate invite link"
- On click: creates invite_token record with 7-day expiry,
  displays the full invite URL for copying
- If member count is 3 or 4: show a subtle amber note next
  to the button: "X of 5 free seats used"
- If member count is 5: button still shows but clicking opens
  a soft nudge modal:
  "You have reached the 5-member free limit.
  You can still send this invite — the new member will be
  added in a pending state and activated when you upgrade
  your plan.
  [Send invite anyway] [Cancel]"
  Choosing Send anyway creates the invite with status
  PENDING_UPGRADE.

Danger zone section:
- "Delete organisation" button — ADMIN only
- Requires typing the organisation name to confirm
- On confirm: soft deletes the organisation and all associated
  data by setting deleted_at timestamps

---

### User profile page — /settings/profile

Available to all authenticated users.

Fields:
- Display name — editable, save button
- Email — read only, sourced from Auth0
- Role — read only, shown as a badge
- Organisation name — read only, links to /settings/organisation
  if user is ADMIN, plain text if not

---

### Role enforcement

Add a helper utility src/lib/auth.ts with:

```typescript
type Role = 'VIEWER' | 'ANALYST' | 'ADMIN'

const roleHierarchy: Record<Role, number> = {
  VIEWER: 1,
  ANALYST: 2,
  ADMIN: 3,
}

export function hasRole(userRole: Role, requiredRole: Role): boolean {
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole]
}
```

Apply to API routes:
- GET routes returning assessment data: VIEWER minimum
- POST/PUT creating or modifying assessments: ANALYST minimum
- Organisation management routes: ADMIN only
- Return 403 with generic message if role check fails:
  { error: 'Insufficient permissions' }
  Never reveal what the route does in the error.

---

### Logo upload API route

Create /api/org/logo as a Next.js App Router route handler.

- Method: POST
- Auth: required, ADMIN role only
- Accepts: multipart/form-data with a file field named 'logo'
- Validates: file type must be image/png, image/jpeg, or image/svg+xml
- Validates: file size must be under 2MB (2097152 bytes)
- On validation failure: return 400 with clear error message
- On success: upload to Vercel Blob, update organisations.logo_url,
  return { logoUrl: string }
- Use BLOB_READ_WRITE_TOKEN from process.env — never hardcode

---

### Success criteria for Phase 4

- New user login shows onboarding screen correctly
- Solo path creates org, redirects to dashboard showing
  "My Workspace" with no member count
- Organisation creation shows invite link
- Invite link works — new user joining sees correct dashboard
- 6th member gets PENDING_UPGRADE status and sees the banner
- org_id in JWT now comes from the database not the email domain
- Logo upload works end to end — logo appears in dashboard header
- Brand color saves correctly to database
- Organisation settings accessible to ADMIN, blocked for others
- VIEWER role cannot access ANALYST or ADMIN routes
- Existing session: after deployment, logging out and back in
  triggers onboarding because the user record does not exist
  in the database yet — this is correct and expected behaviour

---

### Note on current session handling

After Phase 4 is deployed, the logged-in session will have the
old gmail-com org_id. Log out, log back in, and you will be sent
to onboarding. Go through it as an organisation admin to create
your proper account. This replaces the temporary gmail-com
organisation with a real one. This is expected and correct.

---

### Do not build in Phase 4
- Payment processing of any kind
- Actual plan enforcement beyond the soft nudge banner
- Email sending for invites — share the link manually for now
- Assessment features — those are Phase 5
- Any external payment provider integration