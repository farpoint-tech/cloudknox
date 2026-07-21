# Troubleshooting – CIS Edge Benchmark (macOS)

Lösungen für die häufigsten Probleme, gegliedert nach Symptom. Jeder Eintrag
nennt Ursache, Diagnose und Lösung.

> Kurzreferenz siehe [`README.md`](README.md#troubleshooting).

---

## 1. `defaults: Domain ... does not exist`

**Ursache:** Edge wurde auf diesem Gerät noch nie gestartet und hat noch keine
eigene Plist geschrieben.

**Diagnose:**
```bash
ls -l /Library/Preferences/com.microsoft.Edge.plist
defaults read com.microsoft.Edge 2>&1 | head
```

**Lösung:** Edge einmal starten und wieder schließen, dann Audit erneut
ausführen. Alle Checks als `NOT CONFIGURED` sind bis dahin korrekt.

---

## 2. `Operation not permitted` beim Enforcement

**Ursache:** Enforcement schreibt nach `/Library/Preferences` und benötigt
root-Rechte.

**Diagnose:** Läuft der Prozess als root?
```bash
id -u   # muss 0 sein
```

**Lösung:** Mit `sudo` starten:
```bash
sudo pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeEnforce"
```
Ohne root nur Vorschau: `Invoke-CISEdgeEnforce -DryRun`.

---

## 3. MDM-verwaltete Policies lassen sich nicht ändern

**Ursache:** Werte unter `/Library/Managed Preferences/com.microsoft.Edge.plist`
werden vom MDM (Jamf/Intune) gesetzt und haben Vorrang. `defaults write` auf die
System-Preferences bleibt wirkungslos, weil die Managed Preferences gewinnen.

**Diagnose:**
```bash
ls -l /Library/Managed\ Preferences/com.microsoft.Edge.plist
```
Existiert die Datei und enthält den Schlüssel, ist die Policy MDM-verwaltet.

**Lösung:** Die betroffene Policy direkt in der MDM-Lösung konfigurieren
(siehe [`DEPLOYMENT.md`](DEPLOYMENT.md#6-mdm-integration)). Das Modul dient hier
nur der Auditierung der tatsächlich wirksamen Werte.

---

## 4. Dashboard öffnet sich nicht

**Ursache:** Kein Standard-Handler für `open`, oder Datei nicht am erwarteten
Pfad.

**Lösung:** Manuell öffnen:
```bash
open scripts/cis-edge-benchmark-macos/dashboard.html
```
Oder Dashboard ohne neuen Audit erneut anzeigen:
```powershell
Import-Module ./CISEdgeBenchmark.psd1; Show-CISEdgeDashboard
```

---

## 5. HTTP-Server-Port 18989 bereits belegt

**Ursache:** Ein vorheriger Audit-/Server-Prozess läuft noch.

**Diagnose:**
```bash
lsof -i:18989
```

**Lösung:** Alten Prozess beenden:
```bash
lsof -ti:18989 | xargs kill -9
```
Danach Audit neu starten.

---

## 6. Enforce-Button liefert `403 Forbidden`

**Ursache:** Das geöffnete Dashboard trägt ein veraltetes CSRF-Token (z. B. aus
einer früheren Session). Der Server akzeptiert nur das Token des aktuellen
Audit-Laufs.

**Lösung:** Das Dashboard, das der **aktuelle** `Invoke-CISEdgeAudit`-Lauf
öffnet, verwenden – oder die geöffnete Seite neu laden. Der Audit schreibt das
gültige Token in `audit_results.js`; ein Reload lädt es nach.

**Kein Fehler:** Ein 403 für eine fremde Website ist beabsichtigt – so kann eine
zufällig geöffnete Seite kein Enforcement auslösen.

---

## 7. Enforce-Button reagiert gar nicht / „Server nicht erreichbar"

**Ursache:** Der Enforcement-Server läuft nicht (Audit-Prozess beendet) oder
der Port ist blockiert.

**Diagnose:**
```bash
curl -s http://localhost:18989/ping
```
Erwartet: `{"status":"ok"}`.

**Lösung:** `Invoke-CISEdgeAudit` erneut starten und geöffnet lassen, solange
Enforcement-Buttons benutzt werden.

---

## 8. PowerShell-Version zu alt / Modul lädt nicht

**Ursache:** Das Manifest verlangt PowerShell 7.0+. macOS-eigene Shells sind
`bash`/`zsh`, nicht PowerShell.

**Diagnose:**
```bash
pwsh --version   # muss 7.0 oder höher sein
```

**Lösung:**
```bash
brew install --cask powershell
```
Oder Release von <https://github.com/PowerShell/PowerShell/releases> installieren.

---

## 9. Werte nach Enforcement/Restore nicht wirksam

**Ursache:** macOS cached Preferences in `cfprefsd`; Edge liest ggf. den alten
Wert bis zum Neustart.

**Lösung:**
```bash
sudo killall cfprefsd
# danach Edge vollständig beenden und neu starten
```
`Invoke-CISEdgeRestore` führt `killall cfprefsd` bereits selbst aus.

---

## 10. Restore findet keine Backups

**Ursache:** Es wurde noch kein Enforcement ausgeführt, oder Enforcement lief mit
`-NoBackup`.

**Diagnose:**
```powershell
Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeRestore -List
```

**Lösung:** Backups entstehen automatisch bei jedem regulären Enforcement.
Ohne Backup ist ein Restore über dieses Modul nicht möglich – dann Policies
manuell zurücksetzen (`sudo defaults delete com.microsoft.Edge <Key>`).

---

## 11. Audit bricht mitten im Lauf ab

**Ursache:** In früheren Versionen konnte ein nicht-numerischer Plist-Wert einen
`[int]`-Cast zum Absturz bringen. Aktuell wird dies durch `Test-CISNumericEqual`
(TryParse mit String-Fallback) abgefangen.

**Diagnose:** Prüfe `enforcement_log.txt` und die Konsolenausgabe auf die
betroffene Check-ID.

**Lösung:** Sicherstellen, dass die aktuelle Modulversion im Einsatz ist. Tritt
das Problem weiter auf, den konkreten Plist-Wert prüfen:
```bash
defaults read com.microsoft.Edge <Key>
```

---

## Logs & Diagnosedateien

| Datei | Inhalt |
|---|---|
| `enforcement_log.txt` | Enforcement-/Restore-Protokoll, abgelehnte Requests |
| `audit_results.json` | Letztes Audit-Ergebnis (maschinenlesbar) |
| `audit_results.js` | Dashboard-Daten inkl. CSRF-Token (chmod 600) |
| `backups/` | Zeitgestempelte Plist-Backups vor Enforcement |

Bei hartnäckigen Problemen: Konsolenausgabe **und** `enforcement_log.txt`
zusammen betrachten – die Log-Zeilen tragen Zeitstempel und Check-IDs.
