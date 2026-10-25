# Weiterentwicklung: AI Usage Deck

Kurzer Einstieg für alle, die das Plugin weiterbauen. Fachliche Details stehen in `SPEC.md`
(Architektur, Datenquellen), `RESEARCH.md` (API-Endpunkte mit Quellen) und `README.md` (Nutzung, Grenzen, TODO).

## Voraussetzungen
- macOS, Node ≥ 20.5 (Stream Deck 7.5 bringt Node 24 mit), Stream Deck App ≥ 7.1
- `npm ci` im Projektordner. Keine nativen Module; SQLite läuft über `/usr/bin/sqlite3`.

## Befehle
| Befehl | Zweck |
|---|---|
| `npm run build` | esbuild → `tech.farpoint.ai-usage.sdPlugin/bin/{plugin,cli}.js` (nicht eingecheckt) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Parser-, Gate-, Reset-Tests (`node --test`, Fixtures statt echter Logs) |
| `npx @elgato/cli validate tech.farpoint.ai-usage.sdPlugin` | Manifest-Prüfung |
| `node bin/cli.js doctor \| status \| resets \| sync` | Alles ohne Stream Deck testbar |
| `bash tools/install.sh` | Kopiert das Plugin in den Stream-Deck-Ordner, lädt den launchd-Job |

Vor jedem Commit: build, typecheck, test und validate grün. Ausgaben im PR zitieren, nicht umschreiben.

## Wo was liegt
- `src/plugin.ts` – Einstieg, registriert Actions, startet `scheduler.ts`
- `src/providers/<name>.ts` – je Anbieter `subscription()`, `localTokens()`, `apiCost()`; Rückgabetyp in `providers/types.ts`
- `src/collectors/` – inkrementelles Lesen lokaler Logs (Offsets in `~/.config/ai-usage-deck/state.json`)
- `src/subgate.ts` – Rate-Limit-Gate: 429/5xx-Cooldown, Retry-After, Last-good-Cache, Single-Flight
- `src/hub.ts` – sammelt Snapshots aller Anbieter, liefert `allResets()`
- `src/resets.ts` – Reset-Ereignisse, Top-2-Auswahl, Blink-Bedingung
- `src/actions/` – Stream-Deck-Tasten (`provider-key`, `overview-key`, `resets-key`)
- `src/render.ts` – 144×144-SVG-Kacheln; `src/format.ts` – Zahlen, Countdown, Datum
- `src/cli.ts`, `src/doctor.ts`, `src/reconcile.ts` – CLI, Diagnose, Sonntags-Abgleich
- `tech.farpoint.ai-usage.sdPlugin/` – Manifest, Property-Inspector-HTML (`ui/`), Icons

## Neuen Anbieter ergänzen
1. `src/providers/<name>.ts` nach Vorbild `codex.ts` anlegen; alle drei Funktionen müssen unabhängig voneinander degradieren
   (Status `login`, `key_missing`, `stale`, `error`, nie Exception nach außen).
2. Abo-Abruf immer über `subgate.ts` laufen lassen, nie direkt `fetch`.
3. Reset-Fenster als `ResetEvent[]` mitliefern (siehe `resets.ts`).
4. In `providers/index.ts` registrieren, Doctor-Probe in `doctor.ts` ergänzen, Fixture-Test in `test/`.
5. `RESEARCH.md` um Endpunkt, Auth, Felder und Quelle erweitern; `README.md` Tabelle „Datenquellen" und TODO anpassen.

## Regeln
- Schlüssel nur aus dem macOS-Schlüsselbund (`security find-generic-password -s <dienst> -a <user> -w`, 5 s Timeout, nie interaktiv).
  Den Dienst `github-copilot-app` nie lesen – er löst einen Dialog aus.
- Keine Secrets in Logs, Tests, Fixtures oder Commits.
- Kein Polling unter 120 s; Taste drücken erzwingt höchstens einen Abruf pro 30 s.
- Build-Artefakte (`bin/plugin.js`, `bin/cli.js`) bleiben außerhalb von Git.
