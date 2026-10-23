# MemGuard 1.1.1

Lokale Speicherüberwachung für macOS mit Weboberfläche. MemGuard kann Speicherengpässe abmildern, garantiert aber keinen Schutz vor Kernel-Panics.

## Starten

Voraussetzungen: macOS und Node.js 22 oder neuer. Es gibt keine npm-Laufzeitabhängigkeiten; kein npm install nötig. Den Ordner bzw. das ZIP entpacken und **MemGuard.command** doppelklicken. Alternativ: `zsh MemGuard.command`. Der Browser öffnet die im Terminal angezeigte Adresse.

Der Server bindet nur an `127.0.0.1` und wählt einen freien Port. Optional: `MEMGUARD_PORT=8765 zsh MemGuard.command`. Keine Cloud, keine Telemetrie, keine externen Schriftarten. Mit Ctrl+C im zugehörigen Terminal beenden. Das Schließen des Browser-Tabs stoppt den Server nicht.

Der Start der Oberfläche aktiviert keine Prozessbeendigung und ersetzt keine Installation. Ein bestehender LaunchAgent wird als extern verwaltet angezeigt. Nur wenn kein Dienst vorhanden ist, lässt sich der gebündelte Monitor nach Bestätigung starten. Bei unbekanntem Dienststatus bleibt der Start gesperrt. Ein aus der App gestarteter Monitor endet mit dem Server; ein externer Dienst läuft unabhängig weiter.

## Oberfläche

- Live-Messwerte alle fünf Sekunden: Kernel-Indikator, physischer RAM, belegter Swap, Swap-Dateien.
- Verlauf der letzten 180 Abfragen während der Serverlaufzeit; mehrere Tabs teilen sich den Verlauf.
- Bis zu 100 Prozesse nach RSS, Suche nach Name/PID und Kennzeichnung passender Ziele. Gemeinsamer Speicher kann mehrfach in RSS enthalten sein.
- Einstellungen mit vollständigem Ist/Soll-Vergleich, expliziter Bestätigung, Sicherungskopie, Konflikterkennung und vollständigem Rücklesen.
- Pause und Aufheben der Pause mit separater Bestätigung.
- Letzte 60 Protokollzeilen. Diagnoseexport ohne Zielpfade, Prozessnamen, Prozess-IDs und rohe Kommandozeilen. Der Export enthält Messwerte, Schwellenwerte und Monitorstatus; vor Weitergabe prüfen.
- Responsive deutsche Oberfläche, Tastaturbedienung, native Bestätigungsdialoge.

Die Prozentanzeige stammt aus `kern.memorystatus_level`. Sie ist ein Kernel-Indikator, kein RAM-Belegungswert der Aktivitätsanzeige und keine Absturzprognose. Fehlende Pflichtmesswerte erscheinen als unbekannt. Ein gesunder Zustand wird daraus nicht abgeleitet.

## Darstellung und farpoint-CI

Schwarz ist der Standard. Der Schalter oben rechts wechselt zwischen Schwarz und Hell und merkt die Auswahl im lokalen Browserspeicher für diese Adresse. Bei einem anderen Port gilt eine andere Browseradresse; für dieselbe Auswahl über Serverneustarts einen festen MEMGUARD_PORT verwenden.

Grundlage ist der maßgebliche CI-Steckbrief „CI_farpoint“ (Juli 2026): Orange #FF6A00 für Hauptaktionen, Navy #1E2A47 und Türkis #00CED1 für Status. Die schwarze Basis ist die angeforderte dunkle Variante. Helle Textakzente bzw. dunklere Akzente im Hellmodus sichern die Lesbarkeit. Raleway und IBM Plex Sans werden lokal aus mitgelieferten WOFF2-Dateien geladen; die OFL-Lizenzen liegen unter app/public/fonts. Es entstehen keine Font-CDN-Anfragen.

MemGuard bleibt der Produktname, „powered by farpoint Solution“ benennt den Absender. Die Oberfläche verwendet sachliche Sie-Ansprache. Die Signallogik wurde für diese Gestaltungsänderung nicht verändert.

## Konfiguration

Der Monitor berücksichtigt zuerst MEMGUARD_CONFIG, dann die Benutzerdatei unter `~/Library/Application Support/MemGuard/config.json`, dann die Systemdatei unter `/Library/Application Support/MemGuard/config.json`. Ohne Datei gelten Standardwerte. Die Oberfläche zeigt Benutzer-/Systemkonfiguration und schreibt ausschließlich die Benutzerkonfiguration. Fremde, über einen anderen Konfigurationspfad gestartete Instanzen werden nicht verwaltet.

| Feld | Standard | Bedeutung |
|---|---:|---|
| interval | 10 | Sekunden zwischen Prüfungen; 2–300 |
| warn_free_percent | 20 | Warnung bei Indikator ≤ Wert |
| critical_free_percent | 10 | Kritisch bei Indikator ≤ Wert |
| warn_swapfiles | 20 | Warnung ab dieser Anzahl |
| critical_swapfiles | 40 | Kritisch ab dieser Anzahl |
| warn_repeat_seconds | 600 | Wiederholungsabstand der Warnungen |
| terminate_grace_seconds | 8 | Wartezeit nach SIGTERM |
| language | en | Sprache der macOS-Mitteilungen: en/de |
| notifications | true | macOS-Mitteilungen aktiv |
| targets | [] | Leere Liste: ausschließlich warnen |

Die Standards sind Ausgangswerte, keine anhand deines Workloads kalibrierten Grenzen. Zielmuster sind einfache Teilstrings vollständiger Kommandozeilen; keine regulären Ausdrücke. Tilde wird zum Benutzerverzeichnis. Verwende eindeutige Projektpfade mit 4–300 Zeichen; höchstens 50 Muster. Ein Muster kann mehrere Prozesse treffen. Die Oberfläche zeigt nur Treffer unter den 100 größten Prozessen. Vor Aktivierung deshalb zusätzlich `memguard status` prüfen.

Ein laufender Monitor lädt Änderungen nach 30 Prüfzyklen neu, bei zehn Sekunden Intervall ungefähr fünf Minuten, bei Signal-Wartezeiten länger. Speichern und Rücklesen beweist noch keine Übernahme durch den laufenden Monitor. Die Oberfläche bestätigt nicht die Version eines externen Monitors.

## Signalverhalten

1. JSON-Typen und Wertebereiche prüfen. Ungültige Konfiguration stoppt den Monitor.
2. Messen. Bei fehlenden Pflichtwerten protokollieren und keine Signale senden.
3. Bei kritischen Werten und aufgehobener Pause nur passende Prozesse des eigenen Benutzers auswählen. Eigener Prozess, Vorfahren, PID 1 und MemGuard-Kommandos sind ausgeschlossen.
4. Eigentümer, Startzeit und Kommandozeile vor SIGTERM prüfen.
5. Nach der Wartezeit erneut messen. SIGKILL nur bei weiterhin kritischen Werten, unveränderter Identität und aufgehobener Pause.

Das Log unterscheidet gesendete Signale von bestätigtem Prozessende (`term_sent`, `kill_sent`). Rotation bei mehr als 5 MiB; eine Vorgängerversion bleibt. Eine Locksperre verhindert parallele Instanzen der neuen Monitorversion. Nach einem nicht abfangbaren Abbruch kann ein verwaistes monitor.lock bleiben. Vor dessen manueller Entfernung die dort hinterlegte PID und den Dienst prüfen.

Zwischen Identitätsprüfung und Signal bleibt ein nicht atomar ausschließbares Zeitfenster. SIGKILL kann ungespeicherte Arbeit unwiederbringlich verwerfen.

## Bestehende Installation aktualisieren

`install.sh` installiert nur den Hintergrundmonitor als Benutzer-LaunchAgent. Das Öffnen der Oberfläche führt diesen Schritt nicht aus. Vor dem Update Binärdatei, Konfiguration und LaunchAgent sichern. Ohne --config bleibt die Konfiguration erhalten. Nach ausdrücklicher Freigabe `./install.sh` ausführen und anschließend mit der installierten Binärdatei `version` und `status` prüfen.

Zuerst ohne Zielmuster bzw. pausiert pilotieren. Abbruchkriterien: unbekannte Messwerte, unerwartete Treffer, wiederholte Monitorabbrüche. Für einen Rollback Dienst beenden, gesicherte Binärdatei/LaunchAgent wiederherstellen und Dienst erneut prüfen. Bereits verlorene Prozessarbeit lässt sich dadurch nicht wiederherstellen.

Die vorhandenen build-pkg.sh und uninstall.sh bleiben verfügbar. Das PKG enthält nur den Monitor; die ZIP-Auslieferung enthält zusätzlich die Oberfläche. Es handelt sich nicht um eine signierte oder notarierte native .app.

## Tests und Paket

Aus diesem Ordner:

```bash
npm --prefix app test
node --check app/server.mjs
node --check app/public/app.js
zsh -n src/memguard
zsh src/memguard selftest
zsh build-release.sh
```

Die Monitor-Tests benötigen macOS und verwenden eigene Wegwerfprozesse sowie temporäre Konfigurationen. Benutzerkonfiguration und installierter Dienst bleiben unverändert. Der Selftest isoliert Pause/Messwerte und zeigt seinen temporären Logpfad.

Browserprüfung: Playwright als Testwerkzeug bereitstellen. MEMGUARD_PLAYWRIGHT_PATH kann auf eine vorhandene Installation zeigen, MEMGUARD_BROWSER_PATH auf Chromium oder Edge. Aus app dann `node test/browser.mjs` ausführen. Screenshots in app/test-results verwenden Testdaten. GitHub Actions führt die Syntax-, Unit-, API- und Monitor-Tests auf macOS aus; Browsertests sind separat. Siehe REVIEW.md für den belegten Prüfstand.

## Offene Punkte

- [ ] P1 · Betreiber: Austausch einer bestehenden Installation freigeben und anschließend live prüfen.
- [ ] P1 · Betreiber: Repräsentativen Workload pilotieren und Zielmuster/Schwellenwerte anhand echter Messungen freigeben.
- [ ] P2 · Release-Verantwortlicher: Bei Bedarf Apple-Signierung und Notarisierung für native Distribution ergänzen.
