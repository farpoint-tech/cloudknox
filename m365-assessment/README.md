# M365 Tenant Assessment (PWA)

A read-only Microsoft 365 / Entra ID security assessment that runs **entirely in
the browser**. Sign in as an admin, and it evaluates your tenant against a set of
baseline and best-practice controls using Microsoft Graph. No backend, no
secret, no tenant data leaves the browser — tokens live in `sessionStorage` only.

Installable as a **PWA** (Windows/macOS/any browser) and deployable to **Vercel**
as a static site.

## What it checks today

### IAM / Identity
| Area | Checks |
|------|--------|
| Baseline enforcement | Security Defaults on/off; if off, whether Conditional Access covers the gap |
| Conditional Access | MFA for all users, MFA for admins, phishing-resistant MFA for admins, block legacy auth (report-only detected as a warning) |
| Authentication methods | Admin MFA registration, tenant-wide MFA coverage, SSPR for admins, admin passwordless capability |
| Privileged access | Entra ID P2 availability, PIM usage, standing privileged access, P2 license coverage for admins |
| Best-practice settings | User app-registration disabled, guest-invite restrictions, directory-read restrictions |

### Intune / Device Compliance
| Area | Checks |
|------|--------|
| Tenant settings | "Mark devices with no compliance policy as not compliant" (secureByDefault), compliance status validity period |
| Policies | Compliance policies exist, per-platform coverage |
| Devices | Managed-device compliance summary (% compliant / noncompliant / grace) |

### Defender (Microsoft Secure Score)
| Area | Checks |
|------|--------|
| Posture | Overall Secure Score vs the all-tenants average |
| Improvement actions | The highest-impact open Secure Score controls (Defender for Office 365 = email/Teams, endpoint, identity), largest gap first |

Each result is a **Finding** with a status (pass/fail/warning/manual/error), a
severity, a recommendation, and a link to Microsoft docs.

### Roadmap and the browser boundary
Verified empirically (CORS preflight probe): **all Microsoft Graph endpoints —
including `/security/secureScores` and `/security/alerts_v2` — return
`Access-Control-Allow-Origin: *`, so they are reachable from the browser.** What
is **not** reachable from a pure PWA:

- Exchange Online management config (anti-spam/anti-phish policies, mail flow,
  connectors) — served by `outlook.office365.com/adminapi`, **no CORS**.
- Microsoft Defender for Endpoint machine/vuln API (`api.security.microsoft.com`)
  — **no CORS**.
- Purview DLP policy detail (Security & Compliance PowerShell) — **no CORS**.

Those three need either a thin serverless proxy (Vercel function) or a desktop
(Tauri) build that can call the APIs without a browser origin. Everything
Graph-based keeps extending the PWA with zero new architecture.

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
   - `DeviceManagementConfiguration.Read.All`
   - `DeviceManagementManagedDevices.Read.All`
   - `SecurityEvents.Read.All`
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
