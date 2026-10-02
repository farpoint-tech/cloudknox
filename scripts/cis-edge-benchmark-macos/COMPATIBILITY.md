# Kompatibilität – CIS Edge Benchmark (macOS)

Dieses Dokument beschreibt die unterstützten und getesteten Umgebungen sowie
bekannte Einschränkungen. Es dient als Referenz für Rollout-Entscheidungen und
als Vorlage für die Testmatrix.

> **Status-Legende:**
> ✅ getestet · 🟡 erwartet kompatibel (nicht formell getestet) · ❌ nicht unterstützt

---

## 1. macOS-Versionen

Das Modul verwendet ausschließlich stabile, langlebige System-CLIs
(`/usr/bin/defaults`, `/usr/bin/id`, `/usr/sbin/scutil`, `/usr/bin/open`,
`/bin/chmod`, `/usr/bin/killall`), die auf allen aktuellen macOS-Versionen
vorhanden sind. Es gibt keine versionsspezifischen API-Aufrufe.

| macOS | Version | Status | Anmerkung |
|---|---|---|---|
| Monterey | 12 | 🟡 | Minimal unterstützte Version (PowerShell 7 verfügbar) |
| Ventura | 13 | 🟡 | Erwartet voll kompatibel |
| Sonoma | 14 | 🟡 | Erwartet voll kompatibel |
| Sequoia | 15 | 🟡 | Erwartet voll kompatibel |
| ältere (≤ 11) | 10.x–11 | ❌ | PowerShell 7 / `defaults`-Verhalten nicht garantiert |

> Die formelle Verifikation je Version ist im Projekt-Backlog als eigener Task
> hinterlegt. Der macOS-CI-Job (`macos-latest`) testet den Modul-Import und
> einen Dry-Run bei jeder Änderung automatisch.

### Verifikations-Checkliste je macOS-Version

- [ ] `Import-Module` ohne Fehler
- [ ] `Invoke-CISEdgeAudit -Level L1` läuft vollständig durch
- [ ] `Invoke-CISEdgeEnforce -DryRun` zeigt Plan korrekt an
- [ ] Enforcement + `Invoke-CISEdgeRestore` (in Testumgebung)
- [ ] Dashboard öffnet und rendert Ergebnisse

---

## 2. PowerShell-Versionen

| PowerShell | Status | Anmerkung |
|---|---|---|
| 7.0 – 7.4+ | ✅ | Vom Manifest gefordert (`PowerShellVersion = '7.0'`) |
| 5.1 (Windows) | ❌ | Windows-only; macOS-CLIs nicht vorhanden |

Das Manifest erzwingt die Mindestversion – ältere PowerShell lädt das Modul
nicht.

---

## 3. Microsoft-Edge-Versionen

Die Checks basieren auf **CIS Microsoft Edge Benchmark v4.0.0**. Sie prüfen
Policy-Schlüssel in der Domain `com.microsoft.Edge`. Diese Schlüsselnamen sind
über Edge-Versionen hinweg stabil; neue Edge-Versionen ergänzen meist Policies,
ohne bestehende zu entfernen.

| Edge | Status | Anmerkung |
|---|---|---|
| v120 – v125 | 🟡 | Policy-Schlüssel des Benchmarks vorhanden |
| v126+ (aktuell) | 🟡 | Erwartet voll kompatibel |
| Beta / Dev | 🟡 | Kann zusätzliche/entfernte Policies enthalten |
| < v100 | ❌ | Nicht abgedeckt vom Benchmark v4.0.0 |

**Wichtig:** Nicht gesetzte Policies erscheinen als `NOT CONFIGURED` – das ist
kein Kompatibilitätsfehler, sondern der korrekte Zustand für einen nicht
konfigurierten Schlüssel.

### Umgang mit Edge-Policy-Änderungen

Wenn Microsoft eine Policy umbenennt oder entfernt:

1. Der Check erscheint dauerhaft als `NOT CONFIGURED` (Schlüssel existiert nicht
   mehr).
2. Prüfe die aktuelle Policy-Referenz:
   <https://learn.microsoft.com/deployedge/microsoft-edge-policies>
3. Passe den Schlüsselnamen bzw. Check in `cis_checks.json` an.

---

## 4. Architektur

| Architektur | Status | Anmerkung |
|---|---|---|
| Apple Silicon (arm64) | 🟡 | PowerShell 7 nativ verfügbar |
| Intel (x86_64) | 🟡 | PowerShell 7 nativ verfügbar |

Das Modul enthält keinen architekturspezifischen Code.

---

## 5. Abhängigkeiten (Laufzeit)

| Binary | Zweck | Teil von macOS |
|---|---|---|
| `/usr/bin/defaults` | Policies lesen/schreiben | ✅ |
| `/usr/bin/id` | root-Prüfung | ✅ |
| `/usr/sbin/scutil` | Computername | ✅ |
| `/usr/bin/open` | Dashboard öffnen | ✅ |
| `/bin/chmod` | Dateirechte (600) | ✅ |
| `/usr/bin/killall` | Prefs-Cache leeren (Restore) | ✅ |

Keine externen PowerShell-Module oder Homebrew-Pakete zur Laufzeit nötig
(außer PowerShell selbst). Pester/PSScriptAnalyzer werden nur für die
Test-/CI-Umgebung benötigt.
