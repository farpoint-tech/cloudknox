# API-Kosten-Endpunkte (Recherche 2026-10-25, Quellen am Ende)

## Anthropic (verifiziert in Doku)
- GET https://api.anthropic.com/v1/organizations/cost_report  ; GET .../v1/organizations/usage_report/messages
- Auth: Admin-Key `sk-ant-admin01-…` → Header `x-api-key`, plus `anthropic-version: 2023-06-01`. Nur Org-Konten, kein Einzelkonto.
- Params: starting_at, ending_at (RFC3339), bucket_width=1d (max 31), group_by[]=description|workspace_id; Paging page/next_page.
- Response: data[].results[].amount (Dezimal-String in **Cent**, "123.45" = 1,23 $), currency "USD". Daten ~5 min verzögert, max 1 Poll/min.
- Keychain-Dienst: `anthropic-admin`

## OpenAI (verifiziert via Cookbook)
- GET https://api.openai.com/v1/organization/costs ; GET .../v1/organization/usage/completions
- Auth: `Authorization: Bearer sk-admin-…` (nur Org-Owner kann anlegen)
- Params: start_time (Unix s, Pflicht), end_time, bucket_width=1d, limit 1–180, group_by=line_item|project_id; Paging page/next_page
- Response: data[].results[].amount.value (**Dollar**), amount.currency "usd". Usage: input_tokens, output_tokens, input_cached_tokens, model.
- Caveat: vereinzelt 404 trotz gültigem Key gemeldet.
- Keychain-Dienst: `openai-admin`

## xAI / Grok API (dokumentiert, Einheiten teils UNVERIFIED)
- Base https://management-api.x.ai ; Auth `Authorization: Bearer <Management-Key>` (Console → Settings → Management Keys, Billing read-only reicht)
- GET /v1/billing/teams/{team_id}/postpaid/invoice/preview → coreInvoice.amountBeforeVat (**Cent**), billingCycle, prepaidCreditsUsed
- GET /v1/billing/teams/{team_id}/prepaid/balance → total.val (Cent)
- POST /v1/billing/teams/{team_id}/usage  (analyticsRequest{timeRange, timeUnit, values[{name:"usd",aggregation:"AGGREGATION_SUM"}]}) → timeSeries[].dataPoints — Einheit UNVERIFIED
- team_id: aus Console; Keychain-Dienste: `xai-management` (Key) und `xai-team-id` (ID als Passwortfeld)

## Google Gemini API: kein Endpunkt
- Keine programmatische Kosten-/Usage-API. Weg: Cloud-Billing-Export nach BigQuery + jobs.query (Service-Account, BigQuery Data Viewer + Job User),
  SUM(cost)+credits wo service.description='Gemini API' (String UNVERIFIED) und invoice.month = aktueller Monat. Verzögerung Stunden bis 1 Tag.
- v1: "n/v" anzeigen, Konfiguration später (Keychain `gcp-billing-sa` = Pfad/JSON des Service-Accounts, `gcp-billing-table`).

## GitHub Copilot
- Offiziell: GET https://api.github.com/users/{username}/settings/billing/premium_request/usage?year&month  Header `X-GitHub-Api-Version: 2026-03-10`
  → usageItems[].{product, model, netQuantity, netAmount (**Dollar**)}. Token: Fine-grained PAT mit "Plan: read" (UNVERIFIED). Nur bei selbst gekauftem Plan.
- Inoffiziell: GET https://api.github.com/copilot_internal/user → copilot_plan, quota_reset_date, quota_snapshots.premium_interactions.{entitlement,remaining,percent_remaining,overage_count,unlimited}
  Header: Editor-Version, Editor-Plugin-Version, Copilot-Integration-Id: vscode-chat, User-Agent GitHubCopilotChat/… ; ob `gh auth token` reicht: UNVERIFIED (lokaler gh-Token ist derzeit ohnehin ungültig).
- Keychain-Dienst (optional): `github-billing-pat`

## Microsoft 365 Copilot (Microsoft Learn, abgefragt 2026-10-25; nicht live getestet)
- Token: az CLI, `az account get-access-token --tenant <id> --resource-type ms-graph`; Login `az login --tenant <id> --scope https://graph.microsoft.com//.default`.
- `GET /v1.0/me/licenseDetails` (User.Read) → `value[].skuPartNumber` (z. B. `Microsoft_365_Copilot`).
- `GET /v1.0/directory/subscriptions` (companySubscription: `skuPartNumber`, `nextLifecycleDateTime`, `totalLicenses`, `status`), braucht Verzeichnis-Leserechte.
- Nutzungsbericht: learn.microsoft.com/graph/api/reportroot-getmicrosoft365copilotusageuserdetail?view=graph-rest-beta –
  JSON-Form `GET /beta/reports/getMicrosoft365CopilotUsageUserDetail(period='D7')?$format=application/json`, Felder
  `reportRefreshDate, userPrincipalName, displayName, lastActivityDate, copilotChatLastActivityDate,
  microsoftTeamsCopilotLastActivityDate, wordCopilotLastActivityDate, excelCopilotLastActivityDate,
  powerPointCopilotLastActivityDate, outlookCopilotLastActivityDate, oneNoteCopilotLastActivityDate, loopCopilotLastActivityDate`.
  v1.0 GA: learn.microsoft.com/microsoft-365/copilot/extensibility/api/admin-settings/reports/copilotreportroot-getmicrosoft365copilotusageuserdetail –
  `GET /v1.0/copilot/reports/getMicrosoft365CopilotUsageUserDetail(period='D7')`, Antwort CSV. Rechte: Reports.Read.All
  + Rolle (z. B. Reports Reader, AI Administrator). Nur Nutzer mit Copilot-Lizenz; Namen ggf. gehasht (Admin-Einstellung).
- Plugin ruft `/v1.0/reports/…(period='D30')?$format=application/json` (wie beauftragt) und fällt bei 400/404 auf `/beta/reports/…` zurück.
- Weg B (Enterprise-App, Client Credentials): `POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` mit
  `client_id`, `client_secret`, `scope=https://graph.microsoft.com/.default`, `grant_type=client_credentials`
  (learn.microsoft.com/entra/identity-platform/v2-oauth2-client-creds-grant-flow). App-Tokens haben kein `/me`; stattdessen
  `/v1.0/users/{upn}/licenseDetails` und `/v1.0/users/{upn}` (Application `User.Read.All`), `/v1.0/directory/subscriptions`
  (Application `Organization.Read.All`), Bericht (Application `Reports.Read.All`, keine Rolle nötig). Rechte stehen nach
  Admin-Consent im `roles`-Claim des Tokens; fehlt Consent, wird trotzdem ein Token ausgestellt, Graph antwortet 403.
  AADSTS-Codes: 7000215 Secret falsch, 7000222 Secret abgelaufen, 700016 App nicht im Tenant, 65001/500011 Consent bzw.
  Ressource fehlt. Nicht live getestet.

## Grok-Abo (grok CLI 1.0.70, live 2026-10-25, ohne Abo)
- Keine offizielle API; die Endpunkte nutzt die grok CLI selbst. Inoffiziell, Cloudflare davor, AGB-Risiko.
- **`~/.grok/auth.json`** (nach `grok login`): Objekt, Schlüssel `"<issuer>::<client-id>"` (z. B. `"https://auth.x.ai::<uuid>"`).
  Je Eintrag: `auth_mode` (`"oidc"`), `key` (Access-Token, JWT ~900 Zeichen), `expires_at` (ISO mit Mikrosekunden, z. B.
  `…T04:24:58.479276Z`), `refresh_token`, `oidc_issuer` (`https://auth.x.ai`), `oidc_client_id`, `principal_type` (`User`),
  `principal_id`, `user_id`, `team_id` (null), `email`, `first_name`, `last_name`, `profile_image_asset_id`, `create_time`,
  `coding_data_retention_opt_out`. **Kein** Feld `access_token`. Plugin liest `key`, akzeptiert `access_token`/`accessToken`
  (ältere Versionen, auch flach auf oberster Ebene) und nimmt bei mehreren Einträgen den mit dem spätesten `expires_at`
  (ISO, Unix-Sekunden oder -Millisekunden).
- **Refresh** (nicht live getestet, Token war gültig): `POST ${oidc_issuer}/oauth2/token`, form-encoded
  `grant_type=refresh_token`, `client_id=<oidc_client_id>`, `refresh_token=<refresh_token>`; erwartet `access_token`,
  `expires_in`, ggf. neues `refresh_token`. Zurückschreiben nur bei Erfolg, nur `key`/`expires_at`/`refresh_token` im selben
  Eintrag; unbekannte Felder bleiben, da die CLI dieselbe Datei pflegt.
- **`GET https://cli-chat-proxy.grok.com/v1/billing?format=credits`** (Bearer `key`) → 200:
  `{"config":{"currentPeriod":{"type":"USAGE_PERIOD_TYPE_WEEKLY","start":"…T00:00:00+00:00","end":"…T00:00:00+00:00"},
  "onDemandCap":{"val":0},"onDemandUsed":{"val":0},"isUnifiedBillingUser":true,"prepaidBalance":{"val":0},
  "topUpMethod":"TOP_UP_METHOD_SAVED_PAYMENT_METHOD","billingPeriodStart":"…","billingPeriodEnd":"…"}}`.
  Fenster Mo 00:00 UTC bis Mo 00:00 UTC. **Kein `creditUsagePercent`** ohne Abo (Feldname aus Community-Quellen, UNVERIFIED).
  Einheit der `{val}`-Beträge UNVERIFIED (alle 0); angenommen Cent wie bei der Management-API.
- **`GET https://cli-chat-proxy.grok.com/v1/user?include=subscription`** → 200: `userId, email, firstName, lastName,
  principalType, teamId (null), organizationId (null), hasGrokCodeAccess (true), subscriptionTier (null)`.
- **`GET https://grok.com/rest/subscriptions`** (gleicher Bearer) → 200 `{"subscriptions":[]}`. Form eines Eintrags mit Abo
  UNVERIFIED; Plugin sucht `name`, `tier`, `plan`, `productName`, `subscriptionTier`.

## Elgato SDK
- npm registry heute: @elgato/streamdeck 3.0.3 (engines node >=20.5.1), @elgato/cli 1.10.3. Manifest: SDKVersion 3, Nodejs.Version "20"|"24", Software.MinimumVersion "7.1", CodePath bin/plugin.js,
  Controllers ["Keypad"] (+"Encoder" mit Encoder.layout $B1 für Stream Deck +). Kein Scheduler-API → setInterval im Plugin-Prozess.

Quellen: platform.claude.com/docs/en/manage-claude/usage-cost-api · developers.openai.com/cookbook/examples/completions_usage_api · docs.x.ai/developers/rest-api-reference/management/billing · ai.google.dev/gemini-api/docs/billing · docs.github.com/en/rest/billing/usage · docs.elgato.com/streamdeck/sdk/references/manifest
