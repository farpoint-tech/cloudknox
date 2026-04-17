# CloudKnox - PowerShell Scripts Repository

**Farpoint Technologies - Microsoft Intune & Azure AD Management Scripts**

> Letzte Aktualisierung: 2026-04-09 | Version: 2.4.1

---

## Inhaltsverzeichnis

- [Übersicht](#-übersicht)
- [Repository-Struktur](#️-repository-struktur)
- [Scripts im Detail](#-scripts-im-detail)
  - [1. Autopilot Group Tag Bulk Setter](#1-autopilot-group-tag-bulk-setter)
  - [2. Device Rename GroupTAG Enhanced v2.0](#2-device-rename-grouptag-enhanced-v20)
  - [3. Enhanced LAPS Diagnostic](#3-enhanced-laps-diagnostic)
  - [4. Entra ID App Creator](#4-entra-id-app-creator)
  - [5. Intune DDG AutoCreator Ultimate](#5-intune-ddg-autocreator-ultimate)
  - [6. OOBE Autopilot Registration - Minimal](#6-oobe-autopilot-registration---minimal-version)
  - [7. OOBE Autopilot Registration - Vollversion](#7-oobe-autopilot-registration---vollversion)
  - [8. Same DevOps Environment](#8-same-devops-environment)
  - [9. Exchange Mailbox Provisioner](#9-exchange-mailbox-provisioner)
- [Shared Modules](#-shared-modules)
- [Allgemeine Voraussetzungen](#-allgemeine-voraussetzungen)
- [Verwendung](#-verwendung)
- [Sicherheitshinweise](#-sicherheitshinweise)
- [Monitoring und Reporting](#-monitoring-und-reporting)
- [Verbesserungspotenziale](#-verbesserungspotenziale)
- [Entwicklung und Beiträge](#️-entwicklung-und-beiträge)
- [Autoren](#-autoren-und-mitwirkende)
- [Lizenz](#-lizenz)
- [Support](#-support)

---

## Übersicht

Dieses Repository enthält eine umfassende Sammlung von PowerShell-Scripts für die Verwaltung von Microsoft Intune, Azure AD / Entra ID und verwandten Cloud-Services. Alle Scripts sind professionell entwickelt und für den Einsatz in Unternehmensumgebungen optimiert.

**Kernbereiche:**
- Windows Autopilot Provisionierung und Verwaltung
- Microsoft Intune Geräteverwaltung
- Azure Entra ID (Azure AD) App-Management
- LAPS (Local Administrator Password Solution) Diagnose
- DevOps-Umgebungs-Standardisierung

---

## Repository-Struktur

```
cloudknox/
├── scripts/                                        # Alle PowerShell-Scripts
│   ├── autopilot-group-tag-bulk-setter/            # Massenhafte Group Tag-Zuweisung
│   │   ├── AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1
│   │   └── README.md
│   ├── device-rename-grouptag-enhanced/            # Erweiterte Geräteumbenennung
│   │   └── project/
│   │       ├── script/
│   │       │   └── DeviceRename-GroupTAG-Enhanced-v2.ps1
│   │       ├── modules/
│   │       │   └── TeamsIntegrationModule.psm1
│   │       ├── examples/
│   │       └── README.md
│   ├── enhanced-laps-diagnostic/                   # LAPS-Diagnoseskript
│   │   ├── Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1
│   │   └── README.md
│   ├── entra-id-app-creator/                       # Entra ID App-Registrierung
│   │   ├── Create-EntraIDApp.ps1
│   │   └── README.md
│   ├── intune-ddg-autocreator-ultimate/            # Dynamic Device Groups
│   │   └── project/
│   │       ├── script1/
│   │       │   └── Intune-DDG-AutoCreator-Ultimate.ps1
│   │       ├── shared-modules/
│   │       │   ├── AuthenticationModule.psm1
│   │       │   └── TeamsIntegrationModule.psm1
│   │       ├── shared-config/
│   │       │   └── config-ultimate.json
│   │       └── README.md
│   ├── oobe-autopilot-registration-minimal/        # OOBE Autopilot (Minimal)
│   │   ├── OOBE Autopilot Registration - Minimal Version.ps1
│   │   └── README.md
│   ├── oobe-autopilot-registration-full/           # OOBE Autopilot (Vollversion)
│   │   ├── OOBE Autopilot Registration.ps1
│   │   └── README.md
│   ├── same-devops-environment/                    # DevOps-Umgebungs-Standardisierung
│   │   ├── sameDevOpsEnvironment.ps1
│   │   └── README.md
│   └── exchange-mailbox-provisioner/                # Exchange Mailbox & DL-Provisioning
│       ├── Provisioning.ps1
│       ├── config.json
│   └── enterprise-apps-owner-assignment/            # Enterprise App Owner-Verwaltung
│       ├── Export-EnterpriseAppOwnerList.ps1
│       ├── Import-EnterpriseAppOwners.ps1
│       ├── Assign-OwnerByCategory.ps1
│       ├── Assign-EnterpriseAppOwners.ps1
│       └── README.md
├── DevicePolicyRemovalTool/                        # Policy-Entfernungs-Tool
│   ├── DevicePolicyRemovalTool_Enhanced.ps1
│   └── README.md
├── README.md                                       # Diese Datei
├── CHANGELOG.md                                    # Änderungsprotokoll
└── log.md                                          # Aktivitätsprotokoll
```

---

## Scripts im Detail

### 1. Autopilot Group Tag Bulk Setter

**Pfad:** `scripts/autopilot-group-tag-bulk-setter/AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1`
**Version:** 1.0 | **Autor:** Philipp Schmidt - Farpoint Technologies
**Sprache:** Deutsch
**Zeilen:** ~228

#### Was macht dieses Script?

Ermöglicht die massenhafte Zuweisung von Group Tags für Windows Autopilot-Geräte, die noch keinen Tag besitzen. Das Script verbindet sich mit der Microsoft Graph API, lädt alle registrierten Autopilot-Geräte und filtert jene ohne Group Tag heraus. Anschliessend können diese geräte mit einem einzigen Tag versehen werden.

#### Funktionsweise (Schritt für Schritt)

1. Verbindet sich mit Microsoft Graph (`DeviceManagementServiceConfig.ReadWrite.All`)
2. Lädt alle Windows Autopilot-Geräte via Graph API
3. Filtert Geräte ohne bestehenden Group Tag
4. Zeigt Übersicht: Geräte mit/ohne Tag
5. Lässt den Benutzer einen Tag auswählen (vordefiniert oder benutzerdefiniert)
6. Fordert explizite Bestätigung vor Änderungen
7. Setzt den Group Tag via `updateDeviceProperties`-Endpoint (Beta API)
8. Gibt Zusammenfassung aus (Erfolge / Fehler)

#### Parameter

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `-GroupTag` | String | Der zu setzende Group Tag (optional, sonst interaktiv) |
| `-Test` | Switch | Test-Modus: zeigt Änderungen ohne Ausführung |

#### Verwendungsbeispiele

```powershell
# Test-Lauf (keine echten Änderungen)
.\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1 -Test

# Tag setzen (interaktive Auswahl)
.\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1

# Tag direkt via Parameter setzen
.\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1 -GroupTag "userdriven"

# Mit benutzerdefiniertem Log-Pfad und CSV-Export
.\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1 -GroupTag "userdriven" -LogPath "C:\Logs\autopilot.log" -ExportCsv "C:\Logs\ergebnisse.csv"
```

#### Benötigte Berechtigungen

- `DeviceManagementServiceConfig.ReadWrite.All`
- Intune Administrator oder Global Administrator

#### Parameter

| Parameter | Typ | Beschreibung | Standard |
|-----------|-----|-------------|---------|
| `-GroupTag` | String | Der zu setzende Group Tag | Interaktiv |
| `-Test` | Switch | Test-Modus: zeigt Änderungen ohne Ausführung | – |
| `-LogPath` | String | Pfad für das Log-File | `.\Logs\AutopilotGroupTag_<Datum>.log` |
| `-ExportCsv` | String | Pfad für CSV-Export | `.\Logs\AutopilotGroupTag_<Datum>.csv` |

#### Bekannte Einschränkungen

- Keine parallele Verarbeitung (500ms Pause zwischen Aktualisierungen - API-Schutz)
- Nur "fehlende Tags setzen" - kein Update bestehender Tags möglich

---

### 2. Device Rename GroupTAG Enhanced v2.0

**Pfad:** `scripts/device-rename-grouptag-enhanced/project/script/DeviceRename-GroupTAG-Enhanced-v2.ps1`
**Version:** 2.0 | **Autor:** Philipp Schmidt (Original: AliAlame - CYBERSYSTEM)
**Zeilen:** ~707

#### Was macht dieses Script?

Führt eine dynamische Umbenennung von AAD-joined (Azure AD joined) Intune-Geräten durch, basierend auf dem GroupTag und der Seriennummer des Geräts. Das Script liest den aktuellen GroupTag aus Intune aus und generiert daraus zusammen mit der Hardware-Seriennummer einen standardisierten Gerätenamen.

#### Funktionsweise (Schritt für Schritt)

1. Bietet Authentifizierung via 4 Methoden (Interactive, Username/Password, Client Credentials, Device Code)
2. Stellt Verbindung zu Microsoft Graph her
3. Lädt alle verwalteten Intune-Geräte
4. Liest GroupTag und Seriennummer jedes Geräts aus
5. Generiert neuen Gerätenamen aus `[GroupTag]-[SerialNumber]`-Schema
6. Benennt Geräte via Graph API um
7. Sendet optionale Teams-Benachrichtigungen via Webhook
8. Schreibt detailliertes Log nach `C:\ProgramData\IntuneDeviceRenamer\logs\`

#### Authentifizierungsmethoden

| Methode | Beschreibung | Anwendungsfall |
|---------|--------------|----------------|
| Interactive | Browser-basierte Anmeldung | Manuelle Ausführung |
| Username/Password | Direkte Credentials | Automatisierung (ohne MFA) |
| Client Credentials | App-Registrierung + Secret | Service-Konten / CI/CD |
| Device Code | Code-basierte Anmeldung | MFA-kompatibel |

#### Verwendungsbeispiele

```powershell
# Interaktive Ausführung
.\DeviceRename-GroupTAG-Enhanced-v2.ps1

# Mit Client Credentials
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -AuthMethod ClientCredentials `
    -TenantId "your-tenant-id" `
    -ClientId "your-app-id" `
    -ClientSecret "your-secret"
```

#### Teams-Integration

Das Script unterstützt Microsoft Teams-Benachrichtigungen via `TeamsIntegrationModule.psm1` mit:
- Adaptive Cards für Zusammenfassungen
- Fehler-Alerts
- Fortschritts-Updates

---

### 3. Enhanced LAPS Diagnostic

**Pfad:** `scripts/enhanced-laps-diagnostic/Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1`
**Sprache:** Deutsch
**Autor:** Philipp Schmidt - Farpoint Technologies

#### Was macht dieses Script?

Führt eine umfassende Diagnose der Local Administrator Password Solution (LAPS) auf Windows-Geräten durch. Prüft Konfiguration, Passwort-Status, Richtlinien-Einstellungen und analysiert den Windows Event Log auf LAPS-bezogene Ereignisse.

#### Funktionsweise (Schritt für Schritt)

1. Prüft ob LAPS auf dem System installiert und konfiguriert ist
2. Liest aktuelle LAPS-Konfiguration (Registry, CSP-Einstellungen)
3. Überprüft Passwort-Status und letztes Änderungsdatum
4. Validiert Richtlinien-Einstellungen (Policy Compliance)
5. Analysiert Windows Event Logs auf LAPS-Ereignisse
6. Erstellt HTML-Diagnosebericht
7. Optionaler CSV-Export für weitere Analyse
8. Automatische Reparatur bei bekannten Problemen
9. Optionale E-Mail- und Teams-Benachrichtigungen

#### Hauptfunktionen

- Vollständige LAPS-Diagnose (Legacy LAPS & Windows LAPS)
- HTML-Berichterstattung mit visueller Darstellung
- Automatisierte Reparatur-Optionen
- Event Log-Analyse
- E-Mail und Teams-Integration

---

### 4. Entra ID App Creator

**Pfad:** `scripts/entra-id-app-creator/Create-EntraIDApp.ps1`
**Version:** 1.0 | **Autor:** Philipp Schmidt - Farpoint Technologies
**Zeilen:** ~432

#### Was macht dieses Script?

Automatisiert vollständig den Prozess der Erstellung einer App-Registrierung und des zugehörigen Service Principals (Enterprise App) in Microsoft Entra ID. Führt durch einen interaktiven Wizard, konfiguriert API-Berechtigungen und generiert ein Client Secret.

#### Funktionsweise (Schritt für Schritt)

1. Prüft ob Microsoft Graph PowerShell Modul installiert ist (installiert ggf. automatisch)
2. Fragt Tenant-ID / Tenant-Name interaktiv ab
3. Authentifiziert via `Connect-MgGraph` mit `Application.ReadWrite.All` und `Directory.ReadWrite.All`
4. Nimmt App-Details entgegen: Name, Owner, Secret-Gültigkeit
5. Erstellt App-Registrierung via `New-MgApplication`
6. Konfiguriert API-Berechtigungen (11 vordefinierte + benutzerdefinierte)
7. Erstellt Client Secret via `Add-MgApplicationPassword`
8. Erstellt Service Principal (Enterprise App) via `New-MgServicePrincipal`
9. Zeigt alle Ergebnisse (Tenant ID, Client ID, Secret) im Copy&Paste-Format an
10. Exportiert alle Details in eine Textdatei

#### Unterstützte API-Berechtigungen

| Nr. | Berechtigung | Typ | Beschreibung |
|----|-------------|-----|--------------|
| 1 | User.Read | Delegated | Benutzerprofil lesen |
| 2 | User.ReadBasic.All | Delegated | Grundprofile aller Benutzer |
| 3 | User.Read.All | Application | Alle Benutzerprofile lesen |
| 4 | Directory.Read.All | Application | Verzeichnisdaten lesen |
| 5 | Directory.ReadWrite.All | Application | Verzeichnisdaten lesen/schreiben |
| 6 | Group.Read.All | Application | Alle Gruppen lesen |
| 7 | Group.ReadWrite.All | Application | Gruppen lesen/schreiben |
| 8 | Mail.Read | Application | E-Mails lesen |
| 9 | Mail.Send | Application | E-Mails senden |
| 10 | Sites.Read.All | Application | SharePoint-Sites lesen |
| 11 | Sites.ReadWrite.All | Application | SharePoint-Sites lesen/schreiben |
| 12 | Benutzerdefiniert | Beliebig | Eigene API-ID und Berechtigungsname |

#### Parameter

| Parameter | Typ | Beschreibung | Standard |
|-----------|-----|-------------|---------|
| `-TenantId` | String | Tenant-ID oder Tenant-Name | Interaktiv |
| `-AppName` | String | Name der App-Registrierung | Interaktiv |
| `-OwnerName` | String | Name des Owners (in App-Notizen) | `$env:USERNAME` |
| `-SecretValidityYears` | Int (1-2) | Gültigkeit des Secrets in Jahren | `1` |
| `-SaveToFile` | Switch | Exportiert Details inkl. Secret in Datei | Nein |
| `-OutputPath` | String | Ausgabeverzeichnis für Datei-Export | `.` |

#### Verwendungsbeispiel

```powershell
# Vollständig interaktiver Modus
.\Create-EntraIDApp.ps1

# Nicht-interaktiv mit Parametern
.\Create-EntraIDApp.ps1 -TenantId "contoso.onmicrosoft.com" -AppName "MeinTool" -SecretValidityYears 2

# Mit automatischem Datei-Export
.\Create-EntraIDApp.ps1 -TenantId "contoso.onmicrosoft.com" -AppName "MeinTool" -SaveToFile -OutputPath "C:\Secrets"
```

#### Rollback-Verhalten

Bei einem Fehler nach der App-Erstellung (z.B. Secret-Fehler) wird die bereits erstellte App-Registrierung **automatisch wieder gelöscht**, um verwaiste Einträge zu vermeiden.

---

### 5. Intune DDG AutoCreator Ultimate

**Pfad:** `scripts/intune-ddg-autocreator-ultimate/project/script1/Intune-DDG-AutoCreator-Ultimate.ps1`
**Version:** 1.0 (Ultimate Enterprise Edition) | **Autor:** Philipp Schmidt - Farpoint Technologies
**Zeilen:** ~2000+

#### Was macht dieses Script?

Die umfangreichste Lösung im Repository für die automatische Erstellung von Dynamic Device Groups (DDG) in Microsoft Intune/Azure AD. Verarbeitet Gerätelisten aus verschiedenen Quellformaten und erstellt entsprechende dynamische Gruppen mit konfigurierbaren Membership Rules.

#### Funktionsweise (Schritt für Schritt)

1. Lädt Konfiguration aus `config-ultimate.json`
2. Authentifiziert via `AuthenticationModule.psm1` (4 Methoden)
3. Liest Eingabedaten (TXT, CSV, JSON, XML) aus konfigurierten Pfaden
4. Validiert Eingabedaten (Duplikate, Format, Zeichenlimits)
5. Zeigt optionale GridView-Auswahl (ISE-optimiert)
6. Erstellt Dynamic Device Groups via Graph API
7. Konfiguriert Membership Rules (OrderID, GroupTag, ZTDId, Custom)
8. Sendet Teams-Benachrichtigungen via `TeamsIntegrationModule.psm1`
9. Erstellt HTML/CSV/JSON-Berichte
10. Rollback-Mechanismus bei Fehlern
11. Parallele Verarbeitung via Runspaces

#### Unterstützte Eingabeformate

| Format | Beschreibung |
|--------|--------------|
| TXT | Einfache Liste (ein Eintrag pro Zeile) |
| CSV | Strukturierte Daten mit Spalten |
| JSON | Maschinenlesbare Konfiguration |
| XML | Erweiterte Konfiguration |

#### Konfiguration (`config-ultimate.json`)

Das Script wird vollständig über eine JSON-Konfigurationsdatei gesteuert:

```json
{
  "General": { "Prefix": "DDG-", "BatchSize": 10, ... },
  "Authentication": { "TenantId": "", "ClientId": "", ... },
  "Teams": { "WebhookUrl": "", "Notifications": true, ... },
  "Reporting": { "HTML": true, "CSV": true, "JSON": true, ... }
}
```

---

### 6. OOBE Autopilot Registration - Minimal Version

**Pfad:** `scripts/oobe-autopilot-registration-minimal/OOBE Autopilot Registration - Minimal Version.ps1`
**Zeilen:** ~71

#### Was macht dieses Script?

Schlankes Script zur Registrierung von Geräten im Windows Autopilot-Service während des OOBE (Out-of-Box Experience). Erfasst automatisch die Hardware-ID des Geräts und registriert es direkt beim Autopilot-Service.

#### Funktionsweise (Schritt für Schritt)

1. Prüft Administratorrechte (erfordert `#Requires -RunAsAdministrator`)
2. Importiert `Get-WindowsAutopilotInfo` aus dem Community-Script
3. Erfasst Hardware-Hash (PKID + Hash) vom lokalen Gerät
4. Sendet Registrierung direkt an den Autopilot-Service
5. Optional: Setzt Group Tag bei der Registrierung

#### Verwendungsbeispiel

```powershell
# Als Administrator ausführen
.\OOBE Autopilot Registration - Minimal Version.ps1

# Mit Group Tag
.\OOBE Autopilot Registration - Minimal Version.ps1 -GroupTag "userdriven"
```

---

### 7. OOBE Autopilot Registration - Vollversion

**Pfad:** `scripts/oobe-autopilot-registration-full/OOBE Autopilot Registration.ps1`

#### Was macht dieses Script?

Erweiterte Version der OOBE Autopilot-Registrierung mit zusätzlichen Funktionen für Unternehmensumgebungen. Bietet mehr Konfigurationsmöglichkeiten, detailliertes Logging und optionale Benachrichtigungen.

#### Hauptfunktionen (gegenüber Minimal)

- Erweiterte Fehlerbehandlung und Logging
- Batch-Verarbeitung mehrerer Geräte
- Detaillierte Protokollierung
- E-Mail- und Teams-Benachrichtigungen
- Konfigurierbarer Tenant und Netzwerk-Proxy

---

### 8. Same DevOps Environment

**Pfad:** `scripts/same-devops-environment/sameDevOpsEnvironment.ps1`
**Version:** 1.2 | **Autor:** Roy Klooster - RKSolutions
**Zeilen:** ~656 | **Datum:** 2025-06-23

#### Was macht dieses Script?

Automatisiert die vollständige Einrichtung einer einheitlichen PowerShell-Entwicklungsumgebung auf neuen Windows-Geräten. Installiert alle benötigten Anwendungen, PowerShell-Module und VS Code-Extensions und konfiguriert PowerShell-Profile.

#### Funktionsweise (Schritt für Schritt)

1. **Dependency-Check**: Prüft winget-Verfügbarkeit
2. **Upgrade-Check**: Prüft alle konfigurierten Apps auf Updates
3. **App-Installation**: Installiert Git, PowerShell 7 und VS Code via winget
4. **Modul-Analyse**: Vergleicht installierte Module mit PowerShell Gallery
5. **Modul-Installation**: Installiert fehlende Module (Az, Graph, Exchange, PNP etc.)
6. **Modul-Update**: Aktualisiert veraltete Module
7. **VS Code Extensions**: Installiert 10 vordefinierte Extensions
8. **PowerShell Profile**: Erstellt und konfiguriert PS-Profile für Windows PS 5.1, PS 7+ und VS Code
9. **Execution Policy**: Setzt `RemoteSigned` für CurrentUser

#### Installierte Software

**Anwendungen (via winget):**
| App | winget ID |
|-----|-----------|
| Git | `Git.Git` |
| PowerShell 7 | `Microsoft.PowerShell` |
| VS Code | `Microsoft.VisualStudioCode` |

**PowerShell-Module:**
| Modul | Beschreibung |
|-------|-------------|
| Az | Azure PowerShell |
| ExchangeOnlineManagement | Exchange Online |
| M365Permissions | Microsoft 365 Berechtigungen |
| Microsoft.Graph | Microsoft Graph SDK |
| Microsoft.Graph.Entra | Entra ID Erweiterungen |
| Microsoft.Graph.Beta | Graph Beta-Endpunkte |
| PNP.PowerShell | SharePoint / PNP |
| Wintuner | Intune App-Packaging |
| ZeroTrustAssessment | Zero Trust Assessment |

**VS Code Extensions:**
| Extension | Beschreibung |
|-----------|-------------|
| github.copilot | GitHub Copilot |
| ms-vsliveshare.vsliveshare | Live Share |
| ms-vscode.powershell | PowerShell Extension |
| gruntfuggly.todo-tree | TODO Tree |
| mechatroner.rainbow-csv | Rainbow CSV |
| azemoh.one-monokai | Monokai Theme |
| ms-azuretools.vscode-bicep | Bicep Extension |
| microsoft-dciborow.align-bicep | Align Bicep |
| eamodio.gitlens | GitLens |
| shd101wyy.markdown-preview-enhanced | Markdown Preview |

#### PowerShell-Profile Funktionen

Das Script konfiguriert folgende Hilfsfunktionen in allen PS-Profilen:

| Funktion | Beschreibung |
|----------|-------------|
| `Get-PublicIP` | Zeigt die öffentliche IP-Adresse an |
| `Get-UTCTime` | Gibt aktuelle UTC-Zeit zurück |
| `Find-TenantID` | Findet Tenant-ID anhand einer Domain |
| `Get-RandomPassword` | Generiert ein zufälliges Passwort |
| Custom Prompt | Zeigt Uhrzeit im PS-Prompt an |

#### Plattform-Unterstützung

| Plattform | Unterstützt |
|-----------|-------------|
| Windows 10/11 | Vollständig |
| PowerShell 5.1 | Vollständig |
| PowerShell 7.x | Vollständig |
| Parallels VM (Mac) | Vollständig |
| macOS/Linux | Teilweise (PS 7+ Profile) |

---

### 9. Exchange Mailbox Provisioner

**Pfad:** `scripts/exchange-mailbox-provisioner/Provisioning.ps1`
**Version:** 4.0 | **Autor:** Farpoint Technologies
**Sprache:** Deutsch

#### Was macht dieses Script?

Provisioniert Shared Mailboxes und Verteilergruppen (Distribution Groups) in Exchange Online auf Basis einer Excel-Datei. Die Excel-Datei enthält auf **einem Worksheet** zwei **benannte Tabellen** (ListObjects): `SharedMailboxes` und `DistributionGroups`. Das Script erkennt beide Tabellen automatisch anhand ihrer Namen und verarbeitet sie in einem Durchlauf. Konfiguration (Domain, Präfixe, Authentifizierungsmodus) kommt aus einer `config.json`.

#### Funktionsweise (Schritt für Schritt)

1. Prüft und installiert benötigte Module (`ExchangeOnlineManagement`, `ImportExcel`)
2. Lädt `config.json` und Excel-Datei
3. Liest beide benannte Tabellen (`SharedMailboxes`, `DistributionGroups`) aus dem Worksheet
4. Führt eine vollständige Vorab-Validierung durch (Pflichtfelder, E-Mail-Syntax, doppelte Aliase)
5. Zeigt Probleme und fragt bei Fehlern nach Bestätigung
6. Verbindet sich mit Exchange Online (interaktiv oder per App-Registrierung)
7. Erstellt Shared Mailboxes inkl. Weiterleitung, FullAccess- und SendAs-Berechtigungen
8. Erstellt Distribution Groups inkl. Mitglieder und Besitzer
9. Exportiert Ergebnisbericht als CSV und trennt die Verbindung

#### Parameter

| Parameter | Typ | Beschreibung | Standard |
|-----------|-----|--------------|----------|
| `-ConfigFileName` | String | Name der Konfigurationsdatei | `config.json` |
| `-ExcelFileName` | String | Überschreibt den Excel-Dateinamen aus der Config | – |
| `-WhatIf` | Switch | Trockenlauf ohne echte Änderungen | – |

#### Verwendungsbeispiele

```powershell
# Standardlauf mit config.json und interaktivem Login
.\Provisioning.ps1

# Testlauf ohne Änderungen
.\Provisioning.ps1 -WhatIf

# Andere Excel-Datei verwenden
.\Provisioning.ps1 -ExcelFileName "Test.xlsx"
```

#### Benötigte Module

- `ExchangeOnlineManagement`
- `ImportExcel`

#### Benötigte Berechtigungen

- Exchange Administrator oder Global Administrator

#### Funktionsmerkmale

- **Zwei Tabellen auf einem Worksheet** - Shared Mailboxes und Distribution Groups in derselben Excel-Datei
- **Vorab-Validierung** - Pflichtfelder, E-Mail-Adressen, doppelte Aliase werden vor der Ausführung geprüft
- **Umlaut-Normalisierung** - Automatische Ersetzung von ä/ö/ü/ß in Aliasen
- **Idempotente Berechtigungen** - Bereits vorhandene FullAccess-/SendAs-Rechte werden übersprungen
- **Zwei Authentifizierungsmodi** - Interaktiver Web-Login oder App-Registrierung mit Zertifikat
- **Fehlertoleranz** - Einzelne fehlerhafte Zeilen unterbrechen nicht die gesamte Verarbeitung
- **CSV-Ergebnisbericht** - Vollständiger Export aller verarbeiteten Zeilen
### 9. Enterprise Apps Owner Assignment

**Path:** `scripts/enterprise-apps-owner-assignment/`
**Version:** 1.3 (Export) / 1.0 (others) | **Author:** Farpoint Technologies
**Language:** English
**Scripts:** 4 (Export, Import, Interactive, Standalone)

#### What does this script package do?

Comprehensive solution for analyzing and assigning owners to Enterprise Applications (Service Principals) in Azure Entra ID. The workflow is divided into 3 phases, complemented by a standalone script for simple bulk assignments. Cross-platform compatible (Windows / macOS).

#### How it works (3-phase workflow)

1. **Phase 1 – Analysis & Export** (`Export-EnterpriseAppOwnerList.ps1`): Reads all Enterprise Apps, analyzes tags/categories, shows an overview and exports a formatted Excel file for the departments. Auto path detection (`C:\Temp` on Windows, `~/Downloads` on macOS), automatic module installation, file opens automatically after export.
2. **Phase 2 – Import & Assignment** (`Import-EnterpriseAppOwners.ps1`): Reads the Excel file filled in by departments and assigns the entered owners (with dry-run mode).
3. **Phase 3 – Interactive** (`Assign-OwnerByCategory.ps1`): IT assigns owners directly by category or globally.
4. **Standalone** (`Assign-EnterpriseAppOwners.ps1`): Assigns a configured default owner to all apps without an owner.

#### Usage examples

```powershell
# Phase 1: Export (auto path: C:\Temp or ~/Downloads)
.\Export-EnterpriseAppOwnerList.ps1

# Phase 2: Import (dry-run)
.\Import-EnterpriseAppOwners.ps1 -ExcelPath "C:\Temp\EnterpriseApp_OwnerAssignment_20260408.xlsx"

# Phase 2: Import (live)
.\Import-EnterpriseAppOwners.ps1 -ExcelPath "C:\Temp\EnterpriseApp_OwnerAssignment_20260408.xlsx" -Mode Apply

# Phase 3: Interactive category assignment
.\Assign-OwnerByCategory.ps1

# Standalone: Assign default owner
.\Assign-EnterpriseAppOwners.ps1
```

#### Required permissions

| Permission | Phase 1 | Phase 2/3 | Standalone |
|-----------|---------|-----------|------------|
| Application.Read.All | Yes | – | Yes |
| Application.ReadWrite.All | – | Yes | – |
| Directory.Read.All | Yes | – | – |
| Directory.ReadWrite.All | – | Yes | Yes |

#### Required modules

- `Microsoft.Graph` – Microsoft Graph PowerShell SDK
- `ImportExcel` – Excel export/import without Office (Phase 1 & 2 only)

> The Export script installs missing modules automatically on first run.

---

## Shared Modules

### AuthenticationModule.psm1

**Pfad:** `scripts/intune-ddg-autocreator-ultimate/project/shared-modules/AuthenticationModule.psm1`
**Zeilen:** ~940

Zentrales Authentifizierungs-Modul für Microsoft Graph mit 4 Authentifizierungsmethoden, RBAC-Validierung und Profil-Management.

**Exportierte Funktionen:**

| Funktion | Beschreibung |
|----------|-------------|
| `Connect-DDGMicrosoftGraph` | Stellt Graph-Verbindung her |
| `Test-DDGGraphConnection` | Testet bestehende Verbindung |
| `Get-DDGRequiredPermissions` | Listet benötigte Berechtigungen auf |
| `Test-DDGPermissions` | Validiert vorhandene Berechtigungen |
| `Get-DDGRBACRoles` | Gibt RBAC-Rolleninformationen aus |
| `Test-DDGRBACRoles` | Prüft RBAC-Rollen-Compliance |
| `Show-DDGAuthenticationMenu` | Zeigt interaktives Auth-Menü |
| `Connect-DDGWithCredentials` | Username/Password-Authentifizierung |
| `Connect-DDGWithDeviceCode` | Device Code Flow |
| `Connect-DDGInteractive` | Browser-basierte Authentifizierung |
| `Get-DDGAuthenticationStatus` | Gibt Verbindungsstatus aus |
| `Disconnect-DDGMicrosoftGraph` | Trennt Verbindung |
| `Save-DDGAuthenticationProfile` | Speichert Auth-Profil |
| `Load-DDGAuthenticationProfile` | Lädt gespeichertes Profil |
| `Convert-PSObjectToHashtable` | Hilfsfunktion (PS 5.1 kompatibel) |

---

### TeamsIntegrationModule.psm1

**Pfad:** `scripts/intune-ddg-autocreator-ultimate/project/shared-modules/TeamsIntegrationModule.psm1`
(auch in: `scripts/device-rename-grouptag-enhanced/project/modules/`)
**Zeilen:** ~1176

Teams-Integrations-Modul für Microsoft Teams Benachrichtigungen via Webhook.

**Exportierte Funktionen:**

| Funktion | Beschreibung |
|----------|-------------|
| `Send-TeamsNotification` | Einfache Textnachricht senden |
| `Send-TeamsAdaptiveCard` | Adaptive Card senden |
| `Send-TeamsExecutionSummary` | Ausführungs-Zusammenfassung mit Statistiken |
| `Send-TeamsErrorAlert` | Fehler-Alert mit Lösungsvorschlägen |
| `Send-TeamsProgressUpdate` | Fortschritts-Update während der Ausführung |
| `Test-TeamsWebhook` | Webhook-URL validieren |
| `New-TeamsCard` | Adaptive Card Builder |
| `New-TeamsFactSet` | FactSet für Adaptive Cards |
| `New-TeamsActionSet` | ActionSet mit Schaltflächen |
| `Format-TeamsMessage` | Text-Formatierung (Bold, Italic, Code, Links) |
| `Get-TeamsCardTemplate` | Vordefinierte Templates |
| `Send-TeamsRichSummary` | Zusammenfassung mit Charts |

---

## Allgemeine Voraussetzungen

### PowerShell

```powershell
# Mindestversion prüfen
$PSVersionTable.PSVersion

# Empfohlene Version
# PowerShell 5.1 (minimal) oder PowerShell 7.x (empfohlen)
```

### Ausführungsrichtlinie

```powershell
# Für aktuellen Benutzer setzen
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Alternativ für einzelne Ausführung
PowerShell.exe -ExecutionPolicy Bypass -File ".\script.ps1"
```

### Microsoft Graph PowerShell SDK

```powershell
# Basis-Modul installieren
Install-Module Microsoft.Graph -Scope CurrentUser -Force

# Erweiterungen (nach Bedarf)
Install-Module Microsoft.Graph.Authentication -Scope CurrentUser
Install-Module Microsoft.Graph.Applications -Scope CurrentUser
Install-Module Microsoft.Graph.DeviceManagement -Scope CurrentUser
```

### Azure AD-Berechtigungen (Script-übergreifend)

| Berechtigung | Scripts |
|-------------|---------|
| `Device.Read.All` | DDG AutoCreator, Device Rename |
| `Device.ReadWrite.All` | Device Rename |
| `DeviceManagementManagedDevices.Read.All` | DDG AutoCreator, Device Rename |
| `DeviceManagementManagedDevices.ReadWrite.All` | Device Rename |
| `DeviceManagementServiceConfig.ReadWrite.All` | Autopilot Group Tag Setter |
| `Group.Read.All` | DDG AutoCreator |
| `Group.ReadWrite.All` | DDG AutoCreator |
| `Application.ReadWrite.All` | Entra ID App Creator |
| `Directory.ReadWrite.All` | Entra ID App Creator |

---

## Verwendung

### 1. Repository klonen

```bash
git clone https://github.com/farpoint-tech/cloudknox.git
cd cloudknox
```

### 2. Script-spezifische README lesen

```powershell
# Beispiel: Autopilot Group Tag Setter
Get-Content "scripts\autopilot-group-tag-bulk-setter\README.md"
```

### 3. Script ausführen

```powershell
# Autopilot Group Tag Setter (Test)
.\scripts\autopilot-group-tag-bulk-setter\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1 -Test

# Entra ID App Creator
.\scripts\entra-id-app-creator\Create-EntraIDApp.ps1

# DevOps Environment Setup (als Admin)
.\scripts\same-devops-environment\sameDevOpsEnvironment.ps1
```

---

## Sicherheitshinweise

### Credential-Management

- Speichern Sie **keine** Passwörter oder Secrets direkt in Scripts
- Verwenden Sie **Azure Key Vault** für sensible Daten in Produktionsumgebungen
- Generierte Secret-Dateien (z.B. von `Create-EntraIDApp.ps1`) **sicher aufbewahren**
- Client Secrets **regelmässig rotieren** (empfohlen: max. 1 Jahr Laufzeit)

### Prinzip der minimalen Berechtigung

- Nur die für das jeweilige Script benötigten Berechtigungen vergeben
- Service-Konten (App Registrierungen) statt persönlicher Konten für Automatisierungen verwenden
- RBAC-Rollen gezielt und zeitlich begrenzt vergeben

### Ausführung und Audit

- Scripts in einer **Testumgebung** validieren, bevor sie in Produktion genutzt werden
- Alle Scripts bieten umfassendes Logging - Logs **regelmässig prüfen**
- Change Management-Prozesse für Script-Updates implementieren
- Ausführungsprotokolle für Compliance-Anforderungen archivieren

---

## Monitoring und Reporting

### Log-Speicherorte

| Script | Standard-Log-Pfad |
|--------|-------------------|
| Device Rename | `C:\ProgramData\IntuneDeviceRenamer\logs\` |
| LAPS Diagnostic | Lokaler Ausführungspfad |
| DDG AutoCreator | Konfigurierbar via `config-ultimate.json` |
| Alle anderen | Konsolen-Output (kein persistentes Log) |

### Report-Formate

- **HTML-Berichte**: Visuelle Darstellung für Executive Summary (LAPS, DDG AutoCreator)
- **CSV-Export**: Tabellarische Daten für weitergehende Analyse
- **JSON-Format**: Maschinenlesbar für API-Integration und Weiterverarbeitung
- **Teams-Benachrichtigungen**: Echtzeit-Feedback über Ausführungsergebnisse

---

## Verbesserungspotenziale

### Umgesetzt in v2.3.0 ✅

| Script | Verbesserung | Status |
|--------|-------------|--------|
| Autopilot Group Tag Setter | **Pagination implementiert** – alle Geräte werden via `@odata.nextLink` vollständig geladen | ✅ v2.3.0 |
| Autopilot Group Tag Setter | **File-Logging** – persistentes Log mit Timestamps (`Write-Log`-Funktion) | ✅ v2.3.0 |
| Autopilot Group Tag Setter | **CSV-Export** – Ergebnisse werden in CSV gespeichert | ✅ v2.3.0 |
| Autopilot Group Tag Setter | **Neue CLI-Parameter** – `-LogPath` und `-ExportCsv` | ✅ v2.3.0 |
| Entra ID App Creator | **CLI-Parameter** – `-TenantId`, `-AppName`, `-OwnerName`, `-SecretValidityYears`, `-SaveToFile`, `-OutputPath` | ✅ v2.3.0 |
| Entra ID App Creator | **Rollback** – App wird automatisch gelöscht wenn Folgeschritte fehlschlagen | ✅ v2.3.0 |
| Entra ID App Creator | **Secret-Sicherheit** – kein automatischer Datei-Export; nur mit expliziter Bestätigung | ✅ v2.3.0 |
| Entra ID App Creator | **Code-Refactoring** – Hilfsfunktion `Add-GraphPermissionToApp` für Application/Delegated | ✅ v2.3.0 |
| Same DevOps Environment | **Sprachkonsistenz** – Ausgaben und Kommentare vollständig auf Englisch | ✅ v2.3.0 |

### Offen / Nice to have

| Script | Verbesserung | Nutzen |
|--------|-------------|--------|
| Autopilot Group Tag Setter | Runspace-Pool für parallele Verarbeitung | Performance in Grossumgebungen |
| Entra ID App Creator | Mehrere Apps in einem Durchgang | Effizienz bei Bulk-Erstellungen |
| Device Rename | Parameter für vollautomatischen Batch-Betrieb | CI/CD-Integration |
| OOBE Scripts | Einheitliche Codebasis | Wartbarkeit (Minimal als Subset der Vollversion) |
| Alle Scripts | Pester Unit Tests | Qualitätssicherung und Regressionstests |

---

## Teams-Integration

Viele Scripts unterstützen Microsoft Teams-Benachrichtigungen via Webhook:

```powershell
# Beispiel mit Teams Webhook
.\script.ps1 -TeamsWebhook "https://outlook.office.com/webhook/your-webhook-url"
```

Benachrichtigungstypen:
- Ausführungs-Zusammenfassung nach Abschluss
- Fehler-Alerts mit Fehlerdetails
- Fortschritts-Updates bei langen Operationen

---

## Entwicklung und Beiträge

### Coding Standards

- PowerShell Best Practices (PSSCriptAnalyzer-kompatibel)
- Umfassende Fehlerbehandlung mit `try/catch/finally`
- Detaillierte Comment-Based Help (`<# .SYNOPSIS .DESCRIPTION .PARAMETER .EXAMPLE #>`)
- Modulare Architektur (Scripts nutzen gemeinsame Module)
- PowerShell 5.1+ Kompatibilität sicherstellen

### Testing

1. Script in Testumgebung ausführen
2. `-Test` / `-WhatIf` Parameter nutzen wo verfügbar
3. Staging-Umgebung für Validierung gegen echte Daten
4. Rollback-Strategien implementieren und testen

### Versionierung

- Semantic Versioning (SemVer): `MAJOR.MINOR.PATCH`
- Detaillierte Changelog-Einträge in `CHANGELOG.md`
- Git-Tags für Releases
- Zeitstempel im Format `YYYY-MM-DD HH:MM:SS CET`

---

## Autoren und Mitwirkende

### Hauptautor

**Philipp Schmidt** - Farpoint Technologies
- E-Mail: ps@farpoint.tech
- LinkedIn: [Philipp Schmidt](https://linkedin.com/in/philipp-schmidt-farpoint)

### Mitwirkende

| Autor | Beitrag |
|-------|---------|
| **AliAlame** - CYBERSYSTEM | Original Device Rename Konzept |
| **Roy Klooster** - RKSolutions | sameDevOpsEnvironment Script (v1.2) |

---

## Lizenz

Dieses Repository und alle enthaltenen Scripts sind Eigentum von Farpoint Technologies.

### Nutzungsbedingungen

- Nur für autorisierte Benutzer
- Kommerzielle Nutzung nur mit Genehmigung
- Keine Weiterverteilung ohne Zustimmung
- Support nur für lizenzierte Benutzer

---

## Support

### Selbsthilfe

1. **Dokumentation prüfen**: README-Dateien der jeweiligen Scripts lesen
2. **Debug-Modus**: `-Debug -Verbose` Parameter verwenden
3. **Log-Dateien**: Detaillierte Fehlermeldungen in Log-Pfaden prüfen
4. **Test-Modus**: Zuerst mit `-Test` oder `-WhatIf` ausführen

### Support-Kanäle

| Kanal | Kontakt |
|-------|---------|
| E-Mail | support@farpoint.tech |
| Teams | Farpoint Technologies Support Channel |
| Ticketing | https://support.farpoint.tech |

### Notfall-Support

Für kritische Probleme in Produktionsumgebungen:
- **Hotline**: +49 (0) 000000000
- **24/7 Support**: Nur für Premium-Kunden

---

## Weiterführende Links

| Ressource | Link |
|-----------|------|
| Microsoft Graph PowerShell SDK | https://docs.microsoft.com/en-us/powershell/microsoftgraph/ |
| Microsoft Intune Dokumentation | https://docs.microsoft.com/en-us/mem/intune/ |
| Windows Autopilot Übersicht | https://docs.microsoft.com/en-us/mem/autopilot/ |
| LAPS Dokumentation | https://docs.microsoft.com/en-us/windows-server/identity/laps/ |
| Azure Entra ID Dokumentation | https://docs.microsoft.com/en-us/azure/active-directory/ |
| Farpoint Technologies | https://farpoint.tech |
| GitHub Repository | https://github.com/farpoint-tech/cloudknox |

---

**© 2025 Farpoint Technologies. Alle Rechte vorbehalten.**
