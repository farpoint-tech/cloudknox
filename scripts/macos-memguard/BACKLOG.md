# MemGuard – Arbeitsvorrat und Abnahme

Stand: 25. Oktober 2026. „Implementiert“ ist keine Produktionsfreigabe. Zu jedem Paket gehören Code, sinnvoller ausführbarer Nachweis, aktualisierte Dokumentation und die ausdrücklich benannten Grenzen. Einstieg: [DEVELOPMENT.md](DEVELOPMENT.md), Architektur: [CONCEPT.md](CONCEPT.md).

| ID / Priorität | Status / Verantwortlich | Aufgabe und Abnahmekriterien |
|---|---|---|
| MG-01 / P1 | Implementiert / Entwicklung | Eigener App-Absender und Dashboard-Starter. App-Direktstart und Aktivierung verwenden denselben Pfad; laufender Server wird wiederverwendet; nicht laufender Server wird vor Browseröffnung bereit; belegter fremder Port führt zu Fehler. Native Quelle, Build und Startertests vorhanden. |
| MG-02 / P1 | Native Abnahme offen / QA + Betreiber | Auf dem Zielgerät einmal die synthetische Funktionstestmeldung sehen und anklicken: Statistik erscheint, kein Dateiöffnen-Dialog. Wiederholen mit gestopptem Dashboardserver, laufendem Server, deutscher/englischer macOS-UI und aktivem Fokus. Bei unterdrückter Mitteilung muss deren Einstellung als Ursache erkennbar sein. Keine echte Speicherüberlastung erzeugen. |
| MG-03 / P1 | Freigabe/Live-Nachweis offen / Betreiber | Konkrete Benutzerinstallation 1.0.0 → 1.2.0 aktualisieren. Vorher Binärdatei, App, Agent und Konfiguration sichern. Danach Version, genau eine Monitorinstanz, unveränderte Konfiguration und funktionierenden Mitteilungsklick prüfen. Rückkehr zur Sicherung auf Testgerät durchführen. Keine Rechte-/Zielmusteränderung nebenbei. |
| MG-04 / P1 | Offen / Entwicklung | Vollständige Treffer-Vorschau für Zielmuster vor Freigabe: alle eigenen Prozesse, konkrete PIDs/Namen und geschützte Ausschlüsse darstellen. Top-100-Anzeige reicht dafür nicht. Kein Signal während der Vorschau; Tests für breite Muster, keine Treffer, Vorfahren und verschwundene PIDs. |
| MG-05 / P1 | Offen / Entwicklung | Monitorversion und tatsächlich geladene Konfigurationsrevision als separaten Heartbeat veröffentlichen. UI muss „gespeichert“, „geladen“ und „wirksam geprüft“ unterscheiden. Staler Heartbeat darf nicht als aktiver Schutz erscheinen. |
| MG-06 / P2 | Offen / Entwicklung | History nach Zeitintervall statt Anzahl HTTP-Abfragen führen: mehrere Browser-Tabs dürfen Samplingrate nicht vervielfachen. Abfrage darf gecachte Messwerte zurückgeben. Messfehler ergeben Lücken; Zeit und Datenmenge bleiben begrenzt. |
| MG-07 / P2 | Offen / Entwicklung | Notification-Nutzlasten bei fehlgeschlagenem Appstart begrenzt halten und Alterung/Selbstbereinigung entwickeln. Nur eigene Nutzlasten entfernen, keine Benutzerdateien. Dateinamenkollisionen und Abbruchfälle testen. |
| MG-08 / P2 | Offen / Release | Node-Runtime bündeln oder verständlichen vorgezogenen Abhängigkeitstest im Installer bereitstellen. Auf sauberem Zweit-Mac mit Apple Silicon und zusätzlich gewünschter Intel-/macOS-Matrix prüfen. Keine bestätigte Plattformunterstützung ohne Laufnachweis. |
| MG-09 / P2 | Offen / Release | Developer-ID-Signierung, Notarisierung und konsistentes App-Icon aus freigegebenen Markenassets. Ad-hoc-Signatur nicht als notarisiert ausgeben. Gatekeeper-Öffnung auf sauberem Gerät prüfen. |
| MG-10 / P2 | Offen / QA | Barrierefreiheit vollständig prüfen: Tastatur, VoiceOver, Fokus in Dialogen, Zoom, alle Textkontraste und mobile Ansicht. Bisherige Tokenkontraste sind keine vollständige WCAG-Abnahme. |
| MG-11 / P2 | Offen / Entwicklung | Installer als getestete Transaktion mit automatischer Rückkehr bei Teilfehlern entwickeln. Vorprüfung vor Dienststopp; laufenden Schutz bei fehlender App/Node nicht unbemerkt abschalten. Vorhandene Sicherungen sind noch kein getesteter Rollback. |

## Bearbeitungsregeln

Ein Paket pro klar beschriebenem PR. Zuerst die passende Datei und bestehenden Tests lesen. Auf die vorliegenden Sicherheitsinvarianten beziehen, keine Prüfungen abschwächen oder Testfehler wegfiltern. Fehlversuche mit Ursache und Prüfausgabe dokumentieren. Neue Funktionen nicht mit Live-Rollout vermischen. Bei neuem Messstand frühere Aussagen in den ausgelieferten Dokumenten korrigieren.

## Offene Punkte

- [ ] P1 · Maintainer: Verantwortliche Personen für MG-02 bis MG-05 benennen und Abnahmen terminieren.
- [ ] P1 · QA: MG-02 und MG-03 als erste Release-Gates abarbeiten.
- [ ] P2 · Maintainer: Nächsten Entwicklungs-PR anhand der Prioritäten auswählen; offene IDs bis zur belegten Abnahme offen lassen.
