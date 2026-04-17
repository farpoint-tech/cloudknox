# Intune DDG AutoCreator Ultimate

## Description

The ultimate solution for automatic creation and management of Dynamic Device Groups (DDG) in Microsoft Intune. This comprehensive PowerShell framework provides advanced features for automated group management with Teams integration, modular architecture and a central JSON configuration.

## Features

### Automatic Group Creation
- **Dynamic Device Groups**: Automatic creation based on device attributes
- **Rule engine**: Flexible rule definitions for group membership
- **Bulk operations**: Mass group creation and management
- **Template system**: Predefined group templates

### Advanced Configuration
- **JSON configuration**: Central configuration management via `config-ultimate.json`
- **Modular architecture**: Separate modules for different functions
- **Scalable solution**: Support for large environments
- **Customisable workflows**: Flexible adaptation to enterprise requirements

### Authentication and Security
- **Multiple auth methods**: Interactive, Client Credentials, Device Code, Username/Password
- **Secure credential management**: Encrypted storage of credentials
- **RBAC integration**: Role-based access control
- **Audit logging**: Comprehensive logging of all actions

### Teams Integration
- **Webhook notifications**: Real-time notifications via Teams
- **Status updates**: Automatic progress messages
- **Error alerts**: Immediate notification of issues
- **Summary reports**: Detailed execution reports

## Project Structure

```
project/
├── script1/                        # Main script
│   ├── Intune-DDG-AutoCreator-Ultimate.ps1
│   └── README.md
├── script2/                        # Additional scripts (placeholder)
│   └── README.md
├── shared-modules/                 # Shared modules
│   ├── AuthenticationModule.psm1
│   ├── TeamsIntegrationModule.psm1
│   └── README.md
├── shared-config/                  # Configuration files
│   ├── config-ultimate.json
│   └── README.md
├── docs/                           # Documentation
│   └── IntuneDynamicDeviceGroupAutoCreator-UltimateEnterpriseEdition.md
├── examples/                       # Usage examples
│   └── README.md
└── README.md                       # Main documentation
```

## Prerequisites

- PowerShell 5.1 or higher
- Microsoft Graph PowerShell SDK
- Azure AD permissions:
  - `Group.ReadWrite.All`
  - `Device.Read.All`
  - `DeviceManagementManagedDevices.Read.All`
- Microsoft Intune licence

## Quick Start

### 1. Configuration
```powershell
# Adjust configuration file
notepad shared-config\config-ultimate.json
```

### 2. Import modules
```powershell
# Authentication module
Import-Module ".\shared-modules\AuthenticationModule.psm1" -Force

# Teams integration (optional)
Import-Module ".\shared-modules\TeamsIntegrationModule.psm1" -Force
```

### 3. Run script
```powershell
# Basic execution
.\script1\Intune-DDG-AutoCreator-Ultimate.ps1

# With Teams notifications
.\script1\Intune-DDG-AutoCreator-Ultimate.ps1 -TeamsWebhook "https://your-webhook-url"
```

## Configuration (config-ultimate.json)

```json
{
  "GroupSettings": {
    "Prefix": "DDG-",
    "Description": "Automatically created dynamic device group",
    "MembershipType": "DynamicDevice"
  },
  "Rules": [
    {
      "Name": "Windows Devices",
      "Rule": "(device.deviceOSType -eq \"Windows\")"
    },
    {
      "Name": "iOS Devices",
      "Rule": "(device.deviceOSType -eq \"iOS\")"
    }
  ],
  "Notifications": {
    "TeamsEnabled": true,
    "EmailEnabled": false
  }
}
```

## Usage Scenarios

```powershell
# OS-based groups
.\script1\Intune-DDG-AutoCreator-Ultimate.ps1 -GroupType "OperatingSystem"

# Department-based groups
.\script1\Intune-DDG-AutoCreator-Ultimate.ps1 -GroupType "Department" -DepartmentList "IT,HR,Finance"

# Compliance-based groups
.\script1\Intune-DDG-AutoCreator-Ultimate.ps1 -GroupType "Compliance"
```

## Authentication

### Supported Methods

| Method | Use case |
|--------|---------|
| Interactive | Manual execution (browser-based) |
| Service Principal | Automated execution / CI/CD |
| Managed Identity | Azure-hosted environments |
| Device Code | MFA-compatible, no browser required |

### Example: Service Principal
```powershell
$AuthParams = @{
    TenantId     = "your-tenant-id"
    ClientId     = "your-client-id"
    ClientSecret = "your-client-secret"
}
.\script1\Intune-DDG-AutoCreator-Ultimate.ps1 @AuthParams
```

## Teams Integration Setup

1. Open Teams channel
2. Configure connectors
3. Add Incoming Webhook
4. Copy webhook URL

```powershell
.\script1\Intune-DDG-AutoCreator-Ultimate.ps1 -TeamsWebhook "https://outlook.office.com/webhook/..."
```

## Troubleshooting

```powershell
# Debug mode
.\script1\Intune-DDG-AutoCreator-Ultimate.ps1 -Debug -Verbose

# View latest logs
Get-Content "C:\Logs\DDG-AutoCreator\latest.log" -Tail 50

# Search for errors
Select-String -Path "C:\Logs\DDG-AutoCreator\*.log" -Pattern "ERROR"
```

## Best Practices

1. **Rule design**: Use clear and specific rules; avoid conflicts; validate regularly
2. **Security**: Use minimum required permissions; enable audit logging
3. **Maintenance**: Keep modules updated; clean up orphaned groups; keep documentation current

## Author

Philipp Schmidt - Farpoint Technologies

## Version

1.0 - Ultimate Enterprise Edition
