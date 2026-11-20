# MemGuard 1.2.0

Lokale Speicherüberwachung für macOS mit Weboberfläche. MemGuard kann Speicherengpässe abmildern, garantiert aber keinen Schutz vor Kernel-Panics.

## Konzept und Weiterentwicklung

[CONCEPT.md](CONCEPT.md) beschreibt Produkt, Architektur und Sicherheitsregeln. [DEVELOPMENT.md](DEVELOPMENT.md) enthält Einstieg, Dateizuständigkeiten, Tests, Build und native Abnahme. [BACKLOG.md](BACKLOG.md) enthält priorisierte Aufgaben MG-01 bis MG-20 mit Verantwortlichkeiten und Abnahmekriterien. Eine neue Entwicklung kann diese Dokumente ohne Chatverlauf übernehmen.

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
- Treffer-Vorschau in den Einstellungen: „Treffer prüfen“ listet für die eingegebenen Zielmuster alle eigenen Prozesse mit Entscheidung, PID, Name und Muster. Funktioniert auch für noch nicht gespeicherte Muster und sendet kein Signal.
- Letzte 60 Protokollzeilen. Diagnoseexport ohne Zielpfade, Prozessnamen, Prozess-IDs und rohe Kommandozeilen. Der Export enthält Messwerte, Schwellenwerte und Monitorstatus; vor Weitergabe prüfen.
- Responsive deutsche Oberfläche, Tastaturbedienung, native Bestätigungsdialoge.

Die Prozentanzeige stammt aus `kern.memorystatus_level`. Sie ist ein Kernel-Indikator, kein RAM-Belegungswert der Aktivitätsanzeige und keine Absturzprognose. Fehlende Pflichtmesswerte erscheinen als unbekannt. Ein gesunder Zustand wird daraus nicht abgeleitet.

## Abhilfe: nicht nur anzeigen, sondern lösen

Bei Warnung oder kritischem Stand zeigt die Übersicht unter „Abhilfe“ eine kurze Stufenleiter, geordnet nach geringster Störung. Jeder Schritt wartet auf Ihre Bestätigung und gilt nur im aktuellen Stand; sinkt der Verbrauch, verschwindet er, und der Server führt ihn dann auch nicht mehr aus.

| Schritt | Wirkung | Risiko |
|---|---|---|
| Zielprozesse beenden | SIGTERM für Prozesse, die zu Ihren Zielmustern passen. Vor dem Signal wird erneut geprüft: eigener Benutzer, kein MemGuard, Muster passt noch. | mittel |
| App sauber beenden | Fragt die App per AppleScript zum Beenden (nur echte `.app`-Bundles, bis zu fünf, ab 512 MiB; der Wert ist ein Entwurfsparameter, keine Messung). Die App fragt bei offenen Änderungen nach. | mittel |
| Als Ziel vormerken | Trägt `/<App>.app/` in die Zielliste ein. Nach „Treffer prüfen“ und Speichern beendet der Monitor diese App bei kritischem Stand selbst. So wird aus einem Vorschlag die Automatik. | – |
| Neustart | Fordert einen macOS-Neustart an. Vorgeschlagen ab der Swap-Warnschwelle oder bei kritischem Stand. Bestätigung nur durch Eintippen von `NEUSTART`; Apps mit ungesicherten Änderungen können ihn unterbrechen. | hoch |

Nicht angeboten wird `purge`: Es leert laut Handbuch nur den Platten-Cache und berührt anonymen Speicher nicht. Das ist nicht die Ursache der Watchdog-Panics (Komprimierer und Swap). Swap-Dateien lassen sich nicht von Hand freigeben; macOS baut sie langsam ab, ein Neustart räumt sie vollständig.

Nie vorgeschlagen werden Prozesse anderer Benutzer, Systemdienste (Finder, Dock, WindowServer u. a.), nackte Programme ohne App-Bundle sowie MemGuard und seine Elternprozesse.

### Lokale KI als zweite Meinung (optional)

Unter Einstellungen lässt sich ein Modell auf diesem Mac eintragen (OpenAI-kompatibel, zum Beispiel Osaurus, Ollama oder LM Studio). Es prüft den Vorschlag, sortiert ihn nach Störung und Wirkung und kommentiert einzelne Schritte, auch mit „rät ab“.

- Nur Endpunkte auf diesem Gerät (127.0.0.1, ::1, localhost). Andere Hosts, Zugangsdaten, Parameter und Weiterleitungen werden abgelehnt. Es gibt keine Verbindung in die Cloud.
- Das Modell erhält Programmnamen, Größen und Schritt-Kennungen. Keine Pfade, keine Kommandozeilen, keine PIDs. Namen fremder Programme werden gefiltert und als Daten gekennzeichnet.
- Die Antwort kann nur vorhandene Schritte umsortieren und kommentieren. Sie kann nichts hinzufügen, entfernen oder ausführen; Unbekanntes wird verworfen. Ausgeführt wird allein nach Ihrer Bestätigung.
- Ohne KI, bei Ausfall, Zeitüberschreitung oder unbrauchbarer Antwort gilt der regelbasierte Vorschlag unverändert; die Oberfläche nennt den Grund.
- Einstellungen liegen getrennt von der Monitor-Konfiguration in `advisor.json`; die Konfigurationsrevision des Monitors (Heartbeat) bleibt unberührt.

Grenze: Die KI-Prüfung ist beratend und nicht reproduzierbar. Sie ersetzt nicht Ihr Urteil darüber, welche Arbeit offen ist.

## Darstellung und farpoint-CI

Schwarz ist der Standard. Der Schalter oben rechts wechselt zwischen Schwarz und Hell und merkt die Auswahl im lokalen Browserspeicher für diese Adresse. Bei einem anderen Port gilt eine andere Browseradresse; für dieselbe Auswahl über Serverneustarts einen festen MEMGUARD_PORT verwenden.

Grundlage ist der maßgebliche CI-Steckbrief „CI_farpoint“ (Juli 2026): Orange #FF6A00 für Hauptaktionen, Navy #1E2A47 und Türkis #00CED1 für Status. Die schwarze Basis ist die angeforderte dunkle Variante. Helle Textakzente bzw. dunklere Akzente im Hellmodus sichern die Lesbarkeit. Raleway und IBM Plex Sans werden lokal aus mitgelieferten WOFF2-Dateien geladen; die OFL-Lizenzen liegen unter app/public/fonts. Es entstehen keine Font-CDN-Anfragen.

MemGuard bleibt der Produktname, „powered by farpoint Solution“ benennt den Absender. Die Oberfläche verwendet sachliche Sie-Ansprache. Die Signallogik wurde für diese Gestaltungsänderung nicht verändert.

## Klassifikation

Jedes ausführbare Skript trägt im Kopf einen Block `KLASSIFIKATION` nach dem Nexus.365-Klassifikationsstandard. Der Standard ist für Microsoft-365-Skripte geschrieben. MemGuard greift auf keinen Tenant zu, er wird hier sinngemäß angewendet: Tier 2, weil nur das Endgerät des Benutzers betroffen ist.

| Skript | tier | userImpact | adminInterference | Bestimmende Achse |
|---|---|---|---|---|
| `src/memguard` | 2 | medium | medium | Reversibilität: beendete Ziel-Jobs lassen sich nur neu starten |
| `MemGuard.command` | 2 | medium | medium | Kann nach Bestätigung den Monitor starten |
| `install.sh` | 2 | medium | medium | Installiert und startet den Monitor, rückgängig mit `uninstall.sh` |
| `pkg/scripts/postinstall` | 2 | medium | medium | Wirkungsbereich: alle Benutzer eines Geräts |
| `uninstall.sh` | 2 | low | medium | Entfernt den Schutz, Neuinstallation stellt ihn wieder her |
| `pkg/scripts/preinstall` | 2 | low | medium | Stoppt kurz den laufenden Dienst |
| `build-pkg.sh`, `build-app.sh`, `build-release.sh` | 2 | none | low | Schreiben nur in Ausgabe- und Temporärordner |
| `native/MemGuard.applescript` | 2 | none | low | Zeigt Mitteilungen, entfernt nur die eigene Mitteilungsdatei |

## Entwicklungsort

Für CloudKnox gilt sonst die Regel „Command entwickelt, CloudKnox veröffentlicht“: Scripts entstehen in Nexus.365-Command und werden nach Freigabe hierher kopiert. MemGuard ist davon ausgenommen. Entscheidung des Product Owners vom 27.10.2026: MemGuard ist kein Microsoft-365-Tenant-Werkzeug, sondern läuft ausschließlich auf dem Mac des Benutzers. Es wird deshalb direkt in CloudKnox entwickelt, und dieser Ordner ist die maßgebliche Quelle. Die übrigen CloudKnox-Regeln gelten unverändert: keine Kundendaten, keine Secrets, Klassifikations-Header, selbsttragendes README, MIT-Lizenz.

## Konfiguration

Der Monitor berücksichtigt zuerst MEMGUARD_CONFIG, dann die Benutzerdatei unter `~/Library/Application Support/MemGuard/config.json`, dann die Systemdatei unter `/Library/Application Support/MemGuard/config.json`. Ohne Datei gelten Standardwerte. Die Oberfläche zeigt Benutzer-/Systemkonfiguration und schreibt ausschließlich die Benutzerkonfiguration. Fremde, über einen anderen Konfigurationspfad gestartete Instanzen werden nicht verwaltet.

| Feld | Standard | Bedeutung |
|---|---:|---|
| interval | 10 | Sekunden zwischen Prüfungen; 2–300 |
| warn_free_percent | 20 | Warnung bei Indikator ≤ Wert |
| critical_free_percent | 10 | Kritisch bei Indikator ≤ Wert |
| warn_swapfiles | 50 | Warnung ab dieser Anzahl. Auf einem 64-GB-Mac lagen im Normalbetrieb dauerhaft 20–22 Swap-Dateien vor, bei zwei Watchdog-Panics 76 und 82 (MG-12). |
| critical_swapfiles | 65 | Kritisch ab dieser Anzahl. Vorläufiger Wert unter den gemessenen Panic-Werten; vor Freigabe mit eigenem Workload prüfen. |
| warn_repeat_seconds | 600 | Wiederholungsabstand der Warnungen |
| terminate_grace_seconds | 8 | Wartezeit nach SIGTERM |
| language | en | Sprache der macOS-Mitteilungen: en/de |
| notifications | true | macOS-Mitteilungen aktiv |
| cpu_warn_load_percent | 70 | CPU-Warnung, wenn die 1-Minuten-Last diesen Anteil aller logischen Kerne erreicht; 10–400. Auf dem Zielgerät mit 18 Kernen lag der Normalbetrieb bei 26–30 %, der Vorfall vom 06.11.2026 bei rund 111 %. |
| cpu_warn_process_percent | 90 | Warnung, wenn ein einzelner Prozess so viel CPU nutzt (100 = ein Kern); 10–2000 |
| cpu_warn_minutes | 10 | So lange muss die Last ununterbrochen anliegen, bevor gewarnt wird; 1–240 |
| targets | [] | Leere Liste: ausschließlich warnen |

Die drei CPU-Felder sind optional. Eine Konfiguration ohne sie bleibt gültig und erhält die Standardwerte; beim ersten Speichern in der Oberfläche werden sie geschrieben.

Die Standards sind Ausgangswerte, keine anhand deines Workloads kalibrierten Grenzen. Zielmuster sind einfache Teilstrings vollständiger Kommandozeilen; keine regulären Ausdrücke. Tilde wird zum Benutzerverzeichnis. Verwende eindeutige Projektpfade mit 4–300 Zeichen; höchstens 50 Muster. Ein Muster kann mehrere Prozesse treffen. Die Prozessübersicht zeigt nur die 100 größten Prozesse. Vollständig ist die Treffer-Vorschau: in den Einstellungen „Treffer prüfen“ oder im Terminal `memguard preview [config] [monitor-pid]`. Sie nutzt dieselbe Entscheidungsfunktion wie der Signalpfad. Elternprozesse werden gegen den laufenden Monitor geprüft; läuft keiner, ist nur PID 1 als Elternprozess ausgeschlossen.

Ein laufender Monitor lädt Änderungen nach 30 Prüfzyklen neu, bei zehn Sekunden Intervall ungefähr fünf Minuten, bei Signal-Wartezeiten länger. Speichern und Rücklesen beweist noch keine Übernahme durch den laufenden Monitor. Ab dieser Fassung schreibt der Monitor in jedem Zyklus einen Heartbeat (`heartbeat.json` im Protokollordner) mit Version, geladener Konfigurationsrevision (SHA-256 über Pfad und Dateiinhalt), wirksamen Werten und Zeitpunkt. Die Oberfläche unterscheidet daraus drei Stufen: **gespeichert** (Datei gelesen), **geladen** (Heartbeat nennt dieselbe Revision) und **wirksam geprüft** (zusätzlich dieselben Zielmuster und Schwellen, Prozess lebt, Messung zuletzt erfolgreich). Ein veralteter, ungültiger oder fehlender Heartbeat, ein toter Prozess oder ein Prozess ohne `memguard run` gilt nie als aktiver Schutz. „Wirksam geprüft“ beweist nicht, dass der Monitor unter Last die richtigen Prozesse beendet. Ein älterer Monitor (z. B. 1.0.0) schreibt keinen Heartbeat und erscheint als „Ohne Rückmeldung“, bis er aktualisiert wird.

## CPU-Wächter (nur Warnung)

Der Lüfter folgt der CPU, nicht dem Speicher. Am 06.11.2026 lief er dauerhaft, während der Speicherindikator bei 38 % frei lag: Eine Menüleisten-App startete alle zwei Sekunden vier Kommandozeilenprogramme neu, die Last stand bei rund 20 auf 18 Kernen. Darum prüft derselbe Monitor in jedem Zyklus zusätzlich:

1. **Gesamtlast.** Liegt die 1-Minuten-Last für `cpu_warn_minutes` ununterbrochen über `cpu_warn_load_percent` aller Kerne, meldet MemGuard „CPU-Last hoch“ mit den drei größten Verbrauchern (nach .app-Bundle zusammengefasst).
2. **Dauerstarter.** In derselben Meldung nennt er den Elternprozess mit den meisten Kindprozessen, die jünger als 30 Sekunden sind (ab drei; launchd und MemGuard selbst ausgenommen). So wird eine Schleife sichtbar, die laufend kurzlebige Prozesse startet und in keiner Verbrauchsliste lange auftaucht.
3. **Einzelprozess.** Erreicht ein Prozess `cpu_warn_process_percent`, beobachtet MemGuard ihn ein Fenster lang (`cpu_warn_minutes`) und bildet den Durchschnitt aller Messungen. Liegt der Durchschnitt bei oder über der Schwelle, meldet er „Prozess dauerhaft ausgelastet“ mit Name, PID und Durchschnitt. Kurze Ausreißer darunter setzen das Fenster nicht zurück. Am Fensterende beginnt ein neues, wenn der Prozess noch über der Schwelle liegt, sonst endet die Beobachtung. Ein Neustart des Prozesses (andere Startzeit) beginnt neu. Anlass: Am 11.11.2026 pendelte ein Safari-Hilfsprozess 15 Minuten lang zwischen 74 und 94 % und blieb mit der früheren Regel „jede Messung über der Schwelle“ unerkannt.

Wiederholt wird jede Meldung frühestens nach `warn_repeat_seconds`. Der CPU-Wächter sendet **nie** ein Signal, auch nicht an Zielmuster; Pause und Zielliste betreffen ihn nicht. Logzeilen beginnen mit `CPU-WARN`.

Grenzen: `%CPU` von `ps` ist unter macOS ein gleitender Mittelwert, ein kurzer Spitzenwert wird geglättet. Die Dauerstarter-Erkennung ist eine Stichprobe je Zyklus und kann Prozesse übersehen, die kürzer als das Intervall leben; sie nennt den wahrscheinlichsten Verursacher, keinen Beweis. Der Heartbeat enthält die CPU-Werte noch nicht, „wirksam geprüft“ bezieht sich weiter nur auf Speicherschwellen und Ziele.

## Signalverhalten

1. JSON-Typen und Wertebereiche prüfen. Ungültige Konfiguration stoppt den Monitor.
2. Messen. Bei fehlenden Pflichtwerten protokollieren und keine Signale senden.
3. Bei kritischen Werten und aufgehobener Pause nur passende Prozesse des eigenen Benutzers auswählen. Eigener Prozess, Vorfahren, PID 1 und MemGuard-Kommandos sind ausgeschlossen.
4. Eigentümer, Startzeit und Kommandozeile vor SIGTERM prüfen.
5. Nach der Wartezeit erneut messen. SIGKILL nur bei weiterhin kritischen Werten, unveränderter Identität und aufgehobener Pause.

Das Log unterscheidet gesendete Signale von bestätigtem Prozessende (`term_sent`, `kill_sent`). Rotation bei mehr als 5 MiB; eine Vorgängerversion bleibt. Ein Stopp-Signal, das während eines Abspaltens (`$(...)`) eintrifft, wird vom Kindprozess an den Hauptprozess weitergereicht; sonst lief der Monitor in rund einem Drittel der gemessenen Fälle weiter (MG-17). Eine Locksperre (`monitor.lock` mit PID im Log-Ordner) verhindert parallele Instanzen. Sie wird beim Beenden entfernt. Nach einem nicht abfangbaren Abbruch, einem Absturz oder einem Neustart bleibt sie liegen und wird beim nächsten Start übernommen, wenn die gespeicherte PID kein laufender `memguard run` ist. Gehört sie einem laufenden Monitor, startet die zweite Instanz nicht und meldet das. Ein Lock ohne PID gilt in den ersten fünf Sekunden als „wird gerade angelegt“.

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

- [ ] P1 · Betreiber/QA: Installation auf dem Zielgerät läuft seit 26.10.2026 (1.2.0, zuletzt aktualisiert 20.11.2026); offen sind der sichtbare Mitteilungsklick (MG-02) und der Rückkehrtest auf einem Testgerät (MG-03).
- [ ] P1 · Betreiber: Eine Woche `CPU-WARN`-Zeilen gegen Fehlalarme prüfen (MG-20).
- [ ] P1 · Betreiber: Repräsentativen Workload pilotieren und Zielmuster/Schwellenwerte anhand echter Messungen freigeben.
- [ ] P2 · Release-Verantwortlicher: Bei Bedarf Apple-Signierung und Notarisierung für native Distribution ergänzen.
