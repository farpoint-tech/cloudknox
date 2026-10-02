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

### Desktop-only domains (Tauri build)
Some data has **no CORS-enabled REST API** and cannot be read from a pure PWA.
The desktop build (Tauri) adds these by calling native HTTP (no browser origin)
and the admin's locally-installed PowerShell modules:

| Domain | Source | How the desktop app reaches it |
|--------|--------|--------------------------------|
| Defender for Endpoint | `api.security.microsoft.com/api/machines` (no CORS, separate token resource) | native HTTP via `@tauri-apps/plugin-http` |
| Exchange anti-phishing | `Get-AntiPhishPolicy` (EXO PowerShell) | local `pwsh` via the `run_powershell` command |
| Purview DLP | `Get-DlpCompliancePolicy` (Security & Compliance PowerShell) | local `pwsh` via `run_powershell` |

In the **web/PWA** build these three domains render a "desktop-only" note; the
Graph domains (IAM, Intune, Defender Secure Score) run everywhere.

Verified empirically (CORS preflight probe): **all Microsoft Graph endpoints —
including `/security/secureScores` — return `Access-Control-Allow-Origin: *`**,
so everything Graph-based stays in the PWA with zero extra architecture.

## Desktop build

The desktop app reuses the exact same UI; only the runtime differs. Requires the
[Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) (Rust
toolchain + platform WebView libraries), plus PowerShell 7 (`pwsh`) and the
admin's `ExchangeOnlineManagement` module (which also provides
`Connect-IPPSSession` for the DLP domain).

```bash
npm install
# dev (hot-reloads the Next dev server inside the desktop window):
npm run tauri:dev
# production installers for the current OS:
npm run tauri icon public/icon-512.png   # one-time: generate platform icons
npm run tauri:build
```

### Extra app-registration permission for Defender for Endpoint
The DfE API is a **separate resource** from Graph. On the app registration add
**APIs my organization uses → WindowsDefenderATP → Delegated → `Machine.Read`**
(the delegated permission — *not* the app-only `Machine.Read.All`) and grant
admin consent. The signed-in user also needs the Defender **View Data** RBAC
role. Because the token is acquired mid-run, pre-consenting avoids an
interactive popup during the assessment.

**Security model:** the desktop app requests only read scopes and read cmdlets;
the `run_powershell` scripts are hardcoded constants (no user input reaches the
shell). Native HTTP is scoped (in `src-tauri/capabilities/default.json`) to the
Microsoft endpoints only, and a Content-Security-Policy is set in
`tauri.conf.json`. Tenant data never leaves the local machine — same privacy
property as the PWA.

> The desktop build's Rust/Tauri layer and the interactive PowerShell sign-in
> could not be compiled/run in the authoring environment. If desktop sign-in
> fails, relax the `connect-src`/`frame-src` hosts in the `tauri.conf.json` CSP;
> the TypeScript layer (all `analyze()` logic, transport, auth wiring) is fully
> type-checked and unit-tested.

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
