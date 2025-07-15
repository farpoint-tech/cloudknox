# Usage Examples - Device Rename GroupTAG Enhanced

## Basic Usage Examples

### Interactive Authentication (Recommended)
```powershell
# Navigate to script directory
cd script

# Run with interactive authentication
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive
```

### Username/Password Authentication
```powershell
# Basic username/password authentication
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Username "admin@yourdomain.com" -Password "YourSecurePassword"

# With specific tenant
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -TenantId "your-tenant-id" -Username "admin@yourdomain.com" -Password "YourSecurePassword"
```

### Client Credentials (App Registration)
```powershell
# Using app registration credentials
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -TenantId "your-tenant-id" -ClientId "your-app-client-id" -ClientSecret "your-client-secret"
```

### Device Code Authentication
```powershell
# For remote or headless scenarios
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -DeviceCode
```

## Advanced Usage Examples

### With Teams Integration
```powershell
# Import Teams module first
Import-Module "..\modules\TeamsIntegrationModule.psm1" -Force

# Run with Teams notifications
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -TeamsWebhook "https://outlook.office.com/webhook/your-webhook-url"
```

### Debug Mode
```powershell
# Enable debug logging and verbose output
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -Debug -Verbose
```

### Batch Processing
```powershell
# Process multiple devices with limits
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -BatchMode -MaxDevices 50
```

### Custom Log Path
```powershell
# Specify custom log directory
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -LogPath "C:\CustomLogs\DeviceRename"
```

## Scenario-Based Examples

### Scenario 1: First-Time Setup
```powershell
# 1. Import required modules
Import-Module "..\modules\TeamsIntegrationModule.psm1" -Force

# 2. Test authentication first
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -TestOnly

# 3. Run actual rename process
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive
```

### Scenario 2: Automated Deployment
```powershell
# For automated/scheduled execution
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -TenantId $TenantId -ClientId $ClientId -ClientSecret $ClientSecret -Silent -LogPath "C:\Logs\DeviceRename"
```

### Scenario 3: Troubleshooting
```powershell
# Enable maximum logging for troubleshooting
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -Debug -Verbose -LogLevel "Debug"
```

### Scenario 4: Teams Integration with Custom Messages
```powershell
# Import Teams module
Import-Module "..\modules\TeamsIntegrationModule.psm1" -Force

# Test Teams webhook first
Test-TeamsWebhook -WebhookUrl "https://your-webhook-url"

# Run with custom Teams notifications
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -TeamsWebhook "https://your-webhook-url" -TeamsTitle "Device Rename Process" -TeamsColor "Good"
```

## Parameter Reference

### Authentication Parameters
- `-Interactive` - Use interactive browser authentication (recommended)
- `-Username` - Username for credential authentication
- `-Password` - Password for credential authentication
- `-TenantId` - Azure AD Tenant ID
- `-ClientId` - App registration client ID
- `-ClientSecret` - App registration client secret
- `-DeviceCode` - Use device code authentication flow

### Execution Parameters
- `-BatchMode` - Enable batch processing mode
- `-MaxDevices` - Maximum number of devices to process
- `-TestOnly` - Test authentication and permissions without renaming
- `-Silent` - Run in silent mode (minimal output)
- `-Debug` - Enable debug logging
- `-Verbose` - Enable verbose output

### Teams Integration Parameters
- `-TeamsWebhook` - Teams webhook URL for notifications
- `-TeamsTitle` - Custom title for Teams messages
- `-TeamsColor` - Color theme for Teams messages (Good, Warning, Attention)

### Logging Parameters
- `-LogPath` - Custom log directory path
- `-LogLevel` - Logging level (Debug, Info, Warning, Error)
- `-LogRetention` - Number of days to retain log files

## Error Handling Examples

### Handle Authentication Errors
```powershell
try {
    .\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive
} catch {
    Write-Error "Authentication failed: $($_.Exception.Message)"
    # Check Azure AD permissions and RBAC roles
}
```

### Handle Device Not Found
```powershell
# Enable debug mode to see detailed device search
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -Debug -Verbose
```

### Handle Naming Conflicts
```powershell
# Use test mode to preview naming conflicts
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -TestOnly -Verbose
```

## Best Practices

### 1. Always Test First
```powershell
# Test authentication and permissions
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -TestOnly
```

### 2. Use Interactive Authentication
```powershell
# Recommended for manual execution
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive
```

### 3. Enable Teams Notifications for Production
```powershell
# Keep stakeholders informed
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -TeamsWebhook "https://your-webhook-url"
```

### 4. Use Debug Mode for Troubleshooting
```powershell
# Maximum logging for issue resolution
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -Debug -Verbose -LogLevel "Debug"
```

### 5. Implement Proper Error Handling
```powershell
$ErrorActionPreference = "Stop"
try {
    .\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive
    Write-Host "Device rename completed successfully" -ForegroundColor Green
} catch {
    Write-Error "Device rename failed: $($_.Exception.Message)"
    # Send alert to Teams or email
}
```

## Scheduled Execution Example

### Windows Task Scheduler
```powershell
# Create scheduled task script
$ScriptPath = "C:\Scripts\DeviceRename-GroupTAG-Enhanced-v2.ps1"
$Arguments = "-TenantId '$TenantId' -ClientId '$ClientId' -ClientSecret '$ClientSecret' -Silent -LogPath 'C:\Logs\DeviceRename'"

# PowerShell command for task scheduler
powershell.exe -ExecutionPolicy Bypass -File $ScriptPath $Arguments
```

### Azure Automation Runbook
```powershell
# For Azure Automation execution
param(
    [string]$TenantId,
    [string]$ClientId,
    [string]$ClientSecret,
    [string]$TeamsWebhook
)

# Import required modules
Import-Module AzureAD
Import-Module Microsoft.Graph

# Execute device rename
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -TenantId $TenantId -ClientId $ClientId -ClientSecret $ClientSecret -TeamsWebhook $TeamsWebhook -Silent
```

