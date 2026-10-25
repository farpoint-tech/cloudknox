# AI Usage Deck — Stream Deck Plugin (Spec v1, 2026-10-25)

## Ziel
Ein Stream-Deck-Plugin (Elgato SDK v2, Node 20+, TypeScript), das pro Anbieter
Abo-Verbrauch UND Abo-Kosten anzeigt (API-Kosten nur optional, Enterprise/Teams). Eine Taste je Anbieter, eine Übersichtstaste.
Abgleich: bei jedem Refresh (Abo-Limits) plus voller Kosten-Abgleich jeden Sonntag 20:00 lokal.

Plugin-UUID: `tech.farpoint.ai-usage`  — Ablage: `streamdeck-ai-usage/` (dieser Ordner)

## Verifizierte Datenquellen (live getestet 2026-10-25)

### Claude / Claude Code (Abo)  ✅
- GET https://api.anthropic.com/api/oauth/usage
- Headers: `Authorization: Bearer <accessToken>`, `anthropic-beta: oauth-2025-04-20`, `Accept: application/json`
- Token: macOS Keychain `security find-generic-password -s "Claude Code-credentials" -a <user> -w`
  → JSON `.claudeAiOauth.accessToken`, `.expiresAt` (ms), `.subscriptionType` ("max"), `.refreshToken`
  Fallback-Datei `~/.claude/.credentials.json`. Nie den Refresh selbst machen wenn Claude Code läuft — bei 401 "Claude Code öffnen" anzeigen.
- Response: `five_hour.utilization` (%), `five_hour.resets_at`, `seven_day.utilization`, `seven_day.resets_at`,
  `extra_usage.{is_enabled,monthly_limit,used_credits,utilization,currency,decimal_places,disabled_reason,spend_limit_reached}`,
  `limits[]` mit `kind` session/weekly_all, `spend.{used,limit}.{amount_minor,currency,exponent}`.
  Objekte der obersten Ebene mit `limit_dollars/used_dollars/remaining_dollars/utilization/resets_at` (heute `iguana_necktie`:
  250 / 251,21 $, Reset 2026-11-05) → Kosten-Posten „Budget“, Namen nicht fest verdrahtet (siehe „Kosten“).
- Lokale Tokens: `~/.claude/projects/**/*.jsonl` — Zeilen mit `message.usage` {input_tokens, cache_creation_input_tokens,
  cache_read_input_tokens, output_tokens}, `message.model`, `timestamp`. Dedupe über `message.id`+`requestId`.

### ChatGPT / Codex (Abo)  ✅
- GET https://chatgpt.com/backend-api/wham/usage
- Headers: `Authorization: Bearer <tokens.access_token>`, `ChatGPT-Account-Id: <tokens.account_id>`
- Token: `~/.codex/auth.json` → `.tokens.access_token`, `.tokens.account_id`, `.OPENAI_API_KEY` (optional)
- Response: `plan_type`, `rate_limit.primary_window.{used_percent,limit_window_seconds,reset_at}`,
  `rate_limit.secondary_window` (kann null), `credits.{has_credits,unlimited,overage_limit_reached,balance}`,
  `spend_control.{reached,individual_limit}`, `rate_limit_reset_credits.{available_count}`
- Lokale Tokens: `~/.codex/sessions/YYYY/MM/DD/*.jsonl` — `payload.type=="token_count"` →
  `payload.info.total_token_usage` (letzter Wert je Session = Sessionsumme), `payload.rate_limits`.

### GitHub Copilot (Abo, Anzeige „GH Copilot“ / Kürzel `GH`, Provider-ID bleibt `copilot`)  ✅ (gh-Token seit 2026-10-25 wieder gültig)
- GET https://api.github.com/copilot_internal/user, `Authorization: Bearer <gh-token>`, `Accept: application/json`
- Token: `gh auth token` (Keychain-Eintrag `gh:github.com`). Stand 2026-10-25: gh meldet "token in keyring is invalid" →
  Nutzer muss `gh auth refresh -h github.com` ausführen. Plugin zeigt dann "gh login".
  NICHT den Keychain-Eintrag `github-copilot-app` lesen (löst Keychain-Dialog aus).
- Response (live 2026-10-25): `quota_snapshots.{premium_interactions,chat,completions}.{entitlement,remaining,percent_remaining,unlimited,overage_count,overage_permitted}`, `quota_reset_date`, `copilot_plan`.
- Lokale Tokens: `~/.copilot/data.db` (SQLite) Tabelle `sessions` → `total_input_tokens,total_output_tokens,total_cached_tokens,model,created_at,updated_at`.

### Microsoft 365 Copilot (Lizenz, Provider-ID `m365copilot`, Anzeige „M365 Copilot“ / Kürzel `M365`)  ⚠️ nicht live getestet
- Token: `az account get-access-token --tenant <tenantId> --resource-type ms-graph --query accessToken -o tsv` per execFile,
  20 s Timeout, `az` aus PATH + `/opt/homebrew/bin` + `/usr/local/bin`. Kein Token → Status `login`, Detail
  `az login --tenant <id> --scope https://graph.microsoft.com//.default` (Taste: `az login`). Nur AADSTS-Codes aus stderr werden übernommen.
- Tenant: Setting `tenantId` der Anbieter-Taste (GUID oder Domain, validiert), gespeichert in `state.json` → `m365TenantId`;
  Fallback `AI_USAGE_DECK_M365_TENANT`. Fehlt/ungültig → neuer Status `config` („Setup fehlt“), kein az-Aufruf.
  Tenant-Wechsel löscht `lastSub`/`subGate` von `m365copilot`.
- Abrufe (GET, über `subgate.ts`, jeder degradiert einzeln; nur 1. bestimmt den Status):
  1. `/v1.0/me/licenseDetails?$select=skuPartNumber,skuId` → Lizenz ja, wenn eine `skuPartNumber` „COPILOT“ enthält.
     `primary = {label "Lizenz", text "ja"|"nein", pct 0, resetAt}`; `Window.text` ersetzt die Prozentanzeige, kein Balken. `plan` = SKU(s).
  2. `/v1.0/directory/subscriptions?$select=skuPartNumber,nextLifecycleDateTime,totalLicenses,status` → frühestes künftiges
     `nextLifecycleDateTime` aktiver Copilot-SKUs = ResetEvent `Verlängerung`; Summe `totalLicenses` = CostItem `Lizenz`
     (`info: true`, zählt nicht für die Kosten-Zeile der Übersicht). 403 → still, Detail `Verlängerung: keine Berechtigung`.
  3. `/v1.0/me?$select=userPrincipalName` + `/v1.0/reports/getMicrosoft365CopilotUsageUserDetail(period='D30')?$format=application/json`
     (bei 400/404 Fallback `/beta/reports/…`, laut Learn die dokumentierte JSON-Form; v1.0 GA liegt unter `/v1.0/copilot/reports/…` als CSV).
     Zeile per UPN (ohne Groß/Klein), Folgeseiten nur über `graph.microsoft.com`-nextLinks. Apps = Felder
     `microsoftTeams|word|excel|powerPoint|outlook|oneNote|loop…CopilotLastActivityDate`, `copilotChatLastActivityDate`
     mit Datum ≥ `reportRefreshDate` − 30 Tage → `SubPart.activity {status, apps, lastActivity}`. 403 → `forbidden`,
     Detail `Nutzung: keine Berechtigung`; gehashte UPNs → `concealed`.
  Bericht + Subscriptions 30 min Prozess-Cache je Tenant.
- Tokens: `n/v` (Microsoft veröffentlicht keine Token-Zahlen); die Tokens-Anzeige zeigt stattdessen `activity`.
  Kosten: `Lizenz` mit Anzahl, sonst `n/v`. API-Kosten: keine.

### Gemini (Abo)  ⚠️ nur teilweise
- Gemini-CLI-OAuth (`~/.gemini/oauth_creds.json`, access_token, refresh_token, expiry_date) → POST
  https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota liefert 403 SUBSCRIPTION_REQUIRED (Code Assist individual
  ist für diesen Client abgekündigt, Verweis auf Antigravity). loadCodeAssist antwortet, aber ohne Quota.
- Google AI Pro/Ultra-Abo hat keinen bekannten öffentlichen Quota-Endpunkt. Community-Plugins nutzen den Antigravity-Login
  (eigener OAuth-PKCE-Flow) + retrieveUserQuota → `buckets[].{modelId,remainingFraction,resetTime}`. Phase 2, nicht v1.
- v1: lokale Tokens aus `~/.gemini/tmp/*/chats/session-*.jsonl` (Felder prüfen, Usage-Zeilen falls vorhanden) + Status "Quota: n/v".

### Grok (Abo)  ⚠️ keine Anmeldung vorhanden
- grok CLI 1.0.41 installiert, aber `~/.grok/auth.json` fehlt (CLI läuft über lokalen Proxy 127.0.0.1:6767).
- Community-Weg: `~/.grok/auth.json` OIDC-Token (Refresh via https://auth.x.ai/oauth2/token), dann
  GET https://cli-chat-proxy.grok.com/v1/billing?format=credits (`creditUsagePercent`, currentPeriod),
  `/v1/user?include=subscription`, https://grok.com/rest/subscriptions. Implementieren, aber "grok login" anzeigen bis Datei da ist.

### Kosten (Abo-Kosten statt API)  ✅ live 2026-10-25
Entscheidung Inhaber: nur persönliche Abos, Admin-Schlüssel gibt es nur für Enterprise/Teams. Metrik `kosten` ersetzt `api`
im Zyklus `auto|sub|tokens|kosten`. Quelle sind die ohnehin geholten Abo-Antworten; `SubPart.cost: CostItem[]` wird mit
`lastSub` gespeichert (Stale-Regeln des Gates unverändert).
- `CostItem {label, used?, limit?, currency?, pct?, state?, resetAt?, reached?, unlimited?, note?}` (`src/providers/types.ts`),
  Formatierung in `src/cost.ts`.
- Claude `extra_usage` → `Extra`: `used_credits`/`monthly_limit` ÷ 10^`decimal_places` (2500 bei 2 Stellen = 25,00 €,
  bestätigt durch `spend.limit.amount_minor 2500, exponent 2`), `state` „aus“ wenn `!is_enabled` (`note` = `disabled_reason`),
  „Limit erreicht“ bei `spend_limit_reached`.
- Claude Budgets → `Budget`: jedes Objekt der obersten Ebene (kein Array) mit `limit_dollars > 0`; `pct` = `utilization`,
  sonst used/limit; `reached` bei used ≥ limit oder `remaining_dollars == 0`; `resets_at` zusätzlich als ResetEvent `Budget`.
- Codex → `Credits` (`balance`, Limit `spend_control.individual_limit`, „unbegrenzt“, „Limit erreicht“ bei `spend_control.reached`
  oder `credits.overage_limit_reached`), `Reset-Credits` nur bei `available_count > 0`.
- Copilot → `Overage` (`premium_interactions.overage_count`, „aus“ wenn `!overage_permitted`).
- Gemini/Grok → `n/v`.
- Taste: Betrag groß (`251 / 250 $`), Label/Limit klein (`Budget 100%`, `Extra aus`), Balken aus `pct`, unten Reset oder
  Alter, `· +N` für weitere Posten. Gezeigt wird ein Posten mit erreichtem Limit, sonst einer > 0, sonst der erste.
- Übersicht: sechs Anbieterzeilen; Kosten-Zeile (siebte) nur wenn ein Posten > 0 oder ein Limit erreicht ist (`CL 251 / 250 $`, gelb bei Limit).
- CLI `status`: Spalte „Kosten“ statt „API Monat“.

### API-Kosten (optional, nur Enterprise/Teams)  — Schlüssel nötig, Details aus RESEARCH.md
- Standard aus. Eingeschaltet je Taste über Setting `showApiCost` (Zyklus dann `…|kosten|api`); nur dann werden die
  Keychain-Dienste gelesen. Eingeschaltete Anbieter → `state.json` `apiProviders` (für den Sonntagsabgleich).
  CLI: `status --api`, `sync --api`, `doctor --api`; `doctor` führt die Schlüssel sonst ungeprüft als `info` unter
  „optional (nur Enterprise/Teams)“.
- Anthropic Admin API cost_report (Admin-Key `sk-ant-admin…`, Keychain-Dienst `anthropic-admin`)
- OpenAI organization costs (Admin-Key, Keychain-Dienst `openai-admin`)
- xAI (Keychain-Dienst `xai-api`) — falls Endpunkt existiert
- Gemini API — laut Research; sonst "n/v"
- Schlüssel ausschließlich per `security find-generic-password -s <dienst> -w`. Fehlt der Eintrag bei eingeschaltetem
  `showApiCost` → Taste zeigt "Key fehlt", kein Fehler-Spam. Anlegen durch Nutzer: `bash tools/apikey_setzen.sh <dienst>`.

## Architektur
```
streamdeck-ai-usage/
  tech.farpoint.ai-usage.sdPlugin/   # Build-Output (manifest.json, bin/plugin.js, imgs/, ui/)
  src/
    plugin.ts                        # Entry, registriert Actions, startet Scheduler
    providers/{claude,codex,copilot,m365copilot,gemini,grok}.ts   # je: subscription(), localTokens(), apiCost()
    providers/types.ts               # ProviderSnapshot {sub:{pct,resetAt,label}, tokens:{in,out,cached}, api:{usd,month}, status}
    collectors/{claude-jsonl,codex-jsonl,copilot-sqlite,gemini-jsonl}.ts   # inkrementell, Offsets in state
    keychain.ts                      # security find-generic-password Wrapper, 5s timeout, nie interaktiv (-a <user>)
    scheduler.ts                     # refresh je Anbieter 120s ±10s (Abo, 55-s-Cache + 429-Cooldown in subgate.ts), 15min (lokale Tokens), Sonntag 20:00 voller API-Abgleich
    store.ts                         # ~/.config/ai-usage-deck/state.json + history.jsonl (Wochen-Snapshots)
    actions/provider-key.ts          # Key-Action: Settings {provider, metric: auto|sub|tokens|kosten|api, showApiCost}
    cost.ts                          # Kosten-Posten: Betrag/Label-Formatierung, Auswahl, CLI-Text
    actions/overview-key.ts          # alle Anbieter kompakt
    actions/resets-key.ts            # "Nächste Resets" (tech.farpoint.ai-usage.resets), Blink-Timer 1 s
    resets.ts                        # ResetEvent-Auswahl, Sortierung, Blink-Regel, Countdown-/Ortszeit-Format
    render.ts                        # SVG-Kacheln 144x144: Anbieterlogo-Kürzel, %-Balken, Reset-Countdown, €/$ Betrag
  tools/sync-now.sh                  # manueller Vollabgleich (ruft Plugin-Collector als CLI: node bin/cli.js sync)
  README.md, SPEC.md, RESEARCH.md
```
- Build: `@elgato/cli` (npx) + rollup/esbuild, `@elgato/streamdeck` v1.x. Software.MinimumVersion "6.5".
- Keine externen Runtime-Deps außer `better-sqlite3`-Alternative: `node:sqlite` (Node 22+) oder `sqlite3` CLI per execFile — CLI bevorzugen, kein Native-Build.
- Taste-Druck: Refresh sofort. Langer Druck: Umschalten Metrik (Abo % / Tokens heute / Kosten; API nur mit `showApiCost`).
- Fehlerzustände sichtbar: "login", "Key fehlt", "offline", "n/v" — nie leere Kachel, nie stale ohne Alter (zeige "vor 3h").
- Wochen-Sync Sonntag 20:00: im Plugin-Scheduler (setInterval + Zeitfenster-Check, Nachholen beim Start wenn verpasst)
  UND launchd-Agent `tech.farpoint.ai-usage.sync.plist` als Backup, der `node bin/cli.js sync` ausführt.
- Sync schreibt `history.jsonl`: {week, provider, sub_pct_max, tokens_week, api_usd_month_to_date}.

## Action „Nächste Resets“ (UUID `tech.farpoint.ai-usage.resets`)
- Daten: `ResetEvent {provider, window, resetsAt (ISO), pct?}`; jeder Anbieter legt seine Liste in `SubPart.resets`
  ab (wird mit `lastSub` in state.json gespeichert). Quellen: Claude `five_hour.resets_at` → `5h`, `seven_day.resets_at`
  → `Woche`, `extra_usage` → `Extra` nur wenn ein Reset-Feld da ist; Codex `primary_window`/`secondary_window.reset_at`,
  Name aus `limit_window_seconds`; Copilot `quota_reset_date` → `Monat`; M365 Copilot `nextLifecycleDateTime` → `Verlängerung`; Grok `currentPeriod.end` → `Monat`; Gemini keine.
- `Hub.allResets(now)`: letzte bekannte Resets je Anbieter (bleiben bei login/Cooldown erhalten), nur Zeitpunkte > now,
  aufsteigend sortiert. Alte state.json ohne `resets` → aus `primary`/`secondary` abgeleitet.
- Taste 144×144 SVG: die zwei nächsten Resets (Name, `in 2h 13m` / `in 3d 4h`, `So 21:00` / `Mi 04.11.`),
  Badge `+N` oben rechts für weitere, `keine Resets` wenn leer.
- Blink: Setting `blinkWindowHours` (Standard 24, Property Inspector `ui/resets.html`). Mehr als 2 Resets in
  (now, now + Fenster] → Wechsel normal/gelb (#F5A524) jede Sekunde; Timer in `onWillAppear` gestartet, in
  `onWillDisappear` gelöscht; bei ≤ 2 normales Bild.
- Kurz drücken: `refreshSub(force)`. Lang drücken (≥ 600 ms): Blinken 1 h stumm / wieder an (nur im Speicher).
- CLI: `node bin/cli.js resets [--window <h>]` listet alle anstehenden Resets aufsteigend und meldet die Blink-Bedingung.

## Nicht in v1
Grok Abo ohne auth.json, Gemini Abo-Quota (Antigravity-Login), Copilot Overage-Abrechnung in Dollar (nur Anzahl `overage_count`).
