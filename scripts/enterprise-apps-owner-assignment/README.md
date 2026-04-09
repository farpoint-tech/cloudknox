# Enterprise Apps Owner Assignment

## Description

Comprehensive PowerShell solution for analyzing, assigning, and managing owners for Enterprise Applications (Service Principals) in Azure Entra ID. The solution uses the Microsoft Graph API and is structured as a 3-phase workflow, complemented by a standalone script for simple bulk assignments.

## Main Features

- **Full tenant analysis** – Detects all tags, categories, and owner status of all Enterprise Apps
- **Excel export for departments** – Generates formatted Excel files with AutoFilter, color highlighting, and frozen header row
- **Excel import with dry-run** – Reads filled Excel files back and assigns owners (with WhatIf mode)
- **Interactive category assignment** – Assign owners by category or globally
- **Standalone bulk assignment** – Simple script for a default owner across all apps without owners
- **Cross-platform support** – Export script works on Windows and macOS with automatic path detection

## Scripts Overview

| Phase | Script | Description |
|-------|--------|-------------|
| **1 – Analysis & Export** | `Export-EnterpriseAppOwnerList.ps1` | Tag analysis, category overview, Excel export |
| **2 – Import & Assignment** | `Import-EnterpriseAppOwners.ps1` | Read Excel, assign owners (WhatIf/Apply) |
| **3 – Interactive** | `Assign-OwnerByCategory.ps1` | Assign owners by category or globally |
| **Standalone** | `Assign-EnterpriseAppOwners.ps1` | Default owner for all apps without owners |

## Prerequisites

### PowerShell Modules

```powershell
# Microsoft Graph SDK
Install-Module Microsoft.Graph -Scope CurrentUser

# ImportExcel (for Excel export/import without Office)
Install-Module ImportExcel -Scope CurrentUser
```

> **Note:** The `Export-EnterpriseAppOwnerList.ps1` script automatically installs missing modules (Microsoft.Graph and ImportExcel) on first run.

### Required Graph Permissions

| Script | Permissions |
|--------|-------------|
| Export (Phase 1) | `Application.Read.All`, `Directory.Read.All` |
| Import (Phase 2) | `Application.ReadWrite.All`, `Directory.ReadWrite.All` |
| Interactive (Phase 3) | `Application.ReadWrite.All`, `Directory.ReadWrite.All` |
| Standalone | `Application.Read.All`, `Directory.ReadWrite.All` |

### Roles

The executing account requires at least one of the following Entra ID roles:
- **Global Administrator**
- **Application Administrator**

## Usage

### Phase 1 – Analysis & Excel Export

```powershell
# Analyze all Enterprise Apps and export them as Excel
.\Export-EnterpriseAppOwnerList.ps1
```

**Output:**
- Console output with tag overview and category summary
- Excel file `EnterpriseApp_OwnerAssignment_YYYYMMDD.xlsx`
- **Default export path:** `C:\Temp` (Windows) or `~/Downloads` (macOS)
- Folder is created automatically if it doesn't exist
- File opens automatically in Excel after export
- Send the Excel file to the respective departments – they fill in columns I (NEW Owner UPN), J (Department) and K (Notes)

### Phase 2 – Import & Owner Assignment

```powershell
# Dry-run (default) – shows planned assignments
.\Import-EnterpriseAppOwners.ps1 -ExcelPath "C:\Temp\EnterpriseApp_OwnerAssignment_20260408.xlsx"

# Live execution – actually assigns owners
.\Import-EnterpriseAppOwners.ps1 -ExcelPath "C:\Temp\EnterpriseApp_OwnerAssignment_20260408.xlsx" -Mode Apply
```

### Phase 3 – Interactive Assignment

```powershell
# Starts interactive mode with category selection
.\Assign-OwnerByCategory.ps1
```

**Interactive flow:**
1. Script displays all available categories (based on tags)
2. Selection: `0` for all apps, or comma-separated numbers (e.g. `1,3`)
3. Enter the owner UPN
4. Assignment runs automatically (apps with existing owners are skipped)

### Standalone – Bulk Assignment

```powershell
# Before running: adjust $DefaultOwnerUPN in the script
.\Assign-EnterpriseAppOwners.ps1
```

## Excel File Structure

The exported Excel file contains the following columns:

| Column | Content | To be filled? |
|--------|---------|---------------|
| A – AppObjectId | Service Principal Object ID | No |
| B – DisplayName | Name of the Enterprise App | No |
| C – AppId (Client ID) | Application ID | No |
| D – ServicePrincipalType | Service Principal type | No |
| E – Tags | All tags of the app | No |
| F – Category (Tag) | First tag as category | No |
| G – Current Owner(s) | Current owners (UPN) | No |
| H – Owner Status | "Has Owner" or "No Owner" (highlighted in orange) | No |
| **I – NEW Owner UPN** | **New owner (enter UPN)** | **Yes** |
| **J – Department** | **Department** | **Yes** |
| **K – Notes** | **Notes** | **Yes** |

## Security Notes

- **Dry-run first**: Always run `Import-EnterpriseAppOwners.ps1` in WhatIf mode first
- **Least privilege**: Phase 1 (Export) only requires read permissions
- **Audit trail**: The Excel file serves as documentation of the owner assignments
- **Existing owners**: No script overwrites existing owners – only missing ones are added

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Import-Module: The specified module 'ImportExcel' was not loaded` | The Export script installs it automatically; otherwise: `Install-Module ImportExcel -Scope CurrentUser` |
| `Insufficient privileges to complete the operation` | Check Entra ID role (Global Admin or Application Admin required) |
| `User 'xxx@domain.com' not found` | Check the UPN in the Excel file – must exactly match the Entra ID account |
| `Connect-MgGraph: Interactive authentication is not supported` | Use PowerShell 7+ or device code flow |
| Export folder doesn't exist | The script creates `C:\Temp` (Windows) or `~/Downloads` (macOS) automatically |

## Changelog

### v1.3 (2026-04-09) – Export-EnterpriseAppOwnerList.ps1
- Auto path: `C:\Temp` on Windows, `~/Downloads` on macOS
- Folder is created automatically if it doesn't exist
- Export path is displayed at the start
- File opens automatically in Excel after export
- Module checks: Microsoft.Graph and ImportExcel are installed automatically if missing
- Fixed: ConditionalText replaces ConditionalFormattingIconSet for proper highlighting

### v1.0 (2026-04-08) – Initial release
- All 4 scripts created
- Folder README and root documentation added
