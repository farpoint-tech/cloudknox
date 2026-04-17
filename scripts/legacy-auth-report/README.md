# Legacy Authentication Sign-In Report

This PowerShell script (`Get-LegacyAuthReport.ps1`) queries the Microsoft Graph Sign-In Logs for all sign-in attempts using legacy authentication protocols. It then generates a self-contained, visually rich HTML report containing details such as user, protocol, IP address, location, risk level, and Conditional Access status.

## Features

- **Cross-platform compatible**: Works on Windows (PowerShell 7), macOS (PowerShell 7), and Azure Cloud Shell.
- **Automatic platform detection**: The script detects the runtime environment and adjusts its behaviour accordingly (e.g. opening the HTML report).
- **Detailed analysis**: Targets old, insecure protocols specifically (e.g. Exchange ActiveSync, IMAP4, POP3, Authenticated SMTP, Exchange Web Services).
- **Visual HTML report**: Generates a modern HTML file with filter options (by failures, high risk, no Conditional Access) and an interactive table.
- **Azure Cloud Shell support**: Supports Managed Identities in Cloud Shell with fallback to Device Code Authentication.

## Prerequisites

- **PowerShell version**: 7.0 or higher recommended (Azure Cloud Shell is supported).
- **Required permissions**: `AuditLog.Read.All`, `Directory.Read.All`
- **Required module**: `Microsoft.Graph` (v2+). The script automatically checks for the module and offers to install any missing ones.

## Parameters

| Parameter | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `Days` | `int` | The lookback period in days (1 to 30). | `30` |
| `OutputPath` | `string` | Path for the HTML output file. If not specified, the script selects a platform-appropriate temporary folder. | *Temporary path* |
| `TopCount` | `int` | Maximum number of records to retrieve. | `2000` |
| `SkipAutoOpen` | `switch` | Suppresses automatically opening the generated HTML report in the default browser. | `$false` |

## Examples

### Windows / macOS
Runs the report for the last 30 days and automatically opens the result in the browser:
```powershell
.\Get-LegacyAuthReport.ps1 -Days 30
```

### Azure Cloud Shell
Runs the report for the last 14 days and suppresses auto-open (no local browser available in Cloud Shell):
```powershell
.\Get-LegacyAuthReport.ps1 -Days 14 -SkipAutoOpen
```

## How It Works & Troubleshooting

1. **Connecting to Microsoft Graph**: The script uses `Connect-MgGraph`. In Cloud Shell it first attempts to use the Managed Identity. If that fails, it falls back to Device Code Authentication.
2. **Sorting results**: Results are sorted intelligently — failed logins and high-risk events appear first.
3. **Conditional Access note**: Because legacy authentication protocols can bypass MFA, the report includes a warning and recommendation to block these protocols via Conditional Access.

## Changelog

- Fixed a bug in the `Sort-Object` logic to ensure compatibility with `Set-StrictMode -Version Latest` (avoiding ambiguous hashtable keys during sorting).
