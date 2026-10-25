# AI Usage Deck – Stream-Deck-Plugin

Zeigt pro Anbieter (Claude, ChatGPT/Codex, GitHub Copilot, Gemini, Grok) den Abo-Verbrauch, die lokal
gezählten Tokens und die API-Kosten des laufenden Monats. Plugin-UUID `tech.farpoint.ai-usage`,
Stream Deck ab 7.1, nur macOS, Node 24 (vom Stream-Deck-Programm mitgeliefert).

## Tasten

### „Anbieter“
Einstellungen im Property Inspector: **Anbieter** und **Anzeige** (`auto`, `Abo-Limit %`, `Tokens heute`, `API-Kosten Monat`).

| Zeile | Inhalt |
|---|---|
| oben | Anbieterkürzel (CLAUDE, CODEX, COPILOT, GEMINI, GROK) |
| Mitte groß | Abo: Fenster + Prozent, z. B. `5h 36%` · Tokens: `1,3M` · API: `$ 12,40` |
| darunter | Abo: zweites Fenster (`Wo 7%`) · Tokens: `heute · Wo 33M` · API: `API 2026-10` |
| Balken | Auslastung des Hauptfensters (grün < 70 %, gelb < 90 %, rot) – nur bei Abo |
| unten | Abo: Zeit bis Reset (`↻ 2h14`); veralteter Abo-Wert: `~ vor 12m`; sonst Alter der Daten (`vor 3m`) |
| oben rechts | gelbe Sanduhr: Abo-Endpunkt pausiert nach 429/5xx (Cooldown) |

- **Kurz drücken:** sofort aktualisieren (Abo, Tokens, API für diesen Anbieter). Ein erzwungener Abo-Abruf höchstens
  alle 30 s je Anbieter; ein laufender Cooldown nach 429/5xx wird auch durch Drücken nicht übergangen.
- **Lang drücken (≥ 0,6 s):** Anzeige wechseln auto → Abo → Tokens → API.
- **Stream Deck + (Drehregler, Layout `$B1`):** Drehen wechselt die Anzeige, Drücken aktualisiert.
- `auto` zeigt Abo, wenn ein Abo-Wert existiert, sonst Tokens, sonst API.
- Fällt eine Abo-Abfrage aus (429, 5xx, offline, unerwartete Antwort), bleibt der letzte gute Wert grau stehen,
  unten steht `~` und sein Alter (`~ vor 12m`). `Fehler` erscheint nur, wenn es noch nie einen guten Wert gab.

Statustexte: `login` (Anmeldung fehlt/abgelaufen), `Key fehlt` (Keychain-Eintrag nicht angelegt),
`offline`, `n/v` (für diesen Anbieter gibt es die Quelle nicht), `veraltet` (letzter guter Wert, CLI),
`Fehler` (unerwartete Antwort, noch nie ein guter Wert).

**Tokens** = Input + Cache-Write + Output. Cache-Reads werden getrennt gezählt (CLI zeigt `+… cache`),
weil sie bei Claude und Codex das Hundertfache ausmachen und die Zahl sonst nichtssagend wird.

**API-Beträge** kommen von allen Anbietern in US-Dollar und werden als `$` angezeigt (keine Umrechnung in €).

### „Übersicht“
Fünf Zeilen, je Anbieter Kürzel + Abo-Prozent mit Minibalken bzw. Statustext. Drücken aktualisiert alles.

### „Nächste Resets“
Zeigt die zwei nächsten Abo-Resets aller Anbieter, je Reset drei Zeilen:

| Zeile | Inhalt |
|---|---|
| Name (Anbieterfarbe) | Anbieter + Fenster, z. B. `Claude 5h`, `Codex Woche`, `Copilot Monat`, `Claude Extra` |
| groß | Countdown: `in 13m`, `in 2h 13m`, `in 3d 4h` (abgerundet) |
| klein | Ortszeit: `So 21:00` (innerhalb der nächsten 6 Tage), sonst `Mi 04.11.` |
| oben rechts | gelbes Badge `+N`: so viele weitere Resets stehen an, passen aber nicht auf die Taste |

Steht nichts an, zeigt die Taste `keine Resets`. Vergangene Resets fallen beim Zeichnen weg. Die Reset-Zeiten
stammen aus dem letzten guten Abo-Wert je Anbieter (`state.json` → `lastSub`), also auch während eines 429-Cooldowns
oder bei `login` – ein bekannter Reset-Zeitpunkt bleibt gültig, bis er vorbei ist.

**Blinken:** Fallen **mehr als 2** Resets in die nächsten `Blink-Fenster` Stunden, wechselt die Taste jede Sekunde
zwischen normaler und gelber Darstellung. Bei 2 oder weniger hört sie auf. Das Fenster stellt man im Property Inspector
ein (Feld **Blink-Fenster (h)**, Standard 24, Kommazahlen erlaubt, ungültig → 24). Ein Reset genau am Fensterende zählt mit.

- **Kurz drücken:** alle Abo-Werte sofort neu holen (gleiche 30-s-Sperre und Cooldown-Regeln wie bei „Anbieter“).
- **Lang drücken (≥ 0,6 s):** Blinken für 1 Stunde stummschalten, erneut lang drücken schaltet es wieder ein.
  Oben links steht dann `RESETS · stumm`. Die Stummschaltung gilt je Taste und übersteht Seitenwechsel, aber keinen
  Neustart des Plugins.
- Der Blink-Takt läuft als 1-s-Timer nur, solange die Taste sichtbar ist (`onWillAppear` startet, `onWillDisappear`
  stoppt ihn). Ein neues Bild wird nur gesendet, wenn sich etwas geändert hat (Countdown minütlich, Blinkphase).

## Abo-Laufzeiten

Welche Reset-Fenster jeder Anbieter hat und aus welchem Feld der Zeitpunkt kommt:

| Anbieter | Fenster auf der Taste | Länge | Feld |
|---|---|---|---|
| Claude | `5h` | 5 h rollierend | `five_hour.resets_at` (+ `five_hour.utilization`) |
| Claude | `Woche` | 7 Tage | `seven_day.resets_at` (+ `seven_day.utilization`) |
| Claude | `Extra` | monatlich (Extra Usage) | `extra_usage.resets_at` – nur wenn vorhanden. Die Live-Antwort vom 2026-10-25 hat **kein** Reset-Feld in `extra_usage` (nur `monthly_limit`, `used_credits`, `utilization`, `currency`), daher erscheint `Extra` derzeit nicht |
| Codex | `Woche` | 7 Tage (primäres Fenster) | `rate_limit.primary_window.reset_at` (Unix-Sekunden), Länge aus `limit_window_seconds` = 604800 |
| Codex | `5h` | 5 h, optional | `rate_limit.secondary_window.reset_at`; ist derzeit `null` und wird dann übersprungen |
| Copilot | `Monat` | monatlich | `quota_reset_date` (Datum, als 00:00 UTC gelesen) |
| Gemini | – | unbekannt | kein Quota-Endpunkt (siehe Grenzen) |
| Grok | `Monat` | unbekannt, vermutlich monatlich | `currentPeriod.end` von `/v1/billing` – nur mit `~/.grok/auth.json`, ungetestet |

Der Fenstername von Codex wird aus `limit_window_seconds` abgeleitet (≤ 24 h → `<n>h`, ≤ 8 Tage → `Woche`, sonst `Monat`).
Ältere `state.json`-Werte ohne Reset-Liste werden aus den Fenstern `primary`/`secondary` übernommen.

## Datenquellen

| Anbieter | Abo | Lokale Tokens | API-Kosten (Monat) |
|---|---|---|---|
| Claude | `api.anthropic.com/api/oauth/usage`, Token aus Keychain `Claude Code-credentials` (Fallback `~/.claude/.credentials.json`) | `~/.claude/projects/**/*.jsonl`, Dedupe über `message.id`+`requestId` | Admin-API `cost_report`, Keychain `anthropic-admin` |
| Codex | `chatgpt.com/backend-api/wham/usage`, Token aus `~/.codex/auth.json` | `~/.codex/sessions/**/*.jsonl`, `token_count`-Ereignisse als Differenzen | `api.openai.com/v1/organization/costs`, Keychain `openai-admin` |
| Copilot | `api.github.com/copilot_internal/user` mit `gh auth token` | `~/.copilot/data.db`, Tabelle `sessions` (per `/usr/bin/sqlite3`) | Premium-Request-Billing, Keychain `github-billing-pat` |
| Gemini | n/v (siehe Grenzen) | `~/.gemini/tmp/*/chats/session-*.jsonl` (Feld `tokens`), sonst n/v | n/v |
| Grok | `cli-chat-proxy.grok.com/v1/billing`, nur wenn `~/.grok/auth.json` existiert | n/v | xAI Management-API, Keychain `xai-management` + `xai-team-id` |

Lokale Logs werden inkrementell gelesen (Byte-Offsets und mtimes in `~/.config/ai-usage-deck/state.json`).
Der erste Lauf liest nur Dateien, die in den letzten 7 Tagen geändert wurden; ältere werden nur markiert.
Tagessummen werden 35 Tage aufbewahrt. Der Keychain-Eintrag `github-copilot-app` wird nie gelesen.

## API-Schlüssel anlegen (optional, nur für die API-Kosten)

Jeder Schlüssel über das verdeckte Eingabefenster in den Schlüsselbund:

```bash
bash ~/Documents/ClaudeCode-Terminal\&Scripting/tools/apikey_setzen.sh anthropic-admin     # sk-ant-admin01-…  (Anthropic Console → Admin Keys, nur Org-Konten)
bash ~/Documents/ClaudeCode-Terminal\&Scripting/tools/apikey_setzen.sh openai-admin        # sk-admin-…        (nur Org-Owner)
bash ~/Documents/ClaudeCode-Terminal\&Scripting/tools/apikey_setzen.sh github-billing-pat  # Fine-grained PAT „Plan: read“
bash ~/Documents/ClaudeCode-Terminal\&Scripting/tools/apikey_setzen.sh xai-management      # xAI Console → Management Keys
bash ~/Documents/ClaudeCode-Terminal\&Scripting/tools/apikey_setzen.sh xai-team-id         # Team-ID als „Passwort“
```

Das Plugin liest mit `security find-generic-password -s <dienst> -a supreme -w` (5 s Timeout, nie interaktiv).
Fehlt ein Eintrag, zeigt die Taste `Key fehlt` – kein Fehler. Prüfen: `node bin/cli.js doctor`.

## Bauen, installieren, neu starten

```bash
cd ~/Documents/ClaudeCode-Terminal\&Scripting/streamdeck-ai-usage
export npm_config_cache="$PWD/.npm-cache"
npm install
npm run build        # tech.farpoint.ai-usage.sdPlugin/bin/{plugin.js,cli.js} + bin/cli.js
npm test             # Parser-Tests (node --test)
bash tools/install.sh            # kopiert das .sdPlugin + lädt den launchd-Job
osascript -e 'quit app "Elgato Stream Deck"'; sleep 2; open -a "Elgato Stream Deck"
```

`install.sh --link` verlinkt statt zu kopieren (Entwicklung). Kopieren ist Standard, weil Stream Deck und
launchd sonst auf `~/Documents` zugreifen müssen (macOS-Datenschutzabfrage).
Lehnt Stream Deck `"Nodejs": {"Version": "24"}` ab, in `manifest.json` auf `"20"` setzen, neu bauen, neu installieren.
Logs des Plugins: `~/Library/Application Support/com.elgato.StreamDeck/Plugins/tech.farpoint.ai-usage.sdPlugin/logs/`.

## CLI

```bash
node bin/cli.js status            # Tabelle aller Anbieter (Abo, Abo-Quelle, Reset, Tokens heute/Woche, API Monat)
node bin/cli.js status --fresh    # wie status, aber Abo-Werte nicht aus dem 55-s-Cache (Cooldown gilt trotzdem)
node bin/cli.js sync              # Vollabgleich, hängt je Anbieter eine Zeile an history.jsonl
node bin/cli.js sync --scheduled  # wie sync, überspringt, wenn der Sonntag-20:00-Slot schon erledigt ist
node bin/cli.js doctor            # prüft jede Anmeldequelle: found / missing / invalid / warn (ohne Geheimnisse auszugeben)
node bin/cli.js resets            # alle anstehenden Resets aufsteigend (Anbieter, Fenster, Ortszeit, Countdown, Verbrauch) + Blink-Bedingung
node bin/cli.js resets --window 48  # wie resets, Blink-Fenster 48 h statt 24 h
```

Plugin und CLI nutzen denselben Code (`src/providers`, `src/collectors`). Umgebungsvariablen:
`AI_USAGE_DECK_HOME` (anderer Ordner für state/history), `NODE_USE_ENV_PROXY=1` (Node-`fetch` über `HTTPS_PROXY`).

## Zeitplan

| Was | Wann |
|---|---|
| Abo-Limits | je Anbieter alle 120 s ± 10 s (Start versetzt um 4 s je Anbieter), solange mindestens eine Taste sichtbar ist; ein guter Wert jünger als 55 s wird aus `state.json` wiederverwendet (Plugin und CLI teilen ihn) |
| Lokale Tokens | alle 15 min |
| API-Kosten | alle 6 h |
| Vollabgleich | Sonntag 20:00 lokal (im Plugin zwischen 20:00 und 20:59) + beim Start, wenn der letzte älter als 7 Tage ist; zusätzlich launchd `tech.farpoint.ai-usage.sync` (`sync --scheduled`) |

Ein Lock (`reconcile.lock`) und der Slot-Check verhindern doppelte Zeilen, wenn Plugin und launchd gleichzeitig laufen.
`history.jsonl`: `{ts, week, provider, sub_pct, sub_reset, tokens_week_in, tokens_week_out, tokens_week_cached, api_usd_mtd, status}`.

## Warum 429 und was tun

`GET api.anthropic.com/api/oauth/usage` ist rate-limitiert. Auf diesem Mac fragen sechs weitere
Stream-Deck-Plugins denselben Endpunkt ab – HTTP 429 ist deshalb der Normalfall,
kein Ausnahmefall:

- `com.saeedkolivand.claude-usage`
- `com.singerous.ai-limits`
- `kr.co.postgresql.ai-limits`
- `com.len.limits`
- `com.teamvrotek.claudepeak`
- `com.cocholabs.cladence-viewerdeck`

**Empfehlung:** die nicht genutzten dieser Plugins in der Stream-Deck-App deaktivieren bzw. ihre Tasten entfernen
(nichts löschen – Deinstallation ist nicht nötig). Jedes weitere Plugin, das pollt, verbraucht dasselbe Kontingent.

So geht dieses Plugin mit 429 um (gilt für alle Abo-Endpunkte: Claude, Codex, Copilot, Grok):

- **Cooldown je Anbieter:** bei 429 wird `Retry-After` gelesen (Sekunden oder HTTP-Datum, höchstens 6 h).
  Fehlt der Header: 5 min, bei Wiederholung 10, 20, 30 min (Obergrenze). Bei 5xx: 1, 2, 4, 8 min.
  Bis zum Ablauf wird der Endpunkt nicht aufgerufen – weder vom Plugin noch von der CLI noch von `doctor`.
  Der erste Erfolg setzt den Cooldown zurück. Gespeichert in `state.json` → `subGate`.
- **Letzter guter Wert:** jeder erfolgreiche Abruf landet mit `fetchedAt` in `state.json` → `lastSub`.
  Während des Cooldowns oder nach einem Fehler zeigt die Taste diesen Wert grau mit `~ vor 12m` und Sanduhr;
  CLI-Hinweis z. B. `429, erneut in 4m · Wert vor 12m`.
- **Geteilter Cache:** ist der letzte gute Wert jünger als 55 s, wird er wiederverwendet statt neu abzufragen
  (Plugin und CLI lesen dieselbe `state.json`). Die Spalte „Abo-Quelle“ der CLI zeigt `Netz`, `Cache (4 s alt)`
  oder `letzter Wert (12 min)`.
- **`doctor`** meldet 429 als `warn` mit „rate-limited (andere Plugins pollen denselben Endpunkt)“, nicht als `invalid`.

## Bekannte Grenzen

- **Grok:** kein Abo-Wert ohne `~/.grok/auth.json` (Taste `login`). Format dieser Datei und der Billing-Endpunkt
  sind Community-Wissen, ungetestet; kein Token-Refresh. Keine lokalen Token-Logs. xAI-API-Kosten:
  Einheit von `amountBeforeVat` als Cent angenommen (laut Doku, nicht mit echtem Konto geprüft).
- **Gemini:** Abo-Quota n/v (Code-Assist-Endpunkt antwortet 403, Antigravity-Login ist Phase 2).
  API-Kosten n/v (nur über BigQuery-Billing-Export). Lokale Tokens: Feldnamen aus dem gemini-cli-Quellcode;
  die vorhandene Chat-Datei enthält noch keine Antwort mit `tokens`, daher aktuell `n/v`.
- **Copilot:** `copilot_internal/user` ist inoffiziell. Bei Plan ohne Premium-Requests (Kontingent 0) zeigt die Taste
  Chat (`Chat 1%`) und Code-Vervollständigungen. Lokale Tokens: Tabelle `sessions` ist derzeit leer → `0`.
  Annahmen: `total_input_tokens` enthält Cache-Tokens; ein Sitzungs-Zuwachs wird dem Tag von `updated_at` zugerechnet.
- **Claude/Codex Abo-Endpunkte** sind inoffiziell und können sich ändern. Bei abgelaufenem Claude-Token zeigt
  die Taste `login` – das Plugin erneuert das Token nicht selbst (das macht Claude Code beim nächsten Start).
- API-Kosten-Abfragen (Anthropic, OpenAI, GitHub-Billing, xAI) sind implementiert, aber mangels Schlüssel nicht live getestet.
- Kacheln sind als SVG gerendert und nur per Test geprüft, noch nicht auf einem echten Stream Deck angesehen
  (auch die Sanduhr, der `~`-Marker und die Taste „Nächste Resets“ mit Blinken und `+N`-Badge nicht).
- „Nächste Resets“: Claude `Extra` erscheint erst, wenn die API ein Reset-Feld in `extra_usage` liefert (Feldname
  geraten: `resets_at`, `reset_at`, `next_reset_at` oder `period_end`). Copilots `quota_reset_date` wird als Mitternacht UTC
  gelesen; ob GitHub tatsächlich dann zurücksetzt, ist nicht geprüft.
- Der 55-s-Cache verhindert doppelte Abrufe nur, wenn der erste Abruf schon fertig ist. Starten Plugin und CLI
  in derselben Sekunde, können beide abfragen (prozessübergreifend kein Lock, nur innerhalb eines Prozesses).
- `login` (401/403) startet keinen Cooldown und zeigt weiter `login` statt des letzten Werts.
- `npm audit` meldet eine Zod-Schwachstelle (Speicher bei riesigen Eingaben) über `@elgato/streamdeck` 3 → `@elgato/utils`;
  der Fix wäre ein Downgrade auf 1.x. Eingaben kommen nur vom lokalen Stream-Deck-Programm.
- launchd führt den Sonntagslauf nur aus, wenn der Mac an ist (verpasst im Ruhezustand → beim Aufwachen).

## TODO

- [ ] Plugin installieren (`bash tools/install.sh`), Stream Deck neu starten, Kacheln am Gerät prüfen – Philipp – hoch
- [ ] Nicht genutzte Claude-Usage-Plugins (Liste unter „Warum 429“) in der Stream-Deck-App deaktivieren – Philipp – hoch
- [ ] Bei echtem 429 am Gerät prüfen: Wert bleibt sichtbar, `~ vor …` unten, Sanduhr oben rechts – Philipp – mittel
- [ ] Prüfen, ob Stream Deck 7.5 `Nodejs.Version "24"` annimmt, sonst `"20"` – Philipp – hoch
- [ ] Admin-Schlüssel anlegen, die genutzt werden sollen (`anthropic-admin`, `openai-admin`, …) und `doctor` erneut laufen lassen – Philipp – mittel
- [ ] API-Kosten-Abfragen mit echten Schlüsseln verifizieren (Einheiten Cent/Dollar, Paging) – Claude/Entwicklung – mittel
- [ ] Nach erster Gemini-CLI-Antwort prüfen, ob `tokens`-Felder in `session-*.jsonl` stehen – Entwicklung – niedrig
- [ ] Grok: `grok login` ausführen und Format von `~/.grok/auth.json` + Billing-Antwort verifizieren – Philipp – niedrig
- [ ] Gemini-Abo-Quota über Antigravity-Login (Phase 2) – Entwicklung – niedrig
- [ ] Taste „Nächste Resets“ am Gerät prüfen: Lesbarkeit, gelbes Blinken, `+N`-Badge, Lang-Drücken stumm – Philipp – mittel
- [ ] Wenn Extra Usage aktiv ist: prüfen, ob `extra_usage` ein Reset-Feld liefert, und Feldnamen in `claudeResets` festziehen – Entwicklung – niedrig
- [ ] Nach dem ersten Sonntag 20:00 `history.jsonl` und `launchd.log` prüfen (genau eine Zeile je Anbieter) – Philipp – mittel
