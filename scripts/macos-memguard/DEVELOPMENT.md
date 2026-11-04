# MemGuard – Übergabe an die nächste Entwicklung

Dieses Verzeichnis ist ein eigenständiges Unterprojekt im Cloudknox-Repository. Kein Wissen aus einem Chat wird vorausgesetzt. Lesen Sie zuerst [CONCEPT.md](CONCEPT.md), dann [BACKLOG.md](BACKLOG.md), danach die konkrete Datei und den zugehörigen Test. [README.md](README.md) beschreibt die Bedienung, [REVIEW.md](REVIEW.md) den belegten Prüfstand.

## Arbeitsstand übernehmen

Das Projekt lag bei Erstellung dieser Übergabe auf `codex/mem-panic-app`; PR #40 baut auf `claude/macos-memguard` / PR #39 auf. Vor Beginn GitHub-Status und aktuellen Commit neu lesen. Offen/entworfen bedeutet nicht gemergt. Die Website im Repository und die lokale Mac-App sind getrennte Produkte; ein Vercel-Websitecheck liefert keinen Laufnachweis für macOS-Mitteilungen.

```sh
git clone https://github.com/farpoint-tech/cloudknox.git
cd cloudknox
git fetch origin
git switch codex/mem-panic-app
cd scripts/macos-memguard
```

Keine globale Tool-Aktualisierung, Root-Ausführung oder Änderung einer Benutzerinstallation ist zum Entwickeln erforderlich. Tests mit eigenen temporären Konfigurationen und Wegwerfprozessen ausführen. Niemals echte Speicherknappheit erzeugen, um den Signalpfad zu testen.

## Voraussetzungen und Start

macOS, zsh, Node.js ≥22, Apple-Werkzeuge `osacompile`, `plutil`, `codesign`. Die UI benötigt keine npm-Laufzeitabhängigkeiten. Zum Dashboardstart `zsh MemGuard.command` ausführen: fester lokaler Port 8765, vorhandenen passenden Server wiederverwenden. Ein explizites MEMGUARD_PORT gilt für den jeweiligen Startprozess; Finder-App und Monitor müssen denselben Port verwenden, wenn der Standard geändert wird.

`node app/server.mjs` startet alternativ einen Server auf einem freien Port und gibt die Adresse aus. Dieser direkte Entwicklungsstart wird vom nativen Standardstarter nicht automatisch gefunden; verwenden Sie für die Mitteilungskette Port 8765. Der Gesundheitsendpunkt gibt Produktkennung und Version zurück. Der Browserzugriff verändert keinen laufenden Monitor.

## Automatisierte Prüfungen

```sh
npm --prefix app test
node --check app/server.mjs
node --check app/open-dashboard.mjs
node --check app/public/app.js
node --check app/public/theme.js
zsh -n src/memguard MemGuard.command build-app.sh install.sh build-release.sh
git diff --check
```

`app/test/core.test.mjs`: Zustände, Typen, Parser. `server.test.mjs`: Loopback-Schutz und bestätigte Schreibaktionen. `monitor.test.mjs`: echte eigene Dummy-Prozesse sowie abgefangene Eskalationssignale. `dashboard.test.mjs`: bestehender/gestoppter Server, Version und fremder Port. Für Tests der Systemintegration keine produktive Konfiguration anpassen.

Browserdurchlauf: Playwright als separates Testwerkzeug, vorhandene Installation über MEMGUARD_PLAYWRIGHT_PATH und Chromium-/Edge-Binärdatei über MEMGUARD_BROWSER_PATH angeben, dann aus `app` `node test/browser.mjs`. Dieser Lauf verwendet synthetische Daten und prüft Darstellung, Theme, Formulare und Fehlerzustände. Er prüft keine macOS-Mitteilungsklicks.

## Native App und Paket bauen

```sh
zsh build-app.sh
codesign --verify --deep --strict dist/MemGuard.app
zsh build-release.sh
```

Der Build überschreibt keine vorhandene App. Für einen neuen Build einen frischen Ausgabeordner über MEMGUARD_APP_OUTPUT wählen bzw. eine eigene alte Buildkopie ausdrücklich beiseitelegen. In File-Provider-Verzeichnissen störende Finder-Attribute sind der Grund für das Build-Staging unter /tmp und die Attributbereinigung ausschließlich am eigenen Build. Ad-hoc-Signierung bestätigt die lokale Bundleintegrität, keine Apple-Distributionsfreigabe.

Die App enthält ihren UI-Server, Starter, lokalen Assets und den Monitor. Node.js wird auf dem Zielgerät erwartet. `build-release.sh` erwartet die aktuelle App unter dist/MemGuard.app und nimmt sie einschließlich der Entwicklungsdokumente ins ZIP auf. `build-pkg.sh` enthält seit 1.2.0 ebenfalls die App; systemweite Installation und Benutzerinstallation brauchen getrennte Abnahme.

## Nativer Akzeptanztest MG-02

1. App direkt öffnen: Standardbrowser zeigt MemGuard und aktuelle Werte. Kein Dateidialog. Mit PID/Health-Endpunkt belegen, welcher Server läuft.
2. Nur synthetische Testmitteilung über den Notify-Pfad ausgeben; dabei keinen Messwert fälschen, der einen echten Monitor zur Prozessbeendigung bringen könnte.
3. Sichtbaren Absender MemGuard und Nachricht prüfen. Bei Fokus-/Mitteilungssperre deren Zustand dokumentieren, nichts als erfolgreich zugestellt behaupten.
4. Mitteilung bzw. „Show/Anzeigen“ anklicken. Übersicht mit RAM, Swap und Prozessliste muss erscheinen. Keine Datei auswählen, keine beliebige lokale Datei öffnen.
5. Browser-Tab schließen, Server weiterlaufen lassen; erneut aktivieren: derselbe Server bleibt bestehen. Danach nur den eigenen Testserver stoppen und Klick mit gestopptem Server prüfen: Server wird neu gestartet, kein zweiter Monitor.
6. Falschen fremden Dienst auf Port 8765 nur in isolierter Testumgebung simulieren. MemGuard darf dessen Webseite nicht öffnen oder ihn beenden.

Sichtbar geklickte Mitteilung und technisch erfolgreicher Appstart sind unterschiedliche Nachweise. Screenshot/Log/Commit und offene Grenzen im REVIEW ergänzen. Die native App nutzt aktuell AppleScript-Mitteilungen; eine spätere Migration zu UserNotifications ist eine eigene Entscheidung mit entsprechendem Zustell-/Aktivierungstest.

## Installation, Freigabe und Rückkehr

Ein Repo-Commit oder Start der Entwicklungs-App aktualisiert die bestehende Binärdatei nicht. Vor Änderungen die konkreten Zielpfade, Version, Dienst und zu erhaltende Konfiguration erfassen. Die bestehende Benutzerinstallation verwendet `~/Library/Application Support/MemGuard/memguard`, `MemGuard.app`, `config.json` und `~/Library/LaunchAgents/tech.farpoint.memguard.plist`.

`install.sh` erstellt vor Änderungen einen update-backup-Ordner, bewahrt vorhandene Konfiguration ohne --config und installiert App plus Monitor. Teilfehler und automatischer Rollback sind noch MG-11; Installation daher nur mit konkreter Freigabe und vorbereitetem Wiederanlauf. Danach installierte Version, genau eine Monitorinstanz, Konfigurationsgleichheit, App-Bundle und Mitteilungsklick neu prüfen. Vorversionen sichern; verlorene Jobarbeit lässt sich nicht rückgängig machen.

## Definition of Done für jeden Folge-PR

Problem und Trigger beschrieben; Änderung auf ein Arbeitspaket begrenzt; passende Tests grün; keine leeren catch-Blöcke oder pauschalen Suppressions; vollständiger Ist/Soll-Nachweis bei Schreibfunktionen; Dokumente/Backlog aktuell; CI auf dem konkreten Commit geprüft. Zusätzlich native Abnahme, wenn LaunchServices, Mitteilungen oder Installation betroffen sind. Nicht geprüfte Pfade ausdrücklich offen halten.

## Offene Punkte

- [ ] P1 · QA/Betreiber: Nativen Test MG-02 am endgültigen Installationspfad durchführen.
- [ ] P1 · Betreiber: Konkretes Upgrade freigeben und Rückprüfung gemäß MG-03 durchführen.
- [ ] P2 · Maintainer: Nächstes Paket aus BACKLOG.md einem Verantwortlichen zuweisen.
