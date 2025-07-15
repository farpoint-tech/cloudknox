# Script2: Secondary Script (Placeholder)

## Overview
This directory is reserved for a second PowerShell script that can utilize the same shared modules and configuration as Script1.

## Setup Instructions

### Adding Your Script
1. Place your PowerShell script (`.ps1` file) in this directory
2. Update your script to import the shared modules:
   ```powershell
   Import-Module "..\shared-modules\AuthenticationModule.psm1" -Force
   Import-Module "..\shared-modules\TeamsIntegrationModule.psm1" -Force
   ```

3. Configure your script to use the shared configuration:
   ```powershell
   $ConfigPath = "..\shared-config\config-ultimate.json"
   $Config = Get-Content $ConfigPath | ConvertFrom-Json
   ```

### Available Shared Resources

#### Authentication Module Functions
- `Connect-DDGMicrosoftGraph`
- `Test-DDGGraphConnection`
- `Get-DDGRequiredPermissions`
- `Test-DDGPermissions`
- `Get-DDGRBACRoles`
- `Show-DDGAuthenticationMenu`
- `Connect-DDGWithCredentials`
- `Connect-DDGWithDeviceCode`
- `Connect-DDGInteractive`

#### Teams Integration Functions
- `Send-TeamsNotification`
- `Send-TeamsAdaptiveCard`
- `Send-TeamsExecutionSummary`
- `Send-TeamsErrorAlert`
- `Send-TeamsProgressUpdate`
- `Test-TeamsWebhook`
- `New-TeamsCard`
- `Format-TeamsMessage`

#### Configuration Access
The shared configuration file provides:
- Authentication settings
- Group naming templates
- Validation rules
- Teams webhook URLs
- Performance settings
- Environment-specific configurations

### Example Script Template
```powershell
#Requires -Version 5.1

# Import shared modules
Import-Module "..\shared-modules\AuthenticationModule.psm1" -Force
Import-Module "..\shared-modules\TeamsIntegrationModule.psm1" -Force

# Load configuration
$ConfigPath = "..\shared-config\config-ultimate.json"
$Config = Get-Content $ConfigPath | ConvertFrom-Json

# Your script logic here
Write-Host "Script2 is ready for implementation!" -ForegroundColor Green

# Example: Connect to Microsoft Graph
Connect-DDGMicrosoftGraph -AuthenticationMethod Interactive

# Example: Send Teams notification
if ($Config.Teams.EnableNotifications) {
    Send-TeamsNotification -WebhookUrl $Config.Teams.WebhookUrl -Title "Script2 Executed" -Message "Script2 has been successfully executed."
}
```

## Suggested Use Cases
- Intune policy management scripts
- Device compliance reporting
- Application deployment automation
- Configuration profile management
- Bulk device operations
- Custom reporting and analytics

## Benefits of Shared Architecture
- Consistent authentication across scripts
- Unified Teams notifications
- Shared configuration management
- Reduced code duplication
- Easier maintenance and updates

