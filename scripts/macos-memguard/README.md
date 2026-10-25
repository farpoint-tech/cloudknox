# MemGuard 1.2.0

Lokale Speicherüberwachung für macOS mit Weboberfläche. MemGuard kann Speicherengpässe abmildern, garantiert aber keinen Schutz vor Kernel-Panics.

## Konzept und Weiterentwicklung

[CONCEPT.md](CONCEPT.md) beschreibt Produkt, Architektur und Sicherheitsregeln. [DEVELOPMENT.md](DEVELOPMENT.md) enthält Einstieg, Dateizuständigkeiten, Tests, Build und native Abnahme. [BACKLOG.md](BACKLOG.md) enthält priorisierte Aufgaben MG-01 bis MG-11 mit Verantwortlichkeiten und Abnahmekriterien. Eine neue Entwicklung kann diese Dokumente ohne Chatverlauf übernehmen.

## Mitteilung anklicken → Statistik

Ab 1.2.0 ist **MemGuard.app** der eigene Mitteilungsabsender. Ein Klick auf die Mitteilung bzw. „Show/Anzeigen“ aktiviert die App und öffnet die lokale Statistikseite. Eine Datei muss dafür weder ausgewählt noch manuell geöffnet werden. Der Starter verwendet einen passenden laufenden Server erneut oder startet ihn und wartet auf dessen Bereitschaft. Die interne Mitteilungsdatei ist ausschließlich Datentransport zwischen Monitor und App.

Die installierte Version muss dafür aktualisiert sein. Alte Meldungen von osascript/Script Editor behalten ihren alten Absender; sie sind kein Test der neuen Version. Sichtbare Zustellung und Klickverhalten hängen zusätzlich von den macOS-Mitteilungs-/Fokuseinstellungen ab und müssen nach Installation geprüft werden.

## Starten

Voraussetzungen: macOS und Node.js 22 oder neuer. Es gibt keine npm-Laufzeitabhängigkeiten; kein npm install nötig. Das ZIP entpacken und **dist/MemGuard.app** öffnen. Alternativ aus dem Quellordner `zsh MemGuard.command` starten. Beides öffnet die lokale Statistikseite.

Der Starter verwendet standardmäßig `http://127.0.0.1:8765`; der Server bindet nur an `127.0.0.1`. Optional: `MEMGUARD_PORT=8765 zsh MemGuard.command`. Keine Cloud, keine Telemetrie, keine externen Schriftarten. Der App-Starter lässt den Statistikserver im Hintergrund laufen; dessen Ausgabe steht unter ~/Library/Logs/MemGuard/dashboard.log. Das Schließen des Browser-Tabs stoppt ihn nicht. Für Entwicklung kann node app/server.mjs direkt im Terminal gestartet und mit Ctrl+C beendet werden.

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

`install.sh` installiert den Hintergrundmonitor als Benutzer-LaunchAgent und die zugehörige MemGuard.app. Zuerst die aktuelle App mit zsh build-app.sh bauen bzw. das vollständige ZIP verwenden. Der Installer sichert vorhandene Dateien in einem update-backup-Ordner. Das Öffnen der Oberfläche führt diesen Schritt nicht aus. Vor dem Update Binärdatei, Konfiguration und LaunchAgent sichern. Ohne --config bleibt die Konfiguration erhalten. Nach ausdrücklicher Freigabe `./install.sh` ausführen und anschließend mit der installierten Binärdatei `version` und `status` prüfen.

Zuerst ohne Zielmuster bzw. pausiert pilotieren. Abbruchkriterien: unbekannte Messwerte, unerwartete Treffer, wiederholte Monitorabbrüche. Für einen Rollback Dienst beenden, gesicherte Binärdatei/LaunchAgent wiederherstellen und Dienst erneut prüfen. Bereits verlorene Prozessarbeit lässt sich dadurch nicht wiederherstellen.

Die vorhandenen build-pkg.sh und uninstall.sh bleiben verfügbar. ZIP und PKG enthalten seit 1.2.0 auch MemGuard.app. Das App-Bundle ist lokal ad hoc signiert; es ist weder Developer-ID-signiert noch notarisiert. Das PKG muss zusätzlich für seine Zielumgebung abgenommen werden.

## Tests und Paket

Aus diesem Ordner:

```bash
npm --prefix app test
node --check app/server.mjs
node --check app/public/app.js
zsh -n src/memguard
zsh src/memguard selftest
zsh build-app.sh
zsh build-release.sh
```

Die Monitor-Tests benötigen macOS und verwenden eigene Wegwerfprozesse sowie temporäre Konfigurationen. Benutzerkonfiguration und installierter Dienst bleiben unverändert. Der Selftest isoliert Pause/Messwerte und zeigt seinen temporären Logpfad.

Browserprüfung: Playwright als Testwerkzeug bereitstellen. MEMGUARD_PLAYWRIGHT_PATH kann auf eine vorhandene Installation zeigen, MEMGUARD_BROWSER_PATH auf Chromium oder Edge. Aus app dann `node test/browser.mjs` ausführen. Screenshots in app/test-results verwenden Testdaten. GitHub Actions führt die Syntax-, Unit-, API- und Monitor-Tests auf macOS aus; Browsertests sind separat. Siehe REVIEW.md für den belegten Prüfstand.

## Offene Punkte

- [ ] P1 · Betreiber: Austausch einer bestehenden Installation freigeben und anschließend live prüfen.
- [ ] P1 · Betreiber: Repräsentativen Workload pilotieren und Zielmuster/Schwellenwerte anhand echter Messungen freigeben.
- [ ] P2 · Release-Verantwortlicher: Bei Bedarf Apple-Signierung und Notarisierung für native Distribution ergänzen.
