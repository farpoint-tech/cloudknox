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

## Grok-Abo (grok.com): nichts Belastbares
- Keine offizielle API; Community-Wege via grok CLI auth.json + cli-chat-proxy.grok.com/v1/billing (siehe SPEC) — fragil, Cloudflare, AGB-Risiko. v1: nur wenn ~/.grok/auth.json existiert, sonst "grok login".

## Elgato SDK
- npm registry heute: @elgato/streamdeck 3.0.3 (engines node >=20.5.1), @elgato/cli 1.10.3. Manifest: SDKVersion 3, Nodejs.Version "20"|"24", Software.MinimumVersion "7.1", CodePath bin/plugin.js,
  Controllers ["Keypad"] (+"Encoder" mit Encoder.layout $B1 für Stream Deck +). Kein Scheduler-API → setInterval im Plugin-Prozess.

Quellen: platform.claude.com/docs/en/manage-claude/usage-cost-api · developers.openai.com/cookbook/examples/completions_usage_api · docs.x.ai/developers/rest-api-reference/management/billing · ai.google.dev/gemini-api/docs/billing · docs.github.com/en/rest/billing/usage · docs.elgato.com/streamdeck/sdk/references/manifest
