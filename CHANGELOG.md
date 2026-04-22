# Changelog

All notable changes to this repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.4.1] - 2026-04-09 CET

### Fixed / Improved
- **Export-EnterpriseAppOwnerList.ps1**: Multiple fixes and improvements (v1.3)
  - Auto path detection: `C:\Temp` on Windows, `~/Downloads` on macOS
  - Export folder is created automatically if it doesn't exist
  - Export path is displayed at the start of the run
  - File opens automatically in Excel after export (`Start-Process`)
  - Module checks: Microsoft.Graph and ImportExcel are installed automatically when missing
  - Fixed: `ConditionalText` replaces `ConditionalFormattingIconSet` for proper "No Owner" highlighting

### Changed
- **Documentation language**: All documentation and script headers for the Enterprise Apps Owner Assignment package have been translated from German to English (folder README, root README section #9, all 4 script Comment-Based Help headers)

## [2.4.0] - 2026-04-08 CET

### Added
- **Enterprise Apps Owner Assignment** – New script package for managing Enterprise App owners via Microsoft Graph API
  - `Export-EnterpriseAppOwnerList.ps1` (Phase 1): Analyzes all Enterprise Apps in the tenant, shows tag/category overview, exports formatted Excel file for departments
  - `Import-EnterpriseAppOwners.ps1` (Phase 2): Reads filled Excel back and assigns owners (with WhatIf/Apply mode)
  - `Assign-OwnerByCategory.ps1` (Phase 3): Interactive owner assignment by category or globally
  - `Assign-EnterpriseAppOwners.ps1` (Standalone): Assigns a default owner to all apps without an owner
  - Comprehensive documentation (README.md) with workflow description, Excel structure, and troubleshooting

### Updated
- **README.md**: Table of contents, repository structure, and script documentation extended with Enterprise Apps Owner Assignment

### Technical Details
- **New Scripts**: 4 PowerShell scripts in `scripts/enterprise-apps-owner-assignment/`
- **Required Modules**: Microsoft.Graph, ImportExcel
- **Graph API Scopes**: Application.Read.All, Application.ReadWrite.All, Directory.Read.All, Directory.ReadWrite.All
- **Branch**: claude/enterprise-apps-owner-assignment-YTrKR

## [2.3.0] - 2026-03-05 CET

### Fixed / Improved
- **AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1**: Critical bug fixed – pagination was missing, devices >1000 were not processed
  - `@odata.nextLink` is now fully traversed (all pages loaded)
  - `Write-Log` function added: persistent log with timestamps and level colours (INFO/WARN/ERROR/SUCCESS)
  - CSV export of results (SerialNumber, Model, GroupTag, Status, Timestamp, ErrorMessage)
  - New parameters: `-LogPath` and `-ExportCsv` (with auto-defaults under `.\Logs\`)

- **Create-EntraIDApp.ps1**: Multiple critical and important issues resolved
  - CLI parameters added: `-TenantId`, `-AppName`, `-OwnerName`, `-SecretValidityYears`, `-SaveToFile`, `-OutputPath`
  - Rollback implemented: on failure after app creation, app is automatically removed via `Remove-MgApplication`
  - Secret security improved: no automatic plaintext export; only with explicit confirmation or `-SaveToFile`
  - File permissions restricted (ACL to CurrentUser) when file export is active
  - Helper function `Add-GraphPermissionToApp` extracted – eliminates duplicated code for Application/Delegated

- **sameDevOpsEnvironment.ps1**: Language consistency established
  - All output messages and comments unified in English
  - Formatting inconsistencies (double blank lines, indentation) cleaned up

### Updated
- **README.md** updated to v2.3.0:
  - Parameter tables for Autopilot Group Tag Setter and Entra ID App Creator added
  - Rollback behaviour for Entra ID App Creator documented
  - Improvements section: completed items marked as ✅, open items updated
- **log.md**: Implementation details documented
- All documentation translated to English

### Technical Details
- **Changed scripts**: 3 PS1 files
- **Branch**: claude/audit-scripts-docs-ZXfWs
- **Author**: Claude Code (Anthropic) / Philipp Schmidt - Farpoint Technologies

## [2.2.0] - 2026-03-05 CET

### Added
- **Full script analysis**: In-depth analysis of all 9 scripts and 2 modules (source code review, security audit, function analysis)
- **Improvement potentials documented**: Critical, important and recommended optimisations identified and documented

### Changed
- **README.md fully revised** (v2.1 → v2.2):
  - Detailed step-by-step function descriptions for all 8 scripts
  - Complete parameter tables with type and description
  - Authentication method overviews per script
  - Shared modules fully documented (AuthenticationModule, TeamsIntegrationModule)
  - Installed software/modules in clear tables
  - New section "Improvement Potentials" (Critical / Important / Nice-to-have)
  - Table of contents with direct links
  - Consistent format and table structure throughout
- **log.md extended**: Detailed analysis entry with script overview table and identified issues

### Identified Issues (to be resolved in future versions)
- **Critical**: Pagination missing in Autopilot Group Tag Setter (>1000 devices not covered)
- **Critical**: Entra ID App Creator writes client secret in plaintext to a text file
- **Critical**: Entra ID App Creator has no rollback on partial failures
- **Important**: Autopilot Group Tag Setter has no file logging
- **Important**: Entra ID App Creator is not automatable (no CLI parameters)
- **Important**: sameDevOpsEnvironment.ps1 had mixed language (EN/DE)

### Technical Details
- **Scripts analysed**: 9 PS1 files, 2 PSM1 modules
- **Lines of code analysed**: ~7,500+
- **Branch**: claude/audit-scripts-docs-ZXfWs
- **Author**: Claude Code (Anthropic) / Philipp Schmidt - Farpoint Technologies

## [2.1.0] - 2025-08-14 21:30:22 CET

### Added
- **Entra ID App Creator**: New PowerShell script for automated app registration
  - **Path**: `scripts/entra-id-app-creator/`
  - **Script**: `Create-EntraIDApp.ps1`
  - **Comprehensive README**: Detailed documentation with usage examples

### Features
- **Fully automated app creation**: Complete automation of the app registration process
- **Interactive configuration**: User-friendly step-by-step guidance
- **API permissions**: Predefined and custom Microsoft Graph permissions
- **Client secret management**: Automatic generation with configurable validity
- **Service principal creation**: Automatic enterprise app creation
- **Multi-platform auth examples**: Ready-to-use authentication examples for Azure CLI, PowerShell and Graph

### Technical Details
- **Supported permissions**: 11 predefined Microsoft Graph permissions
- **Custom APIs**: Support for any API permissions
- **Delegated & Application**: Both permission types supported
- **Automatic module installation**: Microsoft Graph PowerShell SDK installed automatically
- **Comprehensive error handling**: Robust error handling and validation

### Updated
- **Repository README**: Main documentation updated
- **Script overview**: New script added to overall overview
- **Folder structure**: Extended with `scripts/entra-id-app-creator/`

## [2.0.0] - 2025-08-08 08:08:51 CET

### Added
- **Repository reorganisation**: Complete restructuring of the repository
- **Individual script folders**: Each script now has its own folder with README.md
- **Main documentation**: Comprehensive README.md for the entire repository
- **Changelog**: Systematic documentation of all changes with CET timestamps

### Changed
- **Folder structure**: Migration from flat to hierarchical structure
- **Documentation**: Extended and standardised documentation for all scripts
- **Naming conventions**: Consistent naming of all folders and files

### Scripts Overview

#### 1. Autopilot Group Tag Bulk Setter
- **Path**: `scripts/autopilot-group-tag-bulk-setter/`
- **Status**: Reorganised and documented
- **Functions**: Bulk group tag assignment for Autopilot devices

#### 2. Device Rename GroupTAG Enhanced v2.0
- **Path**: `scripts/device-rename-grouptag-enhanced/`
- **Status**: Complete project with modules and documentation
- **Functions**: Enhanced device renaming with Teams integration

#### 3. Enhanced LAPS Diagnostic
- **Path**: `scripts/enhanced-laps-diagnostic/`
- **Status**: Reorganised and documented
- **Functions**: Comprehensive LAPS diagnostics for Windows devices

#### 4. Intune DDG AutoCreator Ultimate
- **Path**: `scripts/intune-ddg-autocreator-ultimate/`
- **Status**: Complete project with modular architecture
- **Functions**: Automatic creation of Dynamic Device Groups

#### 5. OOBE Autopilot Registration - Minimal Version
- **Path**: `scripts/oobe-autopilot-registration-minimal/`
- **Status**: Reorganised and documented
- **Functions**: Lightweight OOBE Autopilot registration

#### 6. OOBE Autopilot Registration - Full Version
- **Path**: `scripts/oobe-autopilot-registration-full/`
- **Status**: Reorganised and documented
- **Functions**: Extended OOBE Autopilot registration with GUI

#### 7. Same DevOps Environment
- **Path**: `scripts/same-devops-environment/`
- **Status**: Reorganised and documented
- **Functions**: DevOps environment standardisation

## [1.5.0] - 2025-08-08 06:35:42 CET

### Added
- **Device Rename GroupTAG Enhanced v2.0**: Complete project added
  - Main script: `DeviceRename-GroupTAG-Enhanced-v2.ps1`
  - Teams integration module: `TeamsIntegrationModule.psm1`
  - Comprehensive documentation and examples
  - Licence file

### Features
- Multiple authentication options (Interactive, Username/Password, Client Credentials, Device Code)
- Enhanced UI with colourful interface
- Teams integration for notifications
- Comprehensive logging system
- RBAC role validation
- Batch processing support

### Technical Details
- **Commit**: b35d675
- **Files**: 7 new files added
- **Lines**: 3,476+ lines of code and documentation
- **Author**: Philipp Schmidt (Enhanced version)
- **Original concept**: AliAlame - CYBERSYSTEM

## [1.0.0] - 2025-08-08 04:22:15 CET

### Added
- **Intune DDG AutoCreator Ultimate**: Complete project added
  - Main script: `Intune-DDG-AutoCreator-Ultimate.ps1`
  - Authentication module: `AuthenticationModule.psm1`
  - Teams integration module: `TeamsIntegrationModule.psm1`
  - Configuration file: `config-ultimate.json`
  - Comprehensive documentation

### Features
- Automatic creation of Dynamic Device Groups
- Modular architecture with separate scripts
- Shared modules for authentication and Teams integration
- Central configuration management
- Examples and usage guides

### Technical Details
- **Commit**: 26be832
- **Files**: 11 files added
- **Lines**: 7,000+ lines of code and documentation
- **Author**: Philipp Schmidt
- **Version**: 1.0

## [0.3.0] - 2025-08-08 02:15:30 CET

### Added
- **Enterprise Office 365 External Sharing Audit & Compliance Report**
  - Comprehensive audit functions for external sharing
  - Compliance reporting
  - SharePoint and OneDrive integration

### Features
- Automated audit reports
- Compliance monitoring
- Detailed logging
- Export functions

### Technical Details
- **Commit**: 4696f78
- **Author**: Philipp Schmidt
- **Focus**: Office 365 security and compliance

## [0.2.0] - 2025-08-07 18:45:22 CET

### Added
- **Initial script collection**
  - `AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1`
  - `Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1`
  - `sameDevOpsEnvironment.ps1`
  - OOBE Autopilot Registration Scripts (Minimal and Full Version)

### Features
- Autopilot group tag management
- LAPS diagnostics and management
- DevOps environment standardisation
- OOBE Autopilot registration

## [0.1.0] - 2025-08-07 15:30:00 CET

### Added
- **Initial repository setup**
- **Basic project structure**
- **First script collection**

### Technical Details
- **Commit**: bdf2d3d
- **Status**: Initial commit
- **Repository**: https://github.com/farpoint-tech/cloudknox

---

## Legend

- **Added**: New features
- **Changed**: Changes to existing features
- **Deprecated**: Features to be removed soon
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security updates

## Timestamp Format

All timestamps use the format: `YYYY-MM-DD HH:MM:SS CET` (Central European Time)

## Versioning

This project uses [Semantic Versioning](https://semver.org/):
- **MAJOR**: Incompatible API changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes (backwards compatible)

## Authors

- **Philipp Schmidt** - Farpoint Technologies (Lead Developer)
- **AliAlame** - CYBERSYSTEM (Original Device Rename Concept)
- **Roy Klooster** - RKSolutions (sameDevOpsEnvironment)

---

**© 2025 Farpoint Technologies. All rights reserved.**
