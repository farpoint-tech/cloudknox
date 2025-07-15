# Shared PowerShell Modules

## Overview
This directory contains reusable PowerShell modules that can be imported by both Script1 and Script2.

## Modules

### AuthenticationModule.psm1
**Purpose:** Comprehensive Microsoft Graph authentication capabilities

**Key Functions:**
- `Connect-DDGMicrosoftGraph` - Main connection function with multiple auth methods
- `Test-DDGGraphConnection` - Verify active Graph connection
- `Get-DDGRequiredPermissions` - List required Graph API permissions
- `Test-DDGPermissions` - Validate current user permissions
- `Get-DDGRBACRoles` - Retrieve RBAC role information
- `Test-DDGRBACRoles` - Validate RBAC role assignments
- `Show-DDGAuthenticationMenu` - Interactive authentication menu
- `Connect-DDGWithCredentials` - Username/password authentication
- `Connect-DDGWithDeviceCode` - Device code flow authentication
- `Connect-DDGInteractive` - Interactive browser authentication
- `Get-DDGAuthenticationStatus` - Check current authentication status
- `Disconnect-DDGMicrosoftGraph` - Clean disconnect from Graph
- `Save-DDGAuthenticationProfile` - Save authentication profile
- `Load-DDGAuthenticationProfile` - Load saved authentication profile

**Authentication Methods:**
1. **Interactive** (Recommended) - Browser-based authentication
2. **Device Code** - For remote/headless scenarios
3. **Credentials** - Username/password (legacy support)

### TeamsIntegrationModule.psm1
**Purpose:** Microsoft Teams webhook integration and notifications

**Key Functions:**
- `Send-TeamsNotification` - Basic message notifications
- `Send-TeamsAdaptiveCard` - Rich adaptive card messages
- `Send-TeamsExecutionSummary` - Detailed execution reports
- `Send-TeamsErrorAlert` - Error notifications with details
- `Send-TeamsProgressUpdate` - Progress tracking messages
- `Test-TeamsWebhook` - Validate webhook connectivity
- `New-TeamsCard` - Create custom Teams cards
- `New-TeamsFactSet` - Create fact sets for cards
- `New-TeamsActionSet` - Create action buttons
- `Format-TeamsMessage` - Message formatting utilities
- `Get-TeamsCardTemplate` - Pre-built card templates

**Features:**
- Adaptive card support
- Color-coded notifications
- Progress tracking
- Error handling and alerts
- Performance metrics
- Threaded conversations

## Usage Examples

### Import Modules
```powershell
# Import authentication module
Import-Module ".\shared-modules\AuthenticationModule.psm1" -Force

# Import Teams integration module
Import-Module ".\shared-modules\TeamsIntegrationModule.psm1" -Force
```

### Authentication Example
```powershell
# Interactive authentication (recommended)
Connect-DDGMicrosoftGraph -AuthenticationMethod Interactive

# Device code authentication (for remote scenarios)
Connect-DDGMicrosoftGraph -AuthenticationMethod DeviceCode

# Test connection
if (Test-DDGGraphConnection) {
    Write-Host "Successfully connected to Microsoft Graph" -ForegroundColor Green
}
```

### Teams Integration Example
```powershell
# Load configuration
$Config = Get-Content "..\shared-config\config-ultimate.json" | ConvertFrom-Json

# Send basic notification
Send-TeamsNotification -WebhookUrl $Config.Teams.WebhookUrl -Title "Script Started" -Message "Processing has begun"

# Send adaptive card with details
$CardData = @{
    Title = "Execution Summary"
    Facts = @(
        @{ Name = "Status"; Value = "Completed" }
        @{ Name = "Items Processed"; Value = "150" }
        @{ Name = "Duration"; Value = "5 minutes" }
    )
}
Send-TeamsAdaptiveCard -WebhookUrl $Config.Teams.WebhookUrl -CardData $CardData
```

## Configuration Integration
Both modules are designed to work with the shared configuration file (`../shared-config/config-ultimate.json`):

```powershell
# Load configuration
$ConfigPath = "..\shared-config\config-ultimate.json"
$Config = Get-Content $ConfigPath | ConvertFrom-Json

# Use authentication settings
$AuthConfig = $Config.Authentication

# Use Teams settings
$TeamsConfig = $Config.Teams
```

## Best Practices
1. Always import modules with `-Force` parameter to ensure latest version
2. Test connections before proceeding with operations
3. Use appropriate authentication method for your environment
4. Configure Teams notifications based on environment (dev/test/prod)
5. Handle authentication errors gracefully
6. Clean up connections when script completes

## Dependencies
- Microsoft Graph PowerShell SDK
- PowerShell 5.1 or higher
- Appropriate Azure AD permissions
- Valid Teams webhook URLs (for Teams integration)

