# M365 Tenant Assessment (PWA)

A read-only Microsoft 365 / Entra ID security assessment that runs **entirely in
the browser**. Sign in as an admin, and it evaluates your tenant against a set of
baseline and best-practice controls using Microsoft Graph. No backend, no
secret, no tenant data leaves the browser — tokens live in `sessionStorage` only.

Installable as a **PWA** (Windows/macOS/any browser) and deployable to **Vercel**
as a static site.

## What it checks today (IAM / Identity)

| Area | Checks |
|------|--------|
| Baseline enforcement | Security Defaults on/off; if off, whether Conditional Access covers the gap |
| Conditional Access | MFA for all users, MFA for admins, phishing-resistant MFA for admins, block legacy auth (report-only detected as a warning) |
| Authentication methods | Admin MFA registration, tenant-wide MFA coverage, SSPR for admins, admin passwordless capability |
| Privileged access | Entra ID P2 availability, PIM usage, standing privileged access, P2 license coverage for admins |
| Best-practice settings | User app-registration disabled, guest-invite restrictions, directory-read restrictions |

Each result is a **Finding** with a status (pass/fail/warning/manual/error), a
severity, a recommendation, and a link to Microsoft docs.

### Roadmap
Defender (email/Teams, endpoint), Exchange Online configuration, DLP baseline,
and Intune compliance are planned as additional domains. Some of those rely on
data that is **not** exposed via Graph/CORS from a browser (e.g. Exchange Online
management, parts of Purview) — those will need either a thin serverless proxy or
a desktop (Tauri) build.

## Prerequisites: app registration

1. Entra ID → **App registrations** → New registration.
2. Platform: **Single-page application**, redirect URI = your origin(s), e.g.
   `http://localhost:3000` and your Vercel URL.
3. API permissions → Microsoft Graph → **Delegated**, add and grant admin
   consent for (all read-only):
   - `User.Read`
   - `Directory.Read.All`
   - `Policy.Read.All`
   - `AuditLog.Read.All`
   - `RoleManagement.Read.Directory`
   - `Organization.Read.All`
4. Copy the **Application (client) ID** into `.env.local` (see
   `.env.local.example`).

## Run locally

```bash
cp .env.local.example .env.local   # then set NEXT_PUBLIC_AAD_CLIENT_ID
npm install
npm run dev                         # http://localhost:3000
```

## Quality gates

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest (graph client + analysis logic)
npm run build       # production build
```

The Graph client (pagination + 429/Retry-After backoff) and every check's pure
`analyze*` function are unit-tested without needing a tenant.

## Deploy to Vercel

Import the repo, set the project root to `m365-assessment/`, add the
`NEXT_PUBLIC_AAD_CLIENT_ID` (and optional `NEXT_PUBLIC_AAD_TENANT_ID`)
environment variables, and add the Vercel URL as a redirect URI on the app
registration.

## Architecture

```
src/
  lib/
    graph/graphClient.ts     # fetch + full pagination + 429 retry (testable)
    auth/                    # MSAL config, provider, useGraphClient hook
    engine/types.ts          # Finding / Severity / status model
    assessment/iam/          # one module per check, each with a pure analyze()
  components/                # FindingCard, AssessmentView, PwaRegister
  app/                       # Next.js App Router pages
```

Adding a domain = a new folder under `assessment/` with `analyze*` (pure) +
`run*` (fetch) functions, wired into an orchestrator like `iam/index.ts`.
