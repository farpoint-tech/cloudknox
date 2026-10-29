# MemGuard – Produkt- und Architekturkonzept

Stand: 25. Oktober 2026. Gilt für `scripts/macos-memguard` im Repository `farpoint-tech/cloudknox`. Einstieg für Entwicklung: [DEVELOPMENT.md](DEVELOPMENT.md); verbindliche Arbeitspakete: [BACKLOG.md](BACKLOG.md). Dieses Dokument beschreibt implementiertes Verhalten und offene Grenzen getrennt.

## Problem und Ziel

Bei Speicherengpässen soll ein Mac früh warnen und ausdrücklich freigegebene, verzichtbare lokale Jobs gezielt beenden können. Anwender brauchen verständliche Messwerte und einen direkten Weg von der Meldung zur Statistik. Ein allgemeines Versprechen, Kernel-Panics zu verhindern, ist ausgeschlossen.

Primäre Nutzer sind Mac-Anwender mit lokalen KI-/Render-Workloads und betreuende Administratoren. Produktname: MemGuard. Absender: farpoint Solution. Sachliche Sie-Ansprache; Orange #FF6A00, Navy #1E2A47, Türkis #00CED1 sparsam für Status. Raleway und IBM Plex Sans werden lokal ausgeliefert. Schwarz ist Standard, Hell wählbar.

## Verbindliche Nutzerabläufe

### Warnung → Statistik

1. Der laufende Monitor erkennt eine konfigurierte Warn-/kritische Schwelle.
2. Er legt eine private, zufällig benannte Mitteilungsdatei unter `~/Library/Logs/MemGuard/notifications/` an (Verzeichnis 0700, Datei 0600). Sie enthält ausschließlich Titel und Nachricht, keinen ausführbaren Code und keine frei wählbare Ziel-URL.
3. Er übergibt sie explizit an **MemGuard.app**, die als Absender die Mitteilung ausgibt und nur die eigene Nutzlast entfernt. Das ist interner Transport; Anwender sollen niemals eine Datei auswählen.
4. Klick auf die Mitteilung bzw. deren systemseitige Aktion aktiviert MemGuard.app. `run`/`reopen` führen den Dashboard-Starter aus.
5. Der Starter prüft den lokalen HTTP-Gesundheitsendpunkt. Bei passender Produktkennung/Version verwendet er den Server erneut; andernfalls startet er einen Server und wartet auf dessen Bereitschaft.
6. Erst nach erfolgreicher Prüfung öffnet der Standardbrowser `http://127.0.0.1:8765`. Bei belegtem/falschem Port erscheint eine konkrete Fehlermeldung. Es wird keine beliebige fremde Webseite geöffnet.

Der Plattformtext „Show/Anzeigen“ wird von macOS gesteuert. Entscheidend ist das Ziel: die Statistikseite. Die neue App ist dafür selbst der Absender; eine generische osascript-/Script-Editor-Aktivierung ist kein zulässiger Produktablauf.

### Direktstart

MemGuard.app doppelklicken bzw. `zsh MemGuard.command` starten. Derselbe Dashboard-Starter wird verwendet. Der Start öffnet die Übersicht, installiert keinen LaunchAgent und aktiviert keinen weiteren Prozessmonitor. Ein existierender externer LaunchAgent wird angezeigt. Ein geschlossener Browser-Tab stoppt weder Server noch externen Monitor.

### Konfiguration / Pause

Konfiguration vollständig darstellen, Änderungen mit Ist/Soll bestätigen, Revision gegen konkurrierende Änderungen prüfen, vorhandene Datei sichern, atomar ersetzen und vollständig zurücklesen. Pause und Aufheben der Pause sind separate bestätigte Aktionen. Eine gespeicherte Konfiguration beweist noch nicht die Übernahme durch einen externen Monitor.

## Bausteine und Verantwortung

| Baustein | Datei | Verantwortung |
|---|---|---|
| Monitor | `src/memguard` | Messen, Schwellen, Zielauswahl, Signalprüfungen, Logs, Benachrichtigung an App |
| Native App | `native/MemGuard.applescript` | Eigener Mitteilungsabsender, Aktivierung → Dashboard; keine Prozesssignale |
| App-Build | `build-app.sh` | Reproduzierbare .app mit stabiler Bundle-ID `tech.farpoint.memguard.app` und gebündeltem UI-Code |
| Dashboard-Starter | `app/open-dashboard.mjs` | Identität/Version prüfen, Server starten/wiederverwenden, Browser öffnen |
| HTTP-Server | `app/server.mjs` | Lokale Messwerte und bestätigte Verwaltungsaktionen; ausschließlich Loopback |
| Kernlogik | `app/core.mjs` | Strikte JSON-Validierung, Zustandsklassifizierung, Prozessdarstellung ohne rohe Argumente |
| Oberfläche | `app/public/` | Daten anzeigen, Aktionen bestätigen, Theme, lokale Fonts; kein Direktzugriff auf Betriebssystem |
| Installation/Pakete | `install.sh`, `build-release.sh`, `build-pkg.sh` | Explizite Bereitstellung, Sicherung und Auslieferung |

Die App benötigt Node.js ≥22. Der Monitor benötigt die macOS-Bordmittel; interaktive Mitteilungen benötigen die gebaute/installierte App. Node wird nicht mitgeliefert. Die App ist lokal ad hoc signiert, nicht mit Developer ID signiert/notarisiert.

## Datenmodell und Zustände

`GET /api/health` liefert nur `{app, version}` als überprüfbare Produktkennung. `GET /api/status` liefert Version, Messzeit, Messzustand, Kernel-Indikator, RAM, Swap, Swap-Dateien, Prozessübersicht, Konfiguration/Revision, Pause, Monitorstatus, Fehler und Verlauf. Messzustand und Monitorstatus sind unabhängig: ein normaler Messwert beweist keinen aktiven Monitor.

Zustände: `normal`, `warning`, `critical`, `unknown`. Fehlt ein Pflichtmesswert oder ist die Konfiguration ungültig, ist keine Aussage „gesund“ zulässig. `kern.memorystatus_level` wird als Kernel-Indikator bezeichnet, nicht als prozentual belegter/freier RAM der Aktivitätsanzeige.

Prozessdaten enthalten PID, Anzeigename, RSS, eigenen Benutzer und Mustertreffer. Rohe Kommandozeilen bleiben im Backend. Die Übersicht enthält die 100 größten Prozesse; Treffer dort sind keine vollständige betroffene Population. Vollständig ist die Treffer-Vorschau (`memguard preview`, `GET /api/preview`): Sie listet jeden eigenen Prozess, den ein Muster trifft, mit der Entscheidung aus derselben Funktion `target_reason`, die auch vor jedem Signal läuft. Sie sendet kein Signal. Der Verlauf umfasst 180 Abfragen im Arbeitsspeicher und wird nicht dauerhaft archiviert.

Die Konfiguration besteht ausschließlich aus den in `app/core.mjs` definierten Feldern. Referenz: `src/config.default.json`. Shell und Node müssen identische Typ-/Bereichsregeln behalten. Zielmuster sind Teilstrings, keine regulären Ausdrücke. Leere Liste bedeutet ausschließlich warnen.

## Sicherheitsinvarianten

- Keine pauschale Prozessbeendigung, keine Root-Ausführung des Monitors, keine Browser-Remoteverwaltung.
- Eigener Benutzer, Startzeit und Kommandozeile vor Signalen prüfen. Eigene PID, Vorfahren, PID 1 und MemGuard-Kommandos ausschließen.
- Vor SIGKILL neue Messung, Identität und Pause prüfen. Verbleibendes Zeitfenster zwischen Prüfung und Signal ehrlich dokumentieren.
- Fehlende Messung erzeugt keine Signale. Ungültige Konfiguration stoppt den Monitor.
- HTTP nur `127.0.0.1`, explizite Host-/Origin-Prüfung, Sitzungstoken, JSON und Bestätigung für schreibende API-Aufrufe. CSP bleibt aktiv.
- Browser-/App-Aktivierung startet keinen zweiten Monitor. Kein Dateiauswahldialog zum Öffnen der Statistik.
- Mitteilungsinhalte werden als Daten transportiert, niemals in Skriptcode interpoliert. Die native App nimmt ausschließlich ihren eigenen Nutzlastpfad an.
- Logs benennen gesendete Signale, nicht einen ungeprüften erfolgreichen Prozessabbruch. Keine Telemetrie/Cloud-Abhängigkeit.

## Bereitstellung und Nachweisgrenzen

Source-/PR-Stand, gebaute App und installierter Dienst sind unterschiedliche Zustände. Stand der ersten Bestandsprüfung am 25.10.2026: PR #39/#40 offen; installierte Binärdatei meldet 1.0.0. Die neue App und das Konzept ändern diese Installation nicht automatisch.

Die Click-to-open-Kette ist technisch implementiert. Unit-/API-Tests, realer App-Direktstart und Browser-Liveansicht können automatisiert nachgewiesen werden. Sichtbare macOS-Mitteilungszustellung und tatsächlicher Klick bei den Benutzer-/Fokus-/Mitteilungseinstellungen erfordern zusätzlich den nativen Akzeptanztest in DEVELOPMENT.md. Ein erfolgreicher `open`-Aufruf allein reicht dafür nicht.

## Offene Punkte

- [ ] P1 · Betreiber/QA: Sichtbaren Mitteilungsklick inklusive geschlossenem Dashboard nach Installation abnehmen (MG-02).
- [ ] P1 · Betreiber: Upgrade und Rückkehr zur gesicherten Version für das konkrete Zielgerät freigeben und verifizieren (MG-03).
- [x] P1 · Entwicklung: Vollständige Prozessvorschau für neue Zielmuster umgesetzt am 29.10.2026 (MG-04).
- [ ] P2 · Entwicklung/Release: Weitere Arbeitspakete mit Abnahmekriterien siehe BACKLOG.md.
