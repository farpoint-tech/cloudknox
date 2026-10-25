# MemGuard 1.1.1 – Entwicklungs- und Prüfbericht

Stand: 23. Oktober 2026. Ausgangspunkt: `claude/macos-memguard`, Commit `1cc95fe`. Die Überarbeitung ergänzt eine lokale Webanwendung und härtet den vorhandenen zsh-Monitor. Keine bestehende Installation wurde ersetzt und kein echter Benutzerprozess für Tests beendet.

## Befunde und Änderungen

| Befund im Ausgangscode | Änderung | Nachweis |
|---|---|---|
| Fehler beim Lesen des Speicherindikators wurden zu 100 Prozent frei | Unbekannter Zustand; kein Signal bei Messfehler | Monitor- und API-Tests |
| Auswahl aus allen Benutzern, keine vollständige Vorfahrenprüfung | Nur eigener Benutzer; eigene PID, Vorfahren und PID 1 ausgeschlossen | Auswahlcode, echter Ziel-/Nichtzieltest, Vorfahrentest |
| SIGKILL ohne erneute Prozessidentitätsprüfung | Benutzer/Startzeit/Kommando erneut prüfen | Identitätswechseltest unterdrückt SIGKILL |
| Keine erneute Druck-/Pauseprüfung vor SIGKILL | Neue Messung und Pauseprüfung nach Wartezeit | Drei Eskalationstests |
| Konfiguration ohne strikte Typ-/Bereichsprüfung | JSON-Typen, Intervalle, geordnete Schwellen, Zielmuster prüfen | Validierungs- und Shelltests |
| Prozessnamen wurden in AppleScript-Code interpoliert | Mitteilungstexte als Argumente übergeben | Codeprüfung; keine realen Mitteilungen im Test |
| Mehrere neue Monitorinstanzen konnten parallel laufen | Verzeichnislock mit PID; explizite Fehlermeldung bei bestehendem Lock | Locktest |
| Unbegrenztes Log und ungenaue Erfolgsaussage | Rotation und Benennung tatsächlich gesendeter Signale | Codeprüfung; Selftest |
| Selftest abhängig von echter Pause und echtem Swap | Isolierte Messwerte/Pause, geprüfte Logeffekte | Selftest erfolgreich |
| Keine grafische Bedienung | Responsive lokale Oberfläche mit Live-Daten, Prozessen, Konfiguration, Pause, Log und Export | Browserdurchlauf |

## Ausgeführte Prüfungen

- **19/19 automatisierte Tests bestanden**, keine übersprungenen Tests: Kernlogik, JSON-Validierung, Prozessparser, HTTP/CSRF/Host-Schutz, Konfigurationskonflikte, Sicherung und Rücklesen, Pause, Fehlerzustände, Prozesssignale und Instanzlock.
- Der echte Signaltest startete zwei eigene kurzlebige Sleep-Prozesse. Nur der ausdrücklich gewählte Testprozess erhielt SIGTERM. Für Identitätswechsel und Eskalationsbedingungen wurden Signale in einer isolierten Shell abgefangen; keine echten SIGKILL gegen Benutzeranwendungen.
- **Browserdurchlauf bestanden**, mit einem isolierten Testprofil und temporärer Konfiguration: Desktop 1440 × 1100, Mobilansicht 390 × 844, kein horizontaler Überlauf in Übersicht/Einstellungen, Navigation, Prozessfilter, Erhalt ungespeicherter Eingaben über Polling, Abbrechen/Bestätigen/Speichern/Rücklesen, Pause, kritischer und unbekannter Zustand, Log und Diagnose-Download. Keine JavaScript- oder CSP-Fehler.
- Browser-Testdaten sind synthetisch. Zusätzlich wurde die Live-Oberfläche auf dem vorhandenen Mac mit echten Messdaten lesend geprüft. Der bereits vorhandene LaunchAgent wurde erkannt; dessen Austausch wurde nicht ausgeführt.
- zsh-Syntaxprüfungen, Node-Syntaxprüfungen und `git diff --check` bestanden. Der separate Monitor-Selftest bestätigte seine vier Fälle.

## Fehler während der Entwicklung

- `plutil -lint` akzeptierte die vorhandene JSON-Datei nicht. Ursache war die gewählte Prüfmethode. Umgestellt auf verlustfreie Konvertierungsprüfung und zusätzliche Typprüfung; danach grün.
- Der erste Host-Header-Test verwendete Node fetch, das den gesetzten Host nicht wie erwartet übertrug. Auf eine echte HTTP-Anfrage mit explizitem Host umgestellt; der Schutz blieb aktiv und wurde erfolgreich geprüft.
- Die gebündelte Playwright-Version hatte keinen passenden heruntergeladenen Chromium-Browser. Zwei Startversuche scheiterten daran. Anschließend wurde die vorhandene Edge-Binärdatei mit einem separaten Testprofil verwendet; der vollständige Browserlauf ist grün.
- Ein unnötiger CSS-Import erzeugte eine CSP-Meldung und wurde entfernt; eine Favicon-Anfrage erhält nun 204. Der abschließende Browserlauf meldet keine Konsolenfehler.

## Grenzen des Nachweises

Die Entwicklung ist als lokale macOS-Webanwendung abgeschlossen und lokal geprüft. Nicht nachgewiesen sind Schutz unter absichtlich erzeugtem realem Speicherkollaps, Dauerbetrieb über mehrere Tage, alle macOS-Versionen, sichtbare Zustellung von macOS-Mitteilungen und die Übernahme in eine bestehende Installation. Ein Kernel-Panic lässt sich nicht allgemein verhindern. Das verbleibende Zeitfenster zwischen Identitätsprüfung und Signal ist nicht atomar geschlossen.

Der bestehende PKG-/Installationsweg wurde nicht auf dem Benutzergerät ausgeführt. Die neue ZIP-Auslieferung benötigt Node.js 22 oder neuer. Apple-Signierung/Notarisierung und eine eigenständige native App gehören nicht zu diesem Lieferumfang. GitHub-CI ist separat zum lokalen Prüfstand zu bewerten; ein neuer Workflow allein ist noch kein bestandener CI-Lauf.

Die Standardschwellen sind nicht anhand eines repräsentativen Workloads kalibriert. Ein gespeicherter Wert beweist keine Übernahme durch einen externen Monitor. Die Oberfläche erkennt den Dienst, bestätigt aber dessen Binärversion nicht. Eine frühere Version erhält ihre neuen Sicherheitsprüfungen erst durch ein freigegebenes Update.

## Nachprüfung 1.1.1: Schwarzmodus und farpoint-CI

Die Oberfläche wurde auf die vorgegebenen farpoint-Farben, lokale Raleway-/IBM-Plex-Sans-Schriften und Sie-Ansprache umgestellt. Schwarz ist Standard, Hell bleibt wählbar. Der frühe Theme-Loader verhindert ein helles Aufblitzen beim Laden einer gespeicherten dunklen Auswahl. Die Einstellung wird pro Browseradresse gespeichert; gesperrter Browserspeicher verhindert nicht das Umschalten für die aktuelle Seite.

Erneut bestanden: 19 automatisierte Tests und der erweiterte Browserdurchlauf mit beiden Modi, gespeichertem Zustand nach Reload, Tastaturumschaltung, lokal geladenen Schriften und Desktop-/Mobilansicht. Sieben definierte Text-/Hintergrundpaare wurden in beiden Modi mit mindestens 4,5:1 geprüft. Dies ist keine vollständige WCAG-Zertifizierung. Keine JavaScript- oder CSP-Fehler im Browserdurchlauf. Prozess- und Signalverhalten unverändert.

## Offene Punkte

- [ ] P1 · Betreiber: Update der vorhandenen Installation gesondert freigeben und Version, Status, Konfigurationsübernahme live prüfen.
- [ ] P1 · Betreiber: Repräsentativen Pilotbetrieb mit überprüften Zielmustern durchführen; bei Messfehlern oder unerwarteten Treffern pausieren.
- [ ] P2 · Maintainer: Draft-PR und GitHub-Prüfungen vor Merge prüfen.
- [ ] P2 · Release-Verantwortlicher: Falls benötigt, signierte/notarierte native Distribution ergänzen.

## Nachprüfung 1.2.0 – 25. Oktober 2026

Bestandsprüfung: Im Repository standen README und Prüfbericht, aber kein vollständiges Konzept, keine Entwicklungsübergabe und kein priorisierter Arbeitsvorrat. Ergänzt: CONCEPT.md, DEVELOPMENT.md und BACKLOG.md mit Architektur, Dateizuständigkeiten, Sicherheitsinvarianten, ausführbaren Prüfungen, Definition of Done, Installationsgrenzen und Abnahmekriterien pro Aufgabe. Im Repository-README verlinkt.

Die bestehende Benutzerinstallation meldet weiterhin 1.0.0 und erzeugt Mitteilungen via osascript. Der gemeldete Dateiauswahldialog selbst wurde nicht reproduziert. Die neue Fassung führt einen eigenen nativen App-Absender und einen Dashboard-Starter mit Produkt-/Versionsprüfung ein. App-Aktivierung öffnet die Statistik im Standardbrowser, startet bei Bedarf den lokalen Server und aktiviert dabei keinen zusätzlichen Monitor.

Lokal nachgewiesen: 24/24 automatisierte Tests bestanden, keine übersprungenen Tests; erweiterter Browserdurchlauf für Schwarz/Hell, Formulare und Fehlerzustände bestanden. App-Build und ad-hoc-Signaturprüfung; tatsächlicher App-Direktstart startet den Server mit erwarteter Produktkennung/Version; in Edge sichtbare Übersicht mit RAM, Swap, Prozessen und bestehendem externen LaunchAgent. Neue Startertests prüfen Wiederverwendung, Start/Bereitschaft und fremden belegten Port. Der simulierte Signaltest berührt weiterhin ausschließlich eigene Wegwerfprozesse.

Beim ersten App-Build störten FinderInfo/File-Provider-Attribute die Signierung. Build in eigenes /tmp-Staging verlegt, ausschließlich am erzeugten Bundle Attribute bereinigt und Signaturprüfung erfolgreich durchgeführt. Beim Test der Mitteilungsnutzlast war ein nicht vorhandener unlink-Pfad fehlerhaft; auf die begrenzte eigene Nutzlastbereinigung umgestellt. Die BSD-mktemp-Vorlage wurde so korrigiert, dass die Zufallszeichen am Ende stehen. Ein Regressionstest prüft jetzt getrennte Namen, private Berechtigungen und uninterpretierte Inhalte.

Native Mitteilungen: Nutzlastverarbeitung und App-Aktivierung sind implementiert; ein sichtbar zugestellter und tatsächlich angeklickter Banner konnte über die verfügbare UI nicht abschließend verifiziert werden. Dies bleibt MG-02. Die produktive Benutzerinstallation wurde nicht aktualisiert. Ein erfolgreicher App-/open-Aufruf ist kein Zustellnachweis. Die neue native App braucht den freigegebenen Installationsschritt, bevor neue echte Monitorwarnungen diese Kette verwenden.

## Offene Punkte 1.2.0

- [ ] P1 · QA/Betreiber: MG-02 mit sichtbarem Testbanner und tatsächlichem Klick am endgültigen Installationspfad abnehmen.
- [ ] P1 · Betreiber: MG-03 – Benutzerinstallation gesondert freigeben und vollständig zurückprüfen.
- [ ] P2 · Entwicklung: Weitere Aufgaben gemäß BACKLOG.md; keine Vollständigkeit des Pilot-/Rolloutnachweises behaupten.
