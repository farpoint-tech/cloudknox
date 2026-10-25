# AI Usage Deck – Stream-Deck-Plugin

Zeigt pro Anbieter (Claude, ChatGPT/Codex, GH Copilot = GitHub Copilot, M365 Copilot = Microsoft-365-Copilot-Lizenz,
Gemini, Grok) den Abo-Verbrauch, die lokal
gezählten Tokens und die Abo-Kosten (Extra Usage, Budgets, Credits, Overage). API-Kosten über Admin-Schlüssel
sind optional und nur für Enterprise/Teams-Konten gedacht (siehe unten). Plugin-UUID `tech.farpoint.ai-usage`,
Stream Deck ab 7.1, nur macOS, Node 24 (vom Stream-Deck-Programm mitgeliefert).

## Tasten

### „Anbieter“
Einstellungen im Property Inspector: **Anbieter**, **Anzeige** (`auto`, `Abo-Limit %`, `Tokens heute`, `Kosten`,
`API-Kosten Monat`), das Häkchen **API-Kosten anzeigen** (Setting `showApiCost`, Standard aus) und, nur für
M365 Copilot, **M365 Anmeldung** (Setting `m365Auth`: `az` = Weg A, `app` = Weg B), **M365 Tenant** (Setting `tenantId`:
Tenant-GUID oder `contoso.onmicrosoft.com`) und nur für Weg B **Client-ID** (`clientId`) und **Benutzer (UPN)** (`upn`);
nicht benötigte Felder blendet der Property Inspector aus. Siehe „M365 Copilot: Anmeldung“.

| Zeile | Inhalt |
|---|---|
| oben | Anbietername (CLAUDE, CODEX, GH COPILOT, M365 COPILOT, GEMINI, GROK) |
| Mitte groß | Abo: Fenster + Prozent, z. B. `5h 36%` · Tokens: `1,3M` · Kosten: `251 / 250 $` · API: `$ 12,40` |
| darunter | Abo: zweites Fenster (`Wo 7%`) · Tokens: `heute · Wo 33M` · Kosten: `Budget 100%`, `Extra aus` · API: `API 2026-10` |
| Balken | Abo: Auslastung des Hauptfensters; Kosten: Auslastung des Budgets (grün < 70 %, gelb < 90 %, rot) |
| unten | Abo/Kosten: Zeit bis Reset (`↻ 2h14`), bei Kosten `· +1` für weitere Posten; veralteter Wert: `~ vor 12m`; sonst Alter der Daten (`vor 3m`) |
| oben rechts | gelbe Sanduhr: Abo-Endpunkt pausiert nach 429/5xx (Cooldown) |

- **Kurz drücken:** sofort aktualisieren (Abo, Tokens, API für diesen Anbieter). Ein erzwungener Abo-Abruf höchstens
  alle 30 s je Anbieter; ein laufender Cooldown nach 429/5xx wird auch durch Drücken nicht übergangen.
- **Lang drücken (≥ 0,6 s):** Anzeige wechseln auto → Abo → Tokens → Kosten (mit `showApiCost` zusätzlich → API).
- **Stream Deck + (Drehregler, Layout `$B1`):** Drehen wechselt die Anzeige, Drücken aktualisiert.
- `auto` zeigt Abo, wenn ein Abo-Wert existiert, sonst Tokens, sonst Kosten. API-Kosten nie automatisch.
- Alte Einstellung `API-Kosten Monat` ohne Häkchen wird beim Laden zu `Kosten`.
- Fällt eine Abo-Abfrage aus (429, 5xx, offline, unerwartete Antwort), bleibt der letzte gute Wert grau stehen,
  unten steht `~` und sein Alter (`~ vor 12m`). `Fehler` erscheint nur, wenn es noch nie einen guten Wert gab.

Statustexte: `login` (Anmeldung fehlt/abgelaufen), `Key fehlt` (nur bei eingeschaltetem `showApiCost`: Admin-Schlüssel nicht angelegt),
`offline`, `n/v` (für diesen Anbieter gibt es die Quelle nicht), `veraltet` (letzter guter Wert, CLI),
`Fehler` (unerwartete Antwort, noch nie ein guter Wert), `Setup fehlt` (M365 Copilot ohne gültige `tenantId`, unten `Tenant-ID`).

**M365 Copilot** zeigt keine Prozente und keine Tokens (Microsoft veröffentlicht keine Token-Zahlen):

| Anzeige | Inhalt |
|---|---|
| Abo | `Lizenz ja` / `Lizenz nein`, darunter die SKU (`M365 Copilot`), unten die nächste Verlängerung (`↻ 51d4h`), kein Balken |
| Tokens | Apps mit Copilot-Aktivität in den letzten 30 Tagen: `3 Apps`, darunter `Teams, Word, Out…`, unten `zuletzt 24.10.`; ohne Berechtigung `n/v` + `k. Berechtigung` |
| Kosten | `Lizenz` mit Anzahl der Lizenzen der Copilot-Subscription (z. B. `15`), sonst `n/v`; keine API-Kosten |
| ohne Anmeldung | `login`, unten `az login` (voller Befehl in CLI und `doctor`) |

**Tokens** = Input + Cache-Write + Output. Cache-Reads werden getrennt gezählt (CLI zeigt `+… cache`),
weil sie bei Claude und Codex das Hundertfache ausmachen und die Zahl sonst nichtssagend wird.

**API-Beträge** kommen von allen Anbietern in US-Dollar und werden als `$` angezeigt (keine Umrechnung in €).
Abo-Kosten behalten ihre Währung (Claude Extra in €, Claude-Budgets in $), es wird nichts umgerechnet.

### „Übersicht“
Sechs Zeilen, je Anbieter Kürzel (`CL`, `CX`, `GH`, `M365`, `GE`, `GK`) + Abo-Prozent mit Minibalken bzw. Statustext;
M365 zeigt `ja`/`nein` (Lizenz) ohne Balken. Drücken aktualisiert alles.
Eine siebte Zeile **Kosten** erscheint nur, wenn bei einem Anbieter etwas verbraucht wurde (Betrag > 0) oder ein
Limit erreicht ist, z. B. `CL 251 / 250 $` (gelb, wenn ein Limit erreicht ist; `+1`, wenn weitere Anbieter betroffen
sind). Die M365-Lizenzanzahl zählt dafür nicht (kein Verbrauch). Sonst bleibt die Taste bei sechs Zeilen.

### „Nächste Resets“
Zeigt die zwei nächsten Abo-Resets aller Anbieter, je Reset drei Zeilen:

| Zeile | Inhalt |
|---|---|
| Name (Anbieterfarbe) | Anbieter + Fenster, z. B. `Claude 5h`, `Codex Woche`, `GH Copilot Monat`, `Claude Extra`; zu lange Namen mit Kürzel und kleiner, z. B. `M365 Verlängerung` |
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

## Kosten (Abo-Kosten statt API)

Persönliche Abos (Claude Max, ChatGPT Pro, GH Copilot Individual) haben keine Admin-Schlüssel – die gibt es nur für
Enterprise/Teams-Organisationen. Deshalb zeigt die Anzeige **Kosten** die Beträge, die der Abo-Endpunkt ohnehin
mitliefert. Kein zusätzlicher Aufruf, kein Schlüssel: die Werte kommen aus derselben Antwort wie die Abo-Prozente,
werden mit dem letzten guten Wert in `state.json` → `lastSub` gespeichert und bei 429/Cooldown genauso grau mit
`~ vor …` weiter angezeigt.

| Anbieter | Posten | Quelle (Feld) | Anzeige |
|---|---|---|---|
| Claude | `Extra` | `extra_usage.{used_credits, monthly_limit, utilization, currency, decimal_places, is_enabled, disabled_reason, spend_limit_reached}` | `0 / 25 €`, darunter `Extra aus` (abgeschaltet, z. B. `out_of_credits`) oder `Extra 4%`; `Limit erreicht` bei `spend_limit_reached` |
| Claude | `Budget` | jedes Objekt der obersten Ebene mit `limit_dollars > 0` (+ `used_dollars`, `remaining_dollars`, `utilization`, `resets_at`) | `251 / 250 $`, darunter `Budget 100%`, Balken, `↻ 10d10h` |
| Codex | `Credits` | `credits.{balance, has_credits, unlimited, overage_limit_reached}`, `spend_control.{reached, individual_limit}` | `0` + `Credits`; `∞` + `Credits unbegrenzt`; `Credits Limit erreicht` |
| Codex | `Reset-Credits` | `rate_limit_reset_credits.available_count` | nur wenn > 0 |
| GH Copilot | `Overage` | `quota_snapshots.premium_interactions.{overage_count, overage_permitted}` | `0` + `Overage aus` (nicht erlaubt) bzw. `Overage` |
| M365 Copilot | `Lizenz` | `/directory/subscriptions` → `totalLicenses` der Copilot-SKUs (Summe) | Anzahl, z. B. `15` + `Lizenz`, unten Verlängerung; ohne Berechtigung `n/v`. Nur Information, kein Verbrauch |
| Grok | `On-Demand` / `Guthaben` | `/v1/billing` → `config.{onDemandCap, onDemandUsed, prepaidBalance}.val` (Einheit als Cent angenommen, ungeprüft: live alles 0) | Cap > 0: `12,50 / 50 $` + `On-Demand 25%`, Balken; Guthaben > 0: `Guthaben 20 $`; sonst `0 $` (CLI `On-Demand 0 $ (Cap 0)`) |
| Gemini | – | keine Daten | `n/v` |

- **Claude Extra in Minor-Units:** `monthly_limit` und `used_credits` werden durch `10^decimal_places` geteilt. Live-Antwort
  vom 2026-10-25: `monthly_limit 2500`, `decimal_places 2`, dazu `spend.limit.amount_minor 2500, exponent 2` → **25,00 €**,
  nicht 2.500 €. Fehlt `decimal_places`, gilt der Wert unverändert.
- **Claude-Budget ohne festen Feldnamen:** heute heißt das Objekt `iguana_necktie` (Limit 250 $, verbraucht 251,21 $,
  Reset 2026-11-05). Die Namen sind intern und wechseln, deshalb wird jedes Objekt mit `limit_dollars > 0` genommen;
  `five_hour`/`seven_day` haben `limit_dollars: null` und fallen heraus. Mehrere Budgets erscheinen als mehrere Posten.
  Jedes Budget mit `resets_at` ist auch ein Reset (Fenster `Budget`) auf der Taste „Nächste Resets“.
- **Welcher Posten auf der Taste steht:** zuerst einer mit erreichtem Limit, dann einer mit Betrag > 0, sonst der erste.
  Weitere Posten zeigt die Taste als `· +N`, die CLI listet alle.

## API-Kosten (optional, nur Enterprise/Teams)

Admin-Schlüssel (Anthropic Admin API, OpenAI Org-Costs, GitHub-Billing-PAT, xAI Management) gibt es nur für
Organisationskonten. Der Code dafür ist vorhanden, aber **standardmäßig aus**:

- Taste „Anbieter“: Häkchen **API-Kosten anzeigen** (`showApiCost`). Erst dann liest das Plugin für diesen Anbieter den
  Schlüsselbund und fragt alle 6 h die Kosten-API ab; die Anzeige `API-Kosten Monat` kommt in den Zyklus.
  Die eingeschalteten Anbieter landen in `state.json` → `apiProviders`, damit auch der Sonntagsabgleich (launchd) sie
  abfragt. Ohne Häkchen wird kein `anthropic-admin`, `openai-admin`, `github-billing-pat`, `xai-*` gelesen.
- CLI: `status --api`, `sync --api`, `doctor --api`.

Schlüssel anlegen (nur wenn ein Org-Konto vorhanden ist), jeweils über das verdeckte Eingabefenster:

```bash
bash ~/Documents/ClaudeCode-Terminal\&Scripting/tools/apikey_setzen.sh anthropic-admin     # sk-ant-admin01-…  (Anthropic Console → Admin Keys, nur Org-Konten)
bash ~/Documents/ClaudeCode-Terminal\&Scripting/tools/apikey_setzen.sh openai-admin        # sk-admin-…        (nur Org-Owner)
bash ~/Documents/ClaudeCode-Terminal\&Scripting/tools/apikey_setzen.sh github-billing-pat  # Fine-grained PAT „Plan: read“
bash ~/Documents/ClaudeCode-Terminal\&Scripting/tools/apikey_setzen.sh xai-management      # xAI Console → Management Keys
bash ~/Documents/ClaudeCode-Terminal\&Scripting/tools/apikey_setzen.sh xai-team-id         # Team-ID als „Passwort“
```

Das Plugin liest mit `security find-generic-password -s <dienst> -a supreme -w` (5 s Timeout, nie interaktiv).
Fehlt ein Eintrag bei eingeschaltetem Häkchen, zeigt die Taste `Key fehlt`. `doctor` führt die Schlüssel in einem
eigenen Block „optional (nur Enterprise/Teams)“ als `info`, nie als `missing`.

## Abo-Laufzeiten

Welche Reset-Fenster jeder Anbieter hat und aus welchem Feld der Zeitpunkt kommt:

| Anbieter | Fenster auf der Taste | Länge | Feld |
|---|---|---|---|
| Claude | `5h` | 5 h rollierend | `five_hour.resets_at` (+ `five_hour.utilization`) |
| Claude | `Woche` | 7 Tage | `seven_day.resets_at` (+ `seven_day.utilization`) |
| Claude | `Extra` | monatlich (Extra Usage) | `extra_usage.resets_at` – nur wenn vorhanden. Die Live-Antwort vom 2026-10-25 hat **kein** Reset-Feld in `extra_usage`, daher erscheint `Extra` derzeit nicht |
| Claude | `Budget` | laut Antwort (heute bis 2026-11-05) | `resets_at` jedes Objekts mit `limit_dollars > 0` (siehe „Kosten“) |
| Codex | `Woche` | 7 Tage (primäres Fenster) | `rate_limit.primary_window.reset_at` (Unix-Sekunden), Länge aus `limit_window_seconds` = 604800 |
| Codex | `5h` | 5 h, optional | `rate_limit.secondary_window.reset_at`; ist derzeit `null` und wird dann übersprungen |
| GH Copilot | `Monat` | monatlich | `quota_reset_date` (Datum, als 00:00 UTC gelesen) |
| M365 Copilot | `Verlängerung` | Laufzeit der Subscription (meist jährlich) | frühestes künftiges `nextLifecycleDateTime` der aktiven Copilot-Subscriptions aus `/directory/subscriptions` (bevorzugt die SKU des Nutzers); bei 403 kein Reset, Hinweis `Verlängerung: keine Berechtigung` |
| Gemini | – | unbekannt | kein Quota-Endpunkt (siehe Grenzen) |
| Grok | `Woche` | 7 Tage (live 2026-10-25: `USAGE_PERIOD_TYPE_WEEKLY`, Mo 00:00 UTC bis Mo 00:00 UTC) | `config.currentPeriod.end` von `/v1/billing`; Name aus `currentPeriod.type` (`WEEKLY` → `Woche`, `MONTHLY` → `Monat`), sonst aus `start`/`end` |

Der Fenstername von Codex wird aus `limit_window_seconds` abgeleitet (≤ 24 h → `<n>h`, ≤ 8 Tage → `Woche`, sonst `Monat`).
Ältere `state.json`-Werte ohne Reset-Liste werden aus den Fenstern `primary`/`secondary` übernommen.

## Datenquellen

| Anbieter | Abo + Kosten | Lokale Tokens | API-Kosten (optional, Enterprise/Teams) |
|---|---|---|---|
| Claude | `api.anthropic.com/api/oauth/usage`, Token aus Keychain `Claude Code-credentials` (Fallback `~/.claude/.credentials.json`) | `~/.claude/projects/**/*.jsonl`, Dedupe über `message.id`+`requestId` | Admin-API `cost_report`, Keychain `anthropic-admin` |
| Codex | `chatgpt.com/backend-api/wham/usage`, Token aus `~/.codex/auth.json` | `~/.codex/sessions/**/*.jsonl`, `token_count`-Ereignisse als Differenzen | `api.openai.com/v1/organization/costs`, Keychain `openai-admin` |
| GH Copilot | `api.github.com/copilot_internal/user` mit `gh auth token` | `~/.copilot/data.db`, Tabelle `sessions` (per `/usr/bin/sqlite3`) | Premium-Request-Billing, Keychain `github-billing-pat` |
| M365 Copilot | Microsoft Graph. Weg A: Token aus `az account get-access-token --tenant <tenantId> --resource-type ms-graph` (20 s Timeout, `az` aus PATH + `/opt/homebrew/bin`): `/v1.0/me/licenseDetails` (Lizenz), `/v1.0/directory/subscriptions` (Verlängerung, Anzahl), `/v1.0/me` (UPN). Weg B: Client-Credentials-Token der Enterprise-App (Secret aus Schlüsselbund `m365-copilot-app`), dieselben Abfragen auf `/v1.0/users/{upn}` | n/v – stattdessen Copilot-Nutzungsbericht D30 (`/v1.0/reports/getMicrosoft365CopilotUsageUserDetail(period='D30')?$format=application/json`, bei 400/404 die dokumentierte Beta-Variante): Apps mit Aktivität, letzte Aktivität | keine |
| Gemini | n/v (siehe Grenzen) | `~/.gemini/tmp/*/chats/session-*.jsonl` (Feld `tokens`), sonst n/v | n/v |
| Grok | `cli-chat-proxy.grok.com/v1/billing?format=credits` (Fenster, Prozent, On-Demand/Guthaben), Tarif aus `/v1/user?include=subscription` und `grok.com/rest/subscriptions`; Token aus `~/.grok/auth.json` (nach `grok login`), abgelaufen → Refresh über `auth.x.ai/oauth2/token` | n/v | xAI Management-API, Keychain `xai-management` + `xai-team-id` |

Lokale Logs werden inkrementell gelesen (Byte-Offsets und mtimes in `~/.config/ai-usage-deck/state.json`).
Der erste Lauf liest nur Dateien, die in den letzten 7 Tagen geändert wurden; ältere werden nur markiert.
Tagessummen werden 35 Tage aufbewahrt. Der Keychain-Eintrag `github-copilot-app` wird nie gelesen.

## Fertige Seite importieren

`npm run profile` erzeugt `tools/Nexus365-AI-Usage.streamDeckProfile`: eine Seite für das Stream Deck (5×3, 14 Tasten belegt).

| | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Reihe 1 | Claude Abo | Claude Tokens | Claude Kosten | Codex Abo | Codex Tokens |
| Reihe 2 | Codex Kosten | GH Copilot Abo | GH Copilot Tokens | GH Copilot Kosten | Übersicht |
| Reihe 3 | Nächste Resets (Blinken 24 h) | Gemini auto | Grok auto | M365 Copilot auto | leer |

Die M365-Copilot-Taste braucht danach im Property Inspector die **M365 Tenant**-ID (das Profil enthält keine);
bis dahin zeigt sie `Setup fehlt`.

1. Plugin installieren (siehe unten), sonst bleiben die Tasten leer.
2. Doppelklick auf die Datei. Stream Deck fragt, auf welches Gerät das Profil soll.
3. Das Profil heißt danach „Nexus.365 – AI Usage“.
4. Die Tasten zeigen Werte nach der ersten Aktualisierung. Wer nicht warten will, drückt eine Taste.
5. Umbenennen: in Stream Deck Einstellungen → Profile, Doppelklick auf den Namen. Oder beim Bauen: `node tools/make-profile.mjs --name "Mein Name"`.

Andere Geräte: `node tools/make-profile.mjs --device-type 2` baut die Variante für das XL (8×4), gleiche Reihenfolge. `--cols`, `--rows` und `--model` überschreiben die Vorgaben. Was am Dateiformat belegt und was angenommen ist, steht in `tools/PROFILE-FORMAT.md`.

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
node bin/cli.js status            # Tabelle aller Anbieter (Abo, Abo-Quelle, Reset, Tokens heute/Woche, Kosten)
node bin/cli.js status --fresh    # wie status, aber Abo-Werte nicht aus dem 55-s-Cache (Cooldown gilt trotzdem)
node bin/cli.js status --api      # zusätzlich Spalte „API Monat“ (liest die Admin-Schlüssel, nur Enterprise/Teams)
node bin/cli.js sync              # Vollabgleich, hängt je Anbieter eine Zeile an history.jsonl (API-Kosten nur für state.json → apiProviders)
node bin/cli.js sync --scheduled  # wie sync, überspringt, wenn der Sonntag-20:00-Slot schon erledigt ist
node bin/cli.js sync --api        # wie sync, API-Kosten für alle Anbieter
node bin/cli.js doctor            # prüft jede Anmeldequelle: found / missing / invalid / warn (ohne Geheimnisse auszugeben); API-Schlüssel als info, ungeprüft
node bin/cli.js doctor --api      # wie doctor, prüft zusätzlich die optionalen API-Schlüssel im Schlüsselbund
node bin/cli.js resets            # alle anstehenden Resets aufsteigend (Anbieter, Fenster, Ortszeit, Countdown, Verbrauch) + Blink-Bedingung
node bin/cli.js resets --window 48  # wie resets, Blink-Fenster 48 h statt 24 h
```

Plugin und CLI nutzen denselben Code (`src/providers`, `src/collectors`). Umgebungsvariablen:
`AI_USAGE_DECK_HOME` (anderer Ordner für state/history), `NODE_USE_ENV_PROXY=1` (Node-`fetch` über `HTTPS_PROXY`),
`AI_USAGE_DECK_M365_TENANT` (Tenant für M365 Copilot, wenn keine Taste eine `tenantId` gesetzt hat),
`AI_USAGE_DECK_M365_AUTH` (`az` oder `app`), `AI_USAGE_DECK_M365_CLIENT_ID`, `AI_USAGE_DECK_M365_UPN` (Weg B ohne Taste).
`AI_USAGE_DECK_M365_CLIENT_SECRET` ist nur für Tests gedacht; echte Secrets gehören in den Schlüsselbund.

### M365 Copilot: Anmeldung

Zwei Wege, je Taste wählbar (Setting `m365Auth`). Setzt eine Taste die Werte, landen sie in `state.json`
(`m365TenantId`, `m365Auth`, `m365ClientId`, `m365Upn`) und haben Vorrang vor den Umgebungsvariablen. Alle M365-Tasten
teilen die zuletzt gesetzten Werte. Ein Wechsel verwirft letzten Wert, Cooldown und zwischengespeicherte Tokens.

**Weg A: az CLI** (Standard, `m365Auth = az`). Token aus `az account get-access-token`, Abfragen auf `/me`. Keine eigene
App, kein Secret, aber `az` muss installiert und angemeldet sein (Anmeldung läuft ab, dann zeigt die Taste `az login`).

```bash
az login --tenant <tenantId> --scope https://graph.microsoft.com//.default   # einmalig, im eigenen Terminal
AI_USAGE_DECK_M365_TENANT=<tenantId> node bin/cli.js doctor                 # tenantId, az-Token, Lizenz, Verlängerung, Nutzungsbericht
AI_USAGE_DECK_M365_TENANT=<tenantId> node bin/cli.js status --fresh
```

**Weg B: Enterprise-App** (`m365Auth = app`). Eigene App-Registrierung mit Client Credentials; läuft ohne az CLI und
ohne interaktive Anmeldung. Token per `POST https://login.microsoftonline.com/<tenantId>/oauth2/v2.0/token`
(`grant_type=client_credentials`, `scope=https://graph.microsoft.com/.default`), im Speicher bis 5 min vor Ablauf.
App-Tokens kennen kein `/me`, deshalb braucht die Taste den **UPN** des Nutzers, dessen Lizenz und Nutzung sie zeigt;
abgefragt werden `/v1.0/users/{upn}/licenseDetails`, `/v1.0/users/{upn}` (UPN für die Berichtszeile),
`/v1.0/directory/subscriptions` und der Nutzungsbericht wie bei Weg A.

Graph-**Anwendungsberechtigungen** mit Admin-Consent: `User.Read.All`, `Organization.Read.All`, `Reports.Read.All`.
Das Client-Secret liegt nur im macOS-Schlüsselbund: Dienst **`m365-copilot-app`**, Konto = macOS-Benutzer (`$USER`).

Einrichtung per Skript (im eigenen Terminal nach `az login`; az wird nur dafür gebraucht, nicht im Betrieb):

```bash
bash tools/m365-register-app.sh --tenant <tenant-guid> --dry-run   # zeigt jeden Schritt, schreibt nichts
bash tools/m365-register-app.sh --tenant <tenant-guid> [--upn name@contoso.com]
```

Das Skript prüft zuerst, dass `az account show` im angegebenen Tenant steht (sonst Abbruch), bricht ab, wenn es schon eine
App „Nexus.365 AI Usage Deck“ gibt, und fragt vor jeder Schreiboperation einzeln (y/N): App anlegen, Service Principal,
Berechtigungen (IDs zur Laufzeit über `az ad sp show --id 00000003-0000-0000-c000-000000000000` nachgeschlagen),
Admin-Consent, Secret (12 Monate) direkt in den Schlüsselbund, ohne es anzuzeigen. Am Ende stehen `tenantId`, `clientId`
und die Werte für die Taste. Von Hand im Entra-Portal, mit Erneuern und Zurückziehen: `tools/m365-app-setup.md`.

Secret ohne Skript ablegen (fragt verdeckt, nichts in der Befehlszeile):

```bash
security add-generic-password -s m365-copilot-app -a "$USER" -U -w
AI_USAGE_DECK_M365_AUTH=app AI_USAGE_DECK_M365_TENANT=<tenantId> AI_USAGE_DECK_M365_CLIENT_ID=<clientId> \
  AI_USAGE_DECK_M365_UPN=<upn> node bin/cli.js doctor
```

`doctor` zeigt für Weg B: Einstellungen, Schlüsselbund-Eintrag (`found`/`missing`), Token-Endpunkt (`ok` oder
AADSTS-Code; fehlende Rechte laut `roles` im Token), danach jede Graph-Abfrage einzeln (`ok` oder `HTTP 403: <Recht> fehlt`).
Kurztexte auf der Taste: `Secret fehlt`, `Secret falsch` (AADSTS7000215), `Secret abgelaufen` (AADSTS7000222),
`App fehlt` (AADSTS700016), `Consent fehlt` (AADSTS65001, AADSTS500011), `Recht fehlt` (Graph 403), `UPN prüfen` (Graph 404),
`Client-ID` / `UPN` (Einstellung fehlt oder ungültig). Zertifikat statt Secret ist vorgesehen, aber noch nicht gebaut.

## Zeitplan

| Was | Wann |
|---|---|
| Abo-Limits | je Anbieter alle 120 s ± 10 s (Start versetzt um 4 s je Anbieter), solange mindestens eine Taste sichtbar ist; ein guter Wert jünger als 55 s wird aus `state.json` wiederverwendet (Plugin und CLI teilen ihn) |
| Lokale Tokens | alle 15 min |
| Abo-Kosten | mit jedem Abo-Abruf (dieselbe Antwort) |
| API-Kosten | alle 6 h, nur für Anbieter mit `showApiCost` |
| Vollabgleich | Sonntag 20:00 lokal (im Plugin zwischen 20:00 und 20:59) + beim Start, wenn der letzte älter als 7 Tage ist; zusätzlich launchd `tech.farpoint.ai-usage.sync` (`sync --scheduled`) |

Ein Lock (`reconcile.lock`) und der Slot-Check verhindern doppelte Zeilen, wenn Plugin und launchd gleichzeitig laufen.
`history.jsonl`: `{ts, week, provider, sub_pct, sub_reset, tokens_week_in, tokens_week_out, tokens_week_cached, api_usd_mtd, status}`.
Ohne eingeschaltete API-Kosten ist `api_usd_mtd` `null` und `status` endet auf `api:aus`.

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

So geht dieses Plugin mit 429 um (gilt für alle Abo-Endpunkte: Claude, Codex, GH Copilot, M365 Copilot (Graph), Grok):

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

- **M365 Copilot:** Weg A braucht `az login` für den gewählten Tenant (Scope `https://graph.microsoft.com//.default`); das Plugin
  meldet sich nie selbst an und gibt das Token nie aus. Weg B (Enterprise-App) ist gegen die dokumentierten Formen gebaut
  und mit Fixtures getestet, **nicht live**; das Secret läuft nach 12 Monaten ab (Taste `Secret abgelaufen`). Der Tenant wird je Taste gewählt; alle M365-Tasten teilen den zuletzt
  gesetzten (eine `tenantId` gleichzeitig). Nutzung braucht `Reports.Read.All` und eine Rolle wie Reports Reader – optional,
  ohne sie bleibt der Lizenzstatus sichtbar (`Nutzung: keine Berechtigung`). Ist im Admin Center „Benutzernamen
  anonymisieren“ an, passt keine Zeile zum UPN (`Nutzung: anonymisiert`). `/directory/subscriptions` braucht Leserechte
  im Verzeichnis; ohne sie keine Verlängerung und keine Lizenzanzahl (`n/v`). Laut Microsoft Learn gibt es den
  Bericht als JSON nur unter `/beta/reports/…`; die v1.0-Variante liegt unter `/v1.0/copilot/reports/…` und liefert CSV.
  Das Plugin ruft die angefragte v1.0-URL und fällt bei 400/404 auf die Beta-URL zurück. Bericht und Verlängerung werden
  je Prozess 30 min zwischengespeichert (Bericht aktualisiert täglich). Alles ist gegen die dokumentierten Formen gebaut,
  **nicht live getestet** (az läuft in der Entwicklungs-Sandbox nicht).
- **Grok:** Anmeldung einmalig mit `grok login` (grok CLI, getestet mit 1.0.70); ohne `~/.grok/auth.json` zeigt die Taste
  `login`, unten `grok login`. Ist das Token abgelaufen, erneuert das Plugin es selbst (OIDC-Refresh) und schreibt das neue
  Token in denselben Eintrag von `auth.json` zurück (alle anderen Felder bleiben, Datei 0600, atomar). Scheitert der Refresh,
  bleibt die Datei unverändert und die Taste zeigt `login`. Die grok CLI erneuert dieselbe Datei ebenfalls; wer zuletzt
  schreibt, gewinnt – beide lesen vorher neu ein. **Ohne Grok-Abo** (Stand 2026-10-25) liefert `/v1/billing` nur das
  Wochenfenster ohne Prozentwert: Taste `Wo o. Limit`, darunter `kein Abo`, unten Countdown bis Montag 00:00 UTC;
  Kosten `0 $`. Mit Abo kommt der Prozentwert aus `creditUsagePercent` (Feldname aus Community-Quellen, live noch nicht
  gesehen), sonst aus On-Demand-Verbrauch/-Cap. Endpunkte sind inoffiziell (kein Vertrag, Cloudflare). Keine lokalen
  Token-Logs. xAI-API-Kosten: Einheit von `amountBeforeVat` als Cent angenommen (laut Doku, nicht mit echtem Konto geprüft).
- **Gemini:** Abo-Quota n/v (Code-Assist-Endpunkt antwortet 403, Antigravity-Login ist Phase 2).
  API-Kosten n/v (nur über BigQuery-Billing-Export). Lokale Tokens: Feldnamen aus dem gemini-cli-Quellcode;
  die vorhandene Chat-Datei enthält noch keine Antwort mit `tokens`, daher aktuell `n/v`.
- **Copilot:** `copilot_internal/user` ist inoffiziell. Bei Plan ohne Premium-Requests (Kontingent 0) zeigt die Taste
  Chat (`Chat 1%`) und Code-Vervollständigungen. Lokale Tokens: Tabelle `sessions` ist derzeit leer → `0`.
  Annahmen: `total_input_tokens` enthält Cache-Tokens; ein Sitzungs-Zuwachs wird dem Tag von `updated_at` zugerechnet.
- **Claude/Codex Abo-Endpunkte** sind inoffiziell und können sich ändern. Bei abgelaufenem Claude-Token zeigt
  die Taste `login` – das Plugin erneuert das Token nicht selbst (das macht Claude Code beim nächsten Start).
- API-Kosten-Abfragen (Anthropic, OpenAI, GitHub-Billing, xAI) sind implementiert, aber mangels Schlüssel nicht live getestet
  (für persönliche Abos ohne Belang, standardmäßig aus).
- Abo-Kosten: Codex-Credits und Copilot-Overage sind heute `0`; wie die Felder aussehen, wenn tatsächlich Credits gekauft
  oder Overage erlaubt sind, ist nicht gesehen (nur die Live-Form mit Nullwerten). Was das Claude-Budget (`limit_dollars`)
  fachlich ist, sagt die Antwort nicht; angezeigt wird es als „Budget“.
- Die API-Kosten-Einstellung gilt pro Taste. Welche Anbieter eingeschaltet sind, merkt sich das Plugin für alle Tasten, die
  seit dem Start sichtbar waren; eine gelöschte Taste mit Häkchen bleibt bis zum Plugin-Neustart in `apiProviders`.
- Kacheln sind als SVG gerendert und nur per Test geprüft, noch nicht auf einem echten Stream Deck angesehen
  (auch die Sanduhr, der `~`-Marker und die Taste „Nächste Resets“ mit Blinken und `+N`-Badge nicht).
- „Nächste Resets“: Claude `Extra` erscheint erst, wenn die API ein Reset-Feld in `extra_usage` liefert (Feldname
  geraten: `resets_at`, `reset_at`, `next_reset_at` oder `period_end`). GH Copilots `quota_reset_date` wird als Mitternacht UTC
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
- [ ] Kosten-Kachel und Kosten-Zeile der Übersicht am Gerät prüfen (Lesbarkeit von `251 / 250 $`, sechste Zeile) – Philipp – mittel
- [ ] In claude.ai → Einstellungen → Nutzung prüfen, ob das Extra-Limit 25 € beträgt (Plugin teilt durch `10^decimal_places`) – Philipp – mittel
- [ ] Klären, was das Claude-Budget 250 $ (heute `iguana_necktie`, 251 $ verbraucht, Reset 05.11.) ist, und ggf. den Namen „Budget“ anpassen – Philipp – niedrig
- [ ] Nach erster Gemini-CLI-Antwort prüfen, ob `tokens`-Felder in `session-*.jsonl` stehen – Entwicklung – niedrig
- [ ] Grok: nach Ablauf des Tokens (heute bis 26.10. 04:24 UTC) `node bin/cli.js status --fresh` ohne Sandbox laufen lassen und prüfen, ob der Refresh `auth.json` korrekt fortschreibt und die grok CLI danach weiter funktioniert – Philipp – mittel
- [ ] Grok mit Abo: Feldname des Prozentwerts (`creditUsagePercent`) und Einheit von `onDemandCap`/`prepaidBalance` (Cent?) verifizieren – Entwicklung – niedrig
- [ ] Gemini-Abo-Quota über Antigravity-Login (Phase 2) – Entwicklung – niedrig
- [ ] Taste „Nächste Resets“ am Gerät prüfen: Lesbarkeit, gelbes Blinken, `+N`-Badge, Lang-Drücken stumm – Philipp – mittel
- [ ] Wenn Extra Usage aktiv ist: prüfen, ob `extra_usage` ein Reset-Feld liefert, und Feldnamen in `claudeResets` festziehen – Entwicklung – niedrig
- [ ] M365 Copilot live: `az login --tenant <id> --scope https://graph.microsoft.com//.default`, dann `AI_USAGE_DECK_M365_TENANT=<id> node bin/cli.js doctor` – Philipp – hoch
- [ ] M365 Copilot: Tenant-ID in der Taste (3,2) setzen und Lizenz-, Nutzungs- und Kosten-Anzeige am Gerät prüfen – Philipp – mittel
- [ ] M365 Copilot Weg B live: `bash tools/m365-register-app.sh --tenant <id> --dry-run`, dann ohne `--dry-run`; Taste auf Enterprise-App stellen, `doctor` prüfen – Philipp – hoch
- [ ] M365 Copilot Weg B: Ablauf des Secrets (12 Monate) im Kalender vormerken – Philipp – mittel
- [ ] M365 Copilot Weg B: Zertifikat statt Secret (client_assertion) – Entwicklung – niedrig
- [ ] M365 Copilot: prüfen, ob die v1.0-Berichts-URL JSON liefert oder der Beta-Fallback greift; ggf. auf `/v1.0/copilot/reports/…` (CSV) umstellen – Entwicklung – mittel
- [ ] Nach dem ersten Sonntag 20:00 `history.jsonl` und `launchd.log` prüfen (genau eine Zeile je Anbieter) – Philipp – mittel
