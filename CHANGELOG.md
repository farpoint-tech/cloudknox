# Changelog

Alle wichtigen Änderungen an diesem Repository werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
und dieses Projekt folgt [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2025-08-08 08:08:51 CET

### Added
- **Repository-Reorganisation**: Vollständige Neustrukturierung des Repositories
- **Individuelle Script-Ordner**: Jedes Script hat nun einen eigenen Ordner mit README.md
- **Hauptdokumentation**: Umfassende README.md für das gesamte Repository
- **Changelog**: Systematische Dokumentation aller Änderungen mit CET-Zeitstempel

### Changed
- **Ordnerstruktur**: Migration von flacher zu hierarchischer Struktur
- **Dokumentation**: Erweiterte und standardisierte Dokumentation für alle Scripts
- **Namenskonventionen**: Konsistente Benennung aller Ordner und Dateien

### Scripts Overview

#### 1. Autopilot Group Tag Bulk Setter
- **Pfad**: `scripts/autopilot-group-tag-bulk-setter/`
- **Status**: Reorganisiert und dokumentiert
- **Funktionen**: Massenhafte Group Tag-Zuweisung für Autopilot-Geräte

#### 2. Device Rename GroupTAG Enhanced v2.0
- **Pfad**: `scripts/device-rename-grouptag-enhanced/`
- **Status**: Vollständiges Projekt mit Modulen und Dokumentation
- **Funktionen**: Erweiterte Geräteumbenennung mit Teams-Integration

#### 3. Enhanced LAPS Diagnostic
- **Pfad**: `scripts/enhanced-laps-diagnostic/`
- **Status**: Reorganisiert und dokumentiert
- **Funktionen**: Umfassende LAPS-Diagnose für Windows-Geräte

#### 4. Intune DDG AutoCreator Ultimate
- **Pfad**: `scripts/intune-ddg-autocreator-ultimate/`
- **Status**: Vollständiges Projekt mit modularer Architektur
- **Funktionen**: Automatische Erstellung von Dynamic Device Groups

#### 5. OOBE Autopilot Registration - Minimal Version
- **Pfad**: `scripts/oobe-autopilot-registration-minimal/`
- **Status**: Reorganisiert und dokumentiert
- **Funktionen**: Schlanke OOBE Autopilot-Registrierung

#### 6. OOBE Autopilot Registration - Vollversion
- **Pfad**: `scripts/oobe-autopilot-registration-full/`
- **Status**: Reorganisiert und dokumentiert
- **Funktionen**: Erweiterte OOBE Autopilot-Registrierung mit GUI

#### 7. Same DevOps Environment
- **Pfad**: `scripts/same-devops-environment/`
- **Status**: Reorganisiert und dokumentiert
- **Funktionen**: DevOps-Umgebungs-Standardisierung

## [1.5.0] - 2025-08-08 06:35:42 CET

### Added
- **Device Rename GroupTAG Enhanced v2.0**: Vollständiges Projekt hinzugefügt
  - Hauptskript: `DeviceRename-GroupTAG-Enhanced-v2.ps1`
  - Teams-Integration-Modul: `TeamsIntegrationModule.psm1`
  - Umfassende Dokumentation und Beispiele
  - Lizenz-Datei

### Features
- Multiple Authentifizierungsoptionen (Interactive, Username/Password, Client Credentials, Device Code)
- Enhanced UI mit farbenfroher Benutzeroberfläche
- Teams-Integration für Benachrichtigungen
- Umfassendes Logging-System
- RBAC-Rollenvalidierung
- Batch-Processing-Unterstützung

### Technical Details
- **Commit**: b35d675
- **Dateien**: 7 neue Dateien hinzugefügt
- **Zeilen**: 3.476+ Zeilen Code und Dokumentation
- **Autor**: Philipp Schmidt (Enhanced version)
- **Original Konzept**: AliAlame - CYBERSYSTEM

## [1.0.0] - 2025-08-08 04:22:15 CET

### Added
- **Intune DDG AutoCreator Ultimate**: Vollständiges Projekt hinzugefügt
  - Hauptskript: `Intune-DDG-AutoCreator-Ultimate.ps1`
  - Authentifizierungs-Modul: `AuthenticationModule.psm1`
  - Teams-Integration-Modul: `TeamsIntegrationModule.psm1`
  - Konfigurationsdatei: `config-ultimate.json`
  - Umfassende Dokumentation

### Features
- Automatische Erstellung von Dynamic Device Groups
- Modulare Architektur mit getrennten Skripten
- Gemeinsame Module für Authentifizierung und Teams-Integration
- Zentrale Konfigurationsverwaltung
- Beispiele und Verwendungsanleitungen

### Technical Details
- **Commit**: 26be832
- **Dateien**: 11 Dateien hinzugefügt
- **Zeilen**: 7.000+ Zeilen Code und Dokumentation
- **Autor**: Philipp Schmidt
- **Version**: 1.0

## [0.3.0] - 2025-08-08 02:15:30 CET

### Added
- **Enterprise Office 365 External Sharing Audit & Compliance Report**
  - Umfassende Audit-Funktionen für externe Freigaben
  - Compliance-Berichterstattung
  - SharePoint und OneDrive-Integration

### Features
- Automatisierte Audit-Berichte
- Compliance-Überwachung
- Detaillierte Protokollierung
- Export-Funktionen

### Technical Details
- **Commit**: 4696f78
- **Autor**: Philipp Schmidt
- **Fokus**: Office 365 Security und Compliance

## [0.2.0] - 2025-08-07 18:45:22 CET

### Added
- **Grundlegende Script-Sammlung**
  - `AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1`
  - `Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1`
  - `sameDevOpsEnvironment.ps1`
  - OOBE Autopilot Registration Scripts (Minimal und Vollversion)

### Features
- Autopilot Group Tag-Verwaltung
- LAPS-Diagnose und -Verwaltung
- DevOps-Umgebungs-Standardisierung
- OOBE Autopilot-Registrierung

## [0.1.0] - 2025-08-07 15:30:00 CET

### Added
- **Initial Repository Setup**
- **Grundlegende Projektstruktur**
- **Erste Script-Sammlung**

### Technical Details
- **Commit**: bdf2d3d
- **Status**: Initial commit
- **Repository**: https://github.com/farpoint-tech/cloudknox

---

## Legende

- **Added**: Neue Features
- **Changed**: Änderungen an bestehenden Features
- **Deprecated**: Features, die bald entfernt werden
- **Removed**: Entfernte Features
- **Fixed**: Fehlerbehebungen
- **Security**: Sicherheitsupdates

## Zeitformat

Alle Zeitstempel verwenden das Format: `YYYY-MM-DD HH:MM:SS CET` (Central European Time)

## Versionierung

Dieses Projekt verwendet [Semantic Versioning](https://semver.org/):
- **MAJOR**: Inkompatible API-Änderungen
- **MINOR**: Neue Funktionen (rückwärtskompatibel)
- **PATCH**: Fehlerbehebungen (rückwärtskompatibel)

## Autoren

- **Philipp Schmidt** - Farpoint Technologies (Hauptentwickler)
- **AliAlame** - CYBERSYSTEM (Original Device Rename Konzept)

---

**© 2024-2025 Farpoint Technologies. Alle Rechte vorbehalten.**

