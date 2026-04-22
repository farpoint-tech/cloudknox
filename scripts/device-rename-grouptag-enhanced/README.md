# Device Rename GroupTAG Enhanced v2.0

## Description

Enhanced PowerShell solution for dynamically renaming AAD-joined Intune devices in the format `GroupTag-SerialTail` (≤15 characters). The script provides an improved user interface, comprehensive logging and multiple authentication options.

## Features

### Multiple Authentication Options
- **Interactive Authentication** (Recommended)
- **Username/Password Authentication**
- **Client Credentials (App Registration)**
- **Device Code Authentication**

### Enhanced User Interface
- Colourful, easy-on-the-eye PowerShell interface
- Progress indicators and status updates
- Clear error messages and guidance
- ISE-compatible design

### Comprehensive Logging
- Detailed execution logs
- Error tracking and debugging functions
- Log rotation and management
- Configurable log levels
- Log path: `C:\ProgramData\IntuneDeviceRenamer\logs\`

### Teams Integration
- Real-time notifications via Microsoft Teams webhooks
- Execution summaries and status updates
- Error warnings and alerts
- Customisable notification templates

## Device Naming Convention

- **Pattern:** `GroupTag-SerialTail`
- **Maximum length:** 15 characters
- **Example:** `IT-DEPT-ABC123`

## Prerequisites

- PowerShell 5.1 or higher
- Microsoft Graph PowerShell SDK
- Appropriate Azure AD permissions
- Intune-managed devices

## Quick Start

### Interactive Authentication (Recommended)
```powershell
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive
```

### With Teams Integration
```powershell
# Import Teams module
Import-Module ".\modules\TeamsIntegrationModule.psm1" -Force

# Run script with Teams notifications
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -TeamsWebhook "https://your-teams-webhook-url"
```

## Project Structure

```
project/
├── script/
│   └── DeviceRename-GroupTAG-Enhanced-v2.ps1
├── modules/
│   └── TeamsIntegrationModule.psm1
├── docs/
│   ├── DynamicDeviceRenaminginIntune-EnhancedVersionv2.0
│   └── DynamicDeviceRenaminginIntuneUsingGroupTagsandPowerShell-EnhancedVersionv2.0
├── examples/
│   └── README.md
├── LICENSE
└── README.md
```

## Required Azure AD RBAC Roles

### For Username/Password Authentication:
- **Intune Administrator** (Recommended)
- **Global Administrator** (Full access)
- **Cloud Device Administrator** (Device management)

### For App Registration (Client Credentials):
- No specific user roles required (uses app permissions)

## Required Graph API Permissions

| Permission | Type | Purpose |
|-----------|------|---------|
| `Device.Read.All` | Application or Delegated | Read device information |
| `DeviceManagementServiceConfig.Read.All` | Application or Delegated | Read Intune configuration |
| `User.Read` | Delegated | Read user profile |
| `DeviceManagementManagedDevices.Read.All` | Delegated | Read managed devices |

## Authors

**Enhanced Version:** Philipp Schmidt - Farpoint Technologies
**Original Concept:** AliAlame - CYBERSYSTEM (https://www.cybersystem.ca)

## Version

v2.0 - Enhanced version with improved UI, Teams integration and multiple authentication options
