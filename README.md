# CloudKnox - PowerShell Scripts Repository

**Farpoint Technologies - Microsoft Intune & Azure AD Management Scripts**

## 📋 Übersicht

Dieses Repository enthält eine umfassende Sammlung von PowerShell-Scripts für die Verwaltung von Microsoft Intune, Azure AD und verwandten Cloud-Services. Alle Scripts sind professionell entwickelt und für den Einsatz in Unternehmensumgebungen optimiert.

## 🗂️ Repository-Struktur

```
cloudknox/
├── scripts/
│   │
│   ├── [Windows / Intune Scripts]
│   ├── autopilot-group-tag-bulk-setter/       # Massenhafte Group Tag-Zuweisung
│   ├── device-rename-grouptag-enhanced/       # Erweiterte Geräteumbenennung
│   ├── enhanced-laps-diagnostic/              # LAPS-Diagnoseskript
│   ├── entra-id-app-creator/                  # Entra ID App-Registrierung
│   ├── intune-ddg-autocreator-ultimate/       # Dynamic Device Groups
│   ├── oobe-autopilot-registration-minimal/   # OOBE Autopilot (Minimal)
│   ├── oobe-autopilot-registration-full/      # OOBE Autopilot (Vollversion)
│   ├── same-devops-environment/               # DevOps-Umgebungs-Standardisierung
│   │
│   └── [macOS Scripts]
│       └── cis-edge-benchmark-macos/          # CIS Edge Benchmark v4.0.0 (macOS)
│
├── README.md                                  # Diese Datei
└── CHANGELOG.md                               # Änderungsprotokoll
```

## 🚀 Verfügbare Scripts

### 1. Autopilot Group Tag Bulk Setter
**Pfad:** `scripts/autopilot-group-tag-bulk-setter/`

Ermöglicht die massenhafte Zuweisung von Group Tags für Autopilot-Geräte in Microsoft Intune.

**Hauptfunktionen:**
- Massenhafte Group Tag-Zuweisung
- CSV-Import für Gerätelisten
- Validierung und Fehlerbehandlung
- Detaillierte Protokollierung

### 2. Device Rename GroupTAG Enhanced v2.0
**Pfad:** `scripts/device-rename-grouptag-enhanced/`

Erweiterte Lösung für die dynamische Umbenennung von AAD-joined Intune-Geräten.

**Hauptfunktionen:**
- Multiple Authentifizierungsoptionen
- Erweiterte Benutzeroberfläche
- Teams-Integration
- Umfassendes Logging

### 3. Enhanced LAPS Diagnostic
**Pfad:** `scripts/enhanced-laps-diagnostic/`

Umfassende Diagnoselösung für Local Administrator Password Solution (LAPS).

**Hauptfunktionen:**
- Vollständige LAPS-Diagnose
- HTML-Berichterstattung
- Automatisierte Reparatur
- Monitoring und Alerting

### 4. Entra ID App Creator
**Pfad:** `scripts/entra-id-app-creator/`

Automatisierte Lösung für die Erstellung von App-Registrierungen und Enterprise Apps in Microsoft Entra ID.

**Hauptfunktionen:**
- Vollautomatische App-Erstellung
- API-Berechtigungen-Konfiguration
- Client Secret-Generierung
- Service Principal-Erstellung

### 5. Intune DDG AutoCreator Ultimate
**Pfad:** `scripts/intune-ddg-autocreator-ultimate/`

Ultimative Lösung für die automatische Erstellung von Dynamic Device Groups.

**Hauptfunktionen:**
- Automatische Gruppenerstellung
- Modulare Architektur
- Teams-Integration
- JSON-Konfiguration

### 6. OOBE Autopilot Registration - Minimal Version
**Pfad:** `scripts/oobe-autopilot-registration-minimal/`

Schlanke Lösung für die Autopilot-Registrierung während OOBE.

**Hauptfunktionen:**
- Minimaler Overhead
- OOBE-Integration
- Automatische Hardware-ID-Erfassung
- Grundlegendes Logging

### 7. OOBE Autopilot Registration - Vollversion
**Pfad:** `scripts/oobe-autopilot-registration-full/`

Vollständige Autopilot-Registrierungslösung mit erweiterten Funktionen.

**Hauptfunktionen:**
- Grafische Benutzeroberfläche
- Batch-Verarbeitung
- Detaillierte Protokollierung
- E-Mail- und Teams-Benachrichtigungen

### 8. Same DevOps Environment
**Pfad:** `scripts/same-devops-environment/`

Standardisierung und Synchronisation von DevOps-Umgebungen.

**Hauptfunktionen:**
- Multi-Environment Support
- Infrastructure as Code
- Tool-Integration
- Compliance-Überwachung

---

## 🍎 macOS Scripts

> Scripts und Module für den Einsatz auf macOS mit **PowerShell Core 7+**.
> Diese Scripts verwenden macOS-native APIs statt Windows-spezifischer Mechanismen (Registry, WMI etc.).

### 9. CIS Microsoft Edge Benchmark v4.0.0 (macOS)
**Pfad:** `scripts/cis-edge-benchmark-macos/`
**Dokumentation:** [`scripts/cis-edge-benchmark-macos/README.md`](scripts/cis-edge-benchmark-macos/README.md)

Vollständiger macOS-Port des CIS Microsoft Edge Benchmark v4.0.0 Audit- und Enforcement-Tools.
Prüft und konfiguriert 128 Edge-Security-Policies über das macOS `defaults`-System (Plist-Dateien) anstatt der Windows-Registry.

**Voraussetzungen:**
- macOS 12 Monterey oder neuer
- PowerShell Core 7.0+ (`brew install --cask powershell`)
- Audit: normaler User · Enforcement: `sudo`

**Hauptfunktionen:**
- 128 CIS-Checks (90 Level 1 + 38 Level 2)
- Liest MDM-verwaltete Policies (Jamf / Intune) sowie System-Preferences
- Interaktives HTML-Dashboard mit Charts, Filterung, CSV-Export
- Enforcement per `defaults write` mit Bestätigungs-Prompt und Dry-Run-Modus
- Farbige Konsolenausgabe (PASS / FAIL / NOT CONFIGURED / REVIEW)
- JSON-Ergebnisexport und Enforcement-Log

**Schnellstart:**
```bash
# Audit (kein sudo nötig)
cd scripts/cis-edge-benchmark-macos
pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeAudit"

# Enforcement (sudo erforderlich)
sudo pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeEnforce -OnlyFailed"

# Nur Vorschau ohne Änderungen
pwsh -Command "Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeEnforce -DryRun"
```

---

## 🔧 Allgemeine Voraussetzungen

### PowerShell
- PowerShell 5.1 oder höher
- Ausführungsrichtlinie: `RemoteSigned` oder `Unrestricted`

### Microsoft Graph PowerShell SDK
```powershell
Install-Module Microsoft.Graph -Scope CurrentUser
```

### Azure AD-Berechtigungen
Je nach Script werden verschiedene Berechtigungen benötigt:
- `Device.Read.All` / `Device.ReadWrite.All`
- `DeviceManagementManagedDevices.Read.All` / `DeviceManagementManagedDevices.ReadWrite.All`
- `Group.Read.All` / `Group.ReadWrite.All`
- `User.Read.All`

## 📖 Verwendung

### 1. Repository klonen
```bash
git clone https://github.com/farpoint-tech/cloudknox.git
cd cloudknox
```

### 2. Script-spezifische README lesen
Jedes Script hat eine eigene README.md-Datei mit detaillierten Anweisungen:
```powershell
# Beispiel: Device Rename Script
Get-Content "scripts\device-rename-grouptag-enhanced\README.md"
```

### 3. Script ausführen
```powershell
# Beispiel: Autopilot Group Tag Bulk Setter
cd scripts\autopilot-group-tag-bulk-setter
.\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1
```

## 🔐 Sicherheitshinweise

### Berechtigungen
- Alle Scripts erfordern entsprechende Azure AD-Berechtigungen
- Einige Scripts benötigen lokale Administratorrechte
- Verwenden Sie das Prinzip der minimalen Berechtigung

### Credential-Management
- Verwenden Sie sichere Authentifizierungsmethoden
- Speichern Sie keine Passwörter in Scripts
- Nutzen Sie Azure Key Vault für sensible Daten

### Audit und Compliance
- Alle Scripts bieten umfassendes Logging
- Überprüfen Sie regelmäßig die Ausführungsprotokolle
- Implementieren Sie Change Management-Prozesse

## 🔔 Support und Benachrichtigungen

### Teams-Integration
Viele Scripts unterstützen Microsoft Teams-Benachrichtigungen:
```powershell
# Beispiel mit Teams Webhook
.\script.ps1 -TeamsWebhook "https://outlook.office.com/webhook/your-webhook-url"
```

### E-Mail-Benachrichtigungen
Erweiterte Scripts bieten E-Mail-Support:
```powershell
# Beispiel mit E-Mail-Benachrichtigung
.\script.ps1 -EmailNotification -SMTPServer "smtp.company.com"
```

## 📊 Monitoring und Reporting

### Logging
- Alle Scripts erstellen detaillierte Log-Dateien
- Standard-Log-Pfad: `C:\ProgramData\ScriptName\logs\`
- Konfigurierbare Log-Level: Debug, Info, Warning, Error

### Berichte
- HTML-Berichte für Executive Summary
- CSV-Export für Datenanalyse
- JSON-Format für API-Integration

## 🛠️ Entwicklung und Beiträge

### Coding Standards
- PowerShell Best Practices befolgen
- Umfassende Fehlerbehandlung implementieren
- Detaillierte Kommentierung
- Modulare Architektur verwenden

### Testing
- Lokale Tests vor Deployment
- Staging-Umgebung für Validierung
- Rollback-Strategien implementieren

### Versionierung
- Semantic Versioning (SemVer)
- Detaillierte Changelog-Einträge
- Git-Tags für Releases

## 📝 Changelog

Alle Änderungen werden in der [CHANGELOG.md](CHANGELOG.md) dokumentiert.

## 👥 Autoren und Mitwirkende

### Hauptautor
**Philipp Schmidt** - Farpoint Technologies
- E-Mail: ps@farpoint.tech
- LinkedIn: [Philipp Schmidt](https://linkedin.com/in/philipp-schmidt-farpoint)

### Mitwirkende
- **AliAlame** - CYBERSYSTEM (Original Device Rename Konzept)
- Farpoint Technologies Team

## 📄 Lizenz

Dieses Repository und alle enthaltenen Scripts sind Eigentum von Farpoint Technologies.

### Nutzungsbedingungen
- Nur für autorisierte Benutzer
- Kommerzielle Nutzung nur mit Genehmigung
- Keine Weiterverteilung ohne Zustimmung
- Support nur für lizenzierte Benutzer

## 🆘 Support

### Technischer Support
1. **Dokumentation prüfen**: README-Dateien der jeweiligen Scripts
2. **Debug-Modus aktivieren**: `-Debug -Verbose` Parameter verwenden
3. **Log-Dateien analysieren**: Detaillierte Fehlermeldungen überprüfen
4. **Support kontaktieren**: Mit vollständigen Informationen

### Support-Kanäle
- **E-Mail**: support@farpoint.tech
- **Teams**: Farpoint Technologies Support Channel
- **Ticketing**: https://support.farpoint.tech

### Notfall-Support
Für kritische Probleme in Produktionsumgebungen:
- **Hotline**: +49 (0) 000000000
- **24/7 Support**: Nur für Premium-Kunden

## 🔗 Weiterführende Links

### Dokumentation
- [Microsoft Graph PowerShell SDK](https://docs.microsoft.com/en-us/powershell/microsoftgraph/)
- [Microsoft Intune Documentation](https://docs.microsoft.com/en-us/mem/intune/)
- [Azure AD PowerShell](https://docs.microsoft.com/en-us/powershell/azure/active-directory/)

### Farpoint Technologies
- **Website**: https://farpoint.tech
- **Blog**: https://blog.farpoint.tech
- **GitHub**: https://github.com/farpoint-tech

---

**© 2024 Farpoint Technologies. Alle Rechte vorbehalten.**

