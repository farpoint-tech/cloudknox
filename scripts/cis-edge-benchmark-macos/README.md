# CIS Microsoft Edge Benchmark v4.0.0 – macOS

**PowerShell Core 7+ Modul zur Auditierung und Härtung von Microsoft Edge auf macOS**

Dieses Modul ist ein macOS-Port des [CIS-Edge-Benchmark](https://github.com/mohammedsiddiqui6872/CIS-Edge-Benchmark) Projekts.
Es ersetzt alle Windows-Registry-Zugriffe durch das macOS `defaults`-System und ist vollständig kompatibel mit PowerShell Core 7+ auf macOS.

---

## Voraussetzungen

| Anforderung | Details |
|---|---|
| **Betriebssystem** | macOS 12 Monterey oder neuer |
| **PowerShell** | PowerShell Core 7.0+ ([Download](https://github.com/PowerShell/PowerShell/releases)) |
| **Microsoft Edge** | Beliebige aktuelle Version |
| **Berechtigungen** | Audit: normaler User · Enforcement: `sudo` |

### PowerShell Core installieren (falls nicht vorhanden)

```bash
# Via Homebrew
brew install --cask powershell

# Oder direkt von GitHub herunterladen
# https://github.com/PowerShell/PowerShell/releases
```

---

## Wie Edge-Policies auf macOS funktionieren

Edge liest Policies auf macOS aus zwei Quellen (in dieser Priorität):

| Priorität | Pfad | Beschreibung |
|---|---|---|
| 1 | `/Library/Managed Preferences/com.microsoft.Edge.plist` | MDM-verwaltete Policies (z.B. Jamf, Intune) – **read-only** |
| 2 | `/Library/Preferences/com.microsoft.Edge.plist` | System-Preferences – schreibbar mit `sudo` |

Dieses Skript **liest** aus beiden Quellen und **schreibt** beim Enforcement in die System-Preferences (`/Library/Preferences/`).

> **Hinweis:** MDM-verwaltete Policies (Pfad 1) haben immer Vorrang und können nicht durch dieses Script überschrieben werden. In MDM-verwalteten Umgebungen sollte die Konfiguration über Jamf / Intune erfolgen.

---

## Installation

```bash
# 1. Repository klonen (falls noch nicht geschehen)
git clone https://github.com/farpoint-tech/cloudknox.git
cd cloudknox/scripts/cis-edge-benchmark-macos

# 2. Modul in PowerShell importieren
pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1"
```

---

## Verwendung

### Audit ausführen (kein sudo nötig)

```powershell
# PowerShell starten
pwsh

# Modul laden
Import-Module ./CISEdgeBenchmark.psd1

# Alle 128 Checks ausführen (L1 + L2), Dashboard öffnen
Invoke-CISEdgeAudit

# Nur Level-1-Checks (90 Checks, empfohlen)
Invoke-CISEdgeAudit -Level L1

# Nur Level-2-Checks (38 Checks, restriktiver)
Invoke-CISEdgeAudit -Level L2
```

Der Audit:
1. Prüft alle Policies über das `defaults`-System
2. Gibt eine farbige Konsolenausgabe aus
3. Schreibt `audit_results.json` und `audit_results.js`
4. Öffnet das interaktive HTML-Dashboard im Browser
5. Startet einen lokalen HTTP-Server (Port 18989) für Dashboard-Enforcement-Buttons

**Drücke `Ctrl+C` um den Server zu beenden.**

---

### Enforcement ausführen (sudo erforderlich)

```bash
# Einfacher Aufruf – alle L1-Checks erzwingen
sudo pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeEnforce"

# Nur fehlgeschlagene Checks aus dem letzten Audit
sudo pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeEnforce -OnlyFailed"

# Alle Checks (L1 + L2)
sudo pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeEnforce -Level All"

# Bestimmte Check-IDs erzwingen
sudo pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeEnforce -CheckIds '1.31.1','1.31.2','1.31.3'"

# Vorschau ohne Änderungen (kein sudo nötig)
Invoke-CISEdgeEnforce -DryRun

# Ohne Bestätigungs-Prompt (für Skripting / Automation)
sudo pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeEnforce -AutoConfirm"
```

---

### Dashboard manuell öffnen

```powershell
# Audit-Ergebnisse als Dashboard öffnen (ohne erneuten Audit)
Import-Module ./CISEdgeBenchmark.psd1
Show-CISEdgeDashboard
```

---

## Verfügbare Cmdlets

| Cmdlet | Beschreibung |
|---|---|
| `Invoke-CISEdgeAudit` | Audit + Dashboard öffnen + Enforcement-Server starten |
| `Invoke-CISEdgeEnforce` | Policies schreiben (erfordert sudo/root) |
| `Show-CISEdgeDashboard` | Bestehendes Dashboard öffnen |

### Parameter-Übersicht

#### `Invoke-CISEdgeAudit`
| Parameter | Typ | Standard | Beschreibung |
|---|---|---|---|
| `-Level` | `L1` / `L2` / `All` | `All` | CIS-Level-Filter |

#### `Invoke-CISEdgeEnforce`
| Parameter | Typ | Standard | Beschreibung |
|---|---|---|---|
| `-Level` | `L1` / `L2` / `All` | `L1` | CIS-Level-Filter |
| `-CheckIds` | `string[]` | – | Spezifische Check-IDs |
| `-OnlyFailed` | Switch | – | Nur fehlgeschlagene Checks |
| `-DryRun` | Switch | – | Vorschau, keine Änderungen |
| `-AutoConfirm` | Switch | – | Kein Bestätigungs-Prompt |

---

## Dateistruktur

```
cis-edge-benchmark-macos/
├── CISEdgeBenchmark.psm1   # PowerShell-Modul (macOS-Version)
├── CISEdgeBenchmark.psd1   # Modul-Manifest
├── cis_checks.json         # 128 CIS-Check-Definitionen
├── dashboard.html          # Interaktives HTML-Dashboard
├── audit_results.json      # Audit-Ergebnisse (wird generiert)
├── audit_results.js        # Dashboard-Datendatei (wird generiert)
└── enforcement_log.txt     # Enforcement-Protokoll (wird generiert)
```

---

## Ausgabe-Statuses

| Status | Bedeutung |
|---|---|
| `PASS` | Policy entspricht der CIS-Empfehlung |
| `FAIL` | Policy weicht von der Empfehlung ab |
| `NOT CONFIGURED` | Policy ist nicht gesetzt (kein Wert in plist) |
| `REVIEW` | Kein empfohlener Wert definiert – manuelle Prüfung |

---

## Unterschiede zur Windows-Version

| Aspekt | Windows (Original) | macOS (Dieses Modul) |
|---|---|---|
| Policy-Speicherort | Windows Registry (`HKLM:\SOFTWARE\Policies\Microsoft\Edge`) | macOS Plist (`/Library/Preferences/com.microsoft.Edge`) |
| Lesen | `Get-ItemProperty` | `defaults read` |
| Schreiben | `Set-ItemProperty` | `defaults write` |
| Admin-Check | Windows Principal API | `id -u` == 0 |
| Browser öffnen | `Start-Process file.html` | `open file.html` |
| Hostname | `$env:COMPUTERNAME` | `scutil --get ComputerName` |
| PowerShell-Version | 5.1+ | 7.0+ (Core) |
| Enforcement starten | Als Admin ausführen | `sudo pwsh` |

---

## Troubleshooting

### `defaults: Domain ... does not exist`
Edge wurde noch nie gestartet oder hat noch keine eigene Plist-Datei. Starte Edge einmal und führe dann den Audit erneut aus. Alle Checks werden als `NOT CONFIGURED` gewertet – das ist korrekt.

### Enforcement schlägt fehl: `Operation not permitted`
Du hast kein sudo. Führe den Enforcement mit `sudo pwsh` aus:
```bash
sudo pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeEnforce"
```

### MDM-verwaltete Policies können nicht geändert werden
Policies unter `/Library/Managed Preferences/` sind durch MDM (Jamf/Intune) gesetzt und können nicht durch `defaults write` überschrieben werden. Konfiguriere sie direkt in deiner MDM-Lösung.

### Dashboard öffnet sich nicht
Öffne die Datei manuell im Browser:
```bash
open scripts/cis-edge-benchmark-macos/dashboard.html
```

### HTTP-Server (Port 18989) bereits belegt
Beende den vorherigen Prozess:
```bash
lsof -ti:18989 | xargs kill -9
```

---

## Quellen

- **CIS Microsoft Edge Benchmark v4.0.0**: [CIS Benchmark](https://www.cisecurity.org/benchmark/microsoft_edge)
- **Original Windows-Script**: [mohammedsiddiqui6872/CIS-Edge-Benchmark](https://github.com/mohammedsiddiqui6872/CIS-Edge-Benchmark)
- **Edge Policy-Dokumentation (macOS)**: [Microsoft Learn – Edge Policies](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies)

---

**© 2025 Farpoint Technologies. Alle Rechte vorbehalten.**
