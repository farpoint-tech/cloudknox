# AI Usage Deck — Stream Deck Plugin (Spec v1, 2026-10-25)

## Ziel
Ein Stream-Deck-Plugin (Elgato SDK v2, Node 20+, TypeScript), das pro Anbieter
Abo-Verbrauch UND API-Kosten anzeigt. Eine Taste je Anbieter, eine Übersichtstaste.
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
  `extra_usage.{is_enabled,monthly_limit,used_credits,utilization,currency}`, `limits[]` mit `kind` session/weekly_all.
  Sonstige Felder (iguana_necktie etc.) ignorieren.
- Lokale Tokens: `~/.claude/projects/**/*.jsonl` — Zeilen mit `message.usage` {input_tokens, cache_creation_input_tokens,
  cache_read_input_tokens, output_tokens}, `message.model`, `timestamp`. Dedupe über `message.id`+`requestId`.

### ChatGPT / Codex (Abo)  ✅
- GET https://chatgpt.com/backend-api/wham/usage
- Headers: `Authorization: Bearer <tokens.access_token>`, `ChatGPT-Account-Id: <tokens.account_id>`
- Token: `~/.codex/auth.json` → `.tokens.access_token`, `.tokens.account_id`, `.OPENAI_API_KEY` (optional)
- Response: `plan_type`, `rate_limit.primary_window.{used_percent,limit_window_seconds,reset_at}`,
  `rate_limit.secondary_window` (kann null), `credits.balance`
- Lokale Tokens: `~/.codex/sessions/YYYY/MM/DD/*.jsonl` — `payload.type=="token_count"` →
  `payload.info.total_token_usage` (letzter Wert je Session = Sessionsumme), `payload.rate_limits`.

### GitHub Copilot (Abo)  ⚠️ Token aktuell ungültig
- GET https://api.github.com/copilot_internal/user, `Authorization: Bearer <gh-token>`, `Accept: application/json`
- Token: `gh auth token` (Keychain-Eintrag `gh:github.com`). Stand 2026-10-25: gh meldet "token in keyring is invalid" →
  Nutzer muss `gh auth refresh -h github.com` ausführen. Plugin zeigt dann "gh login".
  NICHT den Keychain-Eintrag `github-copilot-app` lesen (löst Keychain-Dialog aus).
- Response (laut Community): `quota_snapshots.premium_interactions.{entitlement,remaining,percent_remaining,unlimited}`, `quota_reset_date`, `copilot_plan`.
- Lokale Tokens: `~/.copilot/data.db` (SQLite) Tabelle `sessions` → `total_input_tokens,total_output_tokens,total_cached_tokens,model,created_at,updated_at`.

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

### API-Kosten (Monat bis heute)  — Schlüssel nötig, Details aus RESEARCH.md
- Anthropic Admin API cost_report (Admin-Key `sk-ant-admin…`, Keychain-Dienst `anthropic-admin`)
- OpenAI organization costs (Admin-Key, Keychain-Dienst `openai-admin`)
- xAI (Keychain-Dienst `xai-api`) — falls Endpunkt existiert
- Gemini API — laut Research; sonst "n/v"
- Schlüssel ausschließlich per `security find-generic-password -s <dienst> -w`. Fehlt der Eintrag → Taste zeigt "Key fehlt",
  kein Fehler-Spam. Anlegen durch Nutzer: `bash tools/apikey_setzen.sh <dienst>`.

## Architektur
```
streamdeck-ai-usage/
  tech.farpoint.ai-usage.sdPlugin/   # Build-Output (manifest.json, bin/plugin.js, imgs/, ui/)
  src/
    plugin.ts                        # Entry, registriert Actions, startet Scheduler
    providers/{claude,codex,copilot,gemini,grok}.ts   # je: subscription(), localTokens(), apiCost()
    providers/types.ts               # ProviderSnapshot {sub:{pct,resetAt,label}, tokens:{in,out,cached}, api:{usd,month}, status}
    collectors/{claude-jsonl,codex-jsonl,copilot-sqlite,gemini-jsonl}.ts   # inkrementell, Offsets in state
    keychain.ts                      # security find-generic-password Wrapper, 5s timeout, nie interaktiv (-a <user>)
    scheduler.ts                     # refresh je Anbieter 120s ±10s (Abo, 55-s-Cache + 429-Cooldown in subgate.ts), 15min (lokale Tokens), Sonntag 20:00 voller API-Abgleich
    store.ts                         # ~/.config/ai-usage-deck/state.json + history.jsonl (Wochen-Snapshots)
    actions/provider-key.ts          # Key-Action: Settings {provider, metric: sub|tokens|api|auto}
    actions/overview-key.ts          # alle Anbieter kompakt
    actions/resets-key.ts            # "Nächste Resets" (tech.farpoint.ai-usage.resets), Blink-Timer 1 s
    resets.ts                        # ResetEvent-Auswahl, Sortierung, Blink-Regel, Countdown-/Ortszeit-Format
    render.ts                        # SVG-Kacheln 144x144: Anbieterlogo-Kürzel, %-Balken, Reset-Countdown, €/$ Betrag
  tools/sync-now.sh                  # manueller Vollabgleich (ruft Plugin-Collector als CLI: node bin/cli.js sync)
  README.md, SPEC.md, RESEARCH.md
```
- Build: `@elgato/cli` (npx) + rollup/esbuild, `@elgato/streamdeck` v1.x. Software.MinimumVersion "6.5".
- Keine externen Runtime-Deps außer `better-sqlite3`-Alternative: `node:sqlite` (Node 22+) oder `sqlite3` CLI per execFile — CLI bevorzugen, kein Native-Build.
- Taste-Druck: Refresh sofort. Langer Druck: Umschalten Metrik (Abo % / Tokens heute / API € Monat).
- Fehlerzustände sichtbar: "login", "Key fehlt", "offline", "n/v" — nie leere Kachel, nie stale ohne Alter (zeige "vor 3h").
- Wochen-Sync Sonntag 20:00: im Plugin-Scheduler (setInterval + Zeitfenster-Check, Nachholen beim Start wenn verpasst)
  UND launchd-Agent `tech.farpoint.ai-usage.sync.plist` als Backup, der `node bin/cli.js sync` ausführt.
- Sync schreibt `history.jsonl`: {week, provider, sub_pct_max, tokens_week, api_usd_month_to_date}.

## Action „Nächste Resets“ (UUID `tech.farpoint.ai-usage.resets`)
- Daten: `ResetEvent {provider, window, resetsAt (ISO), pct?}`; jeder Anbieter legt seine Liste in `SubPart.resets`
  ab (wird mit `lastSub` in state.json gespeichert). Quellen: Claude `five_hour.resets_at` → `5h`, `seven_day.resets_at`
  → `Woche`, `extra_usage` → `Extra` nur wenn ein Reset-Feld da ist; Codex `primary_window`/`secondary_window.reset_at`,
  Name aus `limit_window_seconds`; Copilot `quota_reset_date` → `Monat`; Grok `currentPeriod.end` → `Monat`; Gemini keine.
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
Grok Abo ohne auth.json, Gemini Abo-Quota (Antigravity-Login), Copilot Overage-Abrechnung.
