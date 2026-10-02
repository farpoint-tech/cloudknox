# Deployment-Guide – CIS Edge Benchmark (macOS)

Diese Anleitung richtet sich an IT-Administratoren, die das Modul in einer
Unternehmensumgebung ausrollen und betreiben. Sie beschreibt die sichere
Verteilung, den Audit-Betrieb, das kontrollierte Enforcement, Rollback sowie
die Integration mit MDM-Lösungen (Jamf, Intune).

> Für Endnutzer-Bedienung siehe [`README.md`](README.md).
> Für Fehlerbehebung siehe [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md).
> Für unterstützte Versionen siehe [`COMPATIBILITY.md`](COMPATIBILITY.md).

---

## 1. Überblick über das Betriebsmodell

| Phase | Rechte | Änderungen am System | Empfohlene Frequenz |
|---|---|---|---|
| **Audit** | Normaler User | Keine (nur Lesen) | Regelmäßig / vor jedem Enforcement |
| **Dry-Run** | Normaler User | Keine (Vorschau) | Vor jedem Enforcement |
| **Enforcement** | `sudo` / root | Schreibt `/Library/Preferences/com.microsoft.Edge.plist` | Nur nach Freigabe |
| **Restore** | `sudo` / root | Stellt Plist aus Backup wieder her | Bei Bedarf (Rollback) |

**Grundprinzip:** Audit und Dry-Run sind risikofrei. Erst das Enforcement
verändert das System – und legt vorher automatisch ein Backup an.

---

## 2. Verteilung

### 2.1 Voraussetzungen auf dem Zielgerät

- macOS 12+ (siehe [`COMPATIBILITY.md`](COMPATIBILITY.md))
- PowerShell Core 7+ (`brew install --cask powershell` oder MDM-Paket)
- Microsoft Edge (mind. einmal gestartet, damit die Plist existiert)

### 2.2 Dateien ausrollen

Verteile den **gesamten Ordner** `cis-edge-benchmark-macos/` an einen festen
Pfad, z. B. `/usr/local/share/cis-edge-benchmark-macos/`. Erforderlich sind:

```
CISEdgeBenchmark.psd1     # Manifest
CISEdgeBenchmark.psm1     # Modul
cis_checks.json           # Check-Definitionen
dashboard.html            # Dashboard
```

Nicht ausrollen (werden zur Laufzeit erzeugt, siehe `.gitignore`):
`audit_results.json`, `audit_results.js`, `enforcement_log.txt`, `backups/`.

### 2.3 Integritätsprüfung nach der Verteilung

```bash
pwsh -Command "Import-Module /usr/local/share/cis-edge-benchmark-macos/CISEdgeBenchmark.psd1; Get-Command -Module CISEdgeBenchmark"
```

Erwartete Ausgabe: `Invoke-CISEdgeAudit`, `Invoke-CISEdgeEnforce`,
`Invoke-CISEdgeRestore`, `Show-CISEdgeDashboard`.

---

## 3. Audit-Betrieb

```bash
cd /usr/local/share/cis-edge-benchmark-macos
pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeAudit -Level L1"
```

- Schreibt `audit_results.json` (maschinenlesbar) für Reporting/SIEM.
- Öffnet das Dashboard und startet den lokalen Enforcement-Server (Port 18989).
- Für reine Reporting-Läufe ohne Dashboard/Server kann der Prozess nach dem
  Schreiben der JSON mit `Ctrl+C` beendet werden.

---

## 4. Kontrolliertes Enforcement

### Pre-Enforcement-Checkliste

1. **Audit ausgeführt?** – `audit_results.json` liegt aktuell vor.
2. **Dry-Run geprüft?**
   ```bash
   pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeEnforce -DryRun -Level L1"
   ```
   Prüfe die Liste der geplanten Änderungen.
3. **Backup-Strategie klar?** – Enforcement legt automatisch ein Plist-Backup
   in `backups/` an (Deaktivieren nur mit `-NoBackup`, **nicht empfohlen**).
4. **Wartungsfenster / Kommunikation** – Enforcement wirkt sich auf das
   Browserverhalten der Nutzer aus.

### Ausführung

```bash
# L1 erzwingen (Standard), mit Bestätigungsprompt und Auto-Backup
sudo pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeEnforce -Level L1"

# Für automatisierte Rollouts ohne Prompt
sudo pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeEnforce -Level L1 -AutoConfirm"

# Nur die im letzten Audit fehlgeschlagenen Checks
sudo pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeEnforce -OnlyFailed"
```

Nach dem Enforcement wird automatisch ein stiller Re-Audit durchgeführt und die
Ergebnisdateien aktualisiert.

---

## 5. Rollback / Restore

Jeder Enforcement-Lauf sichert die vorherige Plist unter `backups/` mit
Zeitstempel.

```bash
# Verfügbare Backups auflisten (kein sudo nötig)
pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeRestore -List"

# Neuestes Backup wiederherstellen
sudo pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeRestore -AutoConfirm"

# Bestimmtes Backup wiederherstellen
sudo pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeRestore -BackupFile com.microsoft.Edge.20260721-120000.plist"
```

Der Restore leert zusätzlich den Prefs-Cache (`killall cfprefsd`). Für die
volle Wirkung sollte Edge neu gestartet werden.

---

## 6. MDM-Integration

> **Wichtig – Vorrangregel:** Policies unter
> `/Library/Managed Preferences/com.microsoft.Edge.plist` werden vom MDM gesetzt
> und haben **immer Vorrang** vor `/Library/Preferences/…`. Dieses Modul
> schreibt in die System-Preferences (Pfad 2). In MDM-verwalteten Umgebungen ist
> die MDM-Konfiguration die maßgebliche Quelle – nutze das Modul dort primär zum
> **Auditieren** der tatsächlich wirksamen Konfiguration.

### 6.1 Jamf Pro

**Als Audit-Werkzeug (empfohlen):**

1. Lade das Modul als Package (`.pkg`) nach `/usr/local/share/…` hoch oder
   verteile die Dateien via *Files and Processes*.
2. Lege eine **Policy** mit einem *Script* an, das den Audit ausführt und die
   JSON in ein von Jamf einsammelbares Verzeichnis schreibt:
   ```bash
   #!/bin/bash
   cd /usr/local/share/cis-edge-benchmark-macos
   /usr/local/bin/pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeAudit -Level L1" \
     > /var/log/cis-edge-audit.log 2>&1
   ```
3. Optional: **Extension Attribute**, das die Pass-Rate aus
   `audit_results.json` liest, um Compliance in Smart Groups auszuwerten.

**Zum Setzen von Policies:** Bevorzuge native **Configuration Profiles**
(Application & Custom Settings, Domain `com.microsoft.Edge`) statt `defaults`-
Enforcement – so landen die Werte korrekt in *Managed Preferences*.

### 6.2 Microsoft Intune

**Zum Setzen von Policies (empfohlen):** Nutze den **Microsoft Edge
Settings-Katalog** bzw. ein **Preference File** (`.plist`) für die Domain
`com.microsoft.Edge`. Diese landen in *Managed Preferences* und sind
manipulationssicher.

**Als Audit-Werkzeug:** Verteile das Modul über ein **Shell-Script** (Devices
→ Scripts) analog zum Jamf-Beispiel. Das Script kann Nichtkonformität über den
Exit-Code oder ein Custom-Compliance-Skript signalisieren.

### 6.3 Konfliktbehandlung

| Situation | Verhalten | Empfehlung |
|---|---|---|
| Policy nur via MDM gesetzt | MDM-Wert wirkt, Modul kann nicht überschreiben | MDM als Quelle nutzen |
| Policy nur lokal (Modul) gesetzt | Modul-Wert wirkt | OK für Nicht-MDM-Geräte |
| Policy in beiden gesetzt | MDM gewinnt | Doppelpflege vermeiden |

---

## 7. Reporting / SIEM

`audit_results.json` ist die maschinenlesbare Schnittstelle. Beispiel für den
Export einer Kurzfassung:

```bash
cat audit_results.json | jq '{host: .computer, generated: .generated,
  pass: [.results[] | select(.status=="PASS")] | length,
  fail: [.results[] | select(.status=="FAIL")] | length}'
```

Diese Ausgabe lässt sich per Cron/LaunchAgent regelmäßig erzeugen und an
Splunk/ELK weiterleiten (siehe Backlog-Item „Log-System-Integration").

---

## 8. Sicherheit im Betrieb

- Der Enforcement-Server bindet **nur an localhost** und ist durch ein
  **CSRF-Token** geschützt (Details in [`README.md`](README.md#sicherheit-des-enforcement-servers)).
- `audit_results.js` und Backups sind `chmod 600` (nur Eigentümer).
- Beende den Audit-Prozess (`Ctrl+C`), wenn der Enforcement-Server nicht mehr
  gebraucht wird – danach existiert kein aktiver Endpunkt.
