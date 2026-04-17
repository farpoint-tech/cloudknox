# Autopilot Group Tag Bulk Setter

## Description

This PowerShell script enables bulk assignment of Group Tags for Autopilot devices in Microsoft Intune. It provides an efficient solution for managing large numbers of Autopilot devices through automated group tag assignment, with full pagination support for environments with more than 1,000 devices.

## Features

- **Bulk group tag assignment**: Set group tags for multiple Autopilot devices at once
- **Full pagination**: Handles environments with more than 1,000 devices via `@odata.nextLink`
- **Test mode**: Preview which devices would be tagged without making real changes
- **File logging**: Persistent log with timestamps and colour-coded levels (INFO/WARN/ERROR/SUCCESS)
- **CSV export**: Export results for audit and reporting purposes
- **Validation and error handling**: Robust error handling per device with individual error messages

## Prerequisites

- PowerShell 5.1 or higher
- Microsoft Graph PowerShell SDK (`Microsoft.Graph.Authentication`)
- Azure AD permissions:
  - `DeviceManagementServiceConfig.ReadWrite.All`
- Intune Administrator or Global Administrator role

## Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `-GroupTag` | String | The group tag to set | Interactive prompt |
| `-Test` | Switch | Test mode: shows changes without executing | – |
| `-LogPath` | String | Path for the log file | `.\Logs\AutopilotGroupTag_<date>.log` |
| `-ExportCsv` | String | Path for the CSV export | `.\Logs\AutopilotGroupTag_<date>.csv` |

## Usage

```powershell
# Test run (no real changes)
.\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1 -Test

# Interactive tag selection
.\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1

# Set tag directly via parameter
.\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1 -GroupTag "userdriven"

# With custom log path and CSV export
.\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1 -GroupTag "userdriven" -LogPath "C:\Logs\autopilot.log" -ExportCsv "C:\Logs\results.csv"
```

## How It Works

1. Connects to Microsoft Graph (`DeviceManagementServiceConfig.ReadWrite.All`)
2. Loads **all** Windows Autopilot devices via paginated API calls
3. Filters devices without an existing group tag
4. Prompts the user to select or enter a group tag
5. Requires explicit confirmation before making real changes
6. Sets the group tag via the `updateDeviceProperties` endpoint (Beta API)
7. Writes a persistent log file and CSV export with results

## CSV Export Columns

| Column | Description |
|--------|-------------|
| `SerialNumber` | Device serial number |
| `Model` | Device model |
| `GroupTag` | Applied group tag |
| `Status` | Result: Success / Error / TEST |
| `Timestamp` | Timestamp of the operation |
| `ErrorMessage` | Error message if applicable |

## Author

Philipp Schmidt - Farpoint Technologies

## Version

2.0 - Added pagination, file logging, CSV export
