# Usage Examples

## Overview
This directory is intended for example files and usage scenarios for the Intune DDG AutoCreator scripts.

## Example Input Files

### TXT Format Example
Create a file named `ou-list.txt`:
```
IT-Department
HR-Department
Finance-Department
Marketing-Department
Sales-Department
```

### CSV Format Example
Create a file named `ou-list.csv`:
```csv
Name,DisplayName,Description
IT-Dept,IT Department,Information Technology Department Devices
HR-Dept,HR Department,Human Resources Department Devices
Finance-Dept,Finance Department,Finance Department Devices
Marketing-Dept,Marketing Department,Marketing Department Devices
Sales-Dept,Sales Department,Sales Department Devices
```

### JSON Format Example
Create a file named `ou-list.json`:
```json
[
  {
    "Name": "IT-Dept",
    "DisplayName": "IT Department",
    "Description": "Information Technology Department Devices"
  },
  {
    "Name": "HR-Dept",
    "DisplayName": "HR Department", 
    "Description": "Human Resources Department Devices"
  },
  {
    "Name": "Finance-Dept",
    "DisplayName": "Finance Department",
    "Description": "Finance Department Devices"
  }
]
```

## PowerShell Usage Examples

### Basic Script Execution
```powershell
# Navigate to script1 directory
cd ..\script1

# Run with TXT input file
.\Intune-DDG-AutoCreator-Ultimate.ps1 -InputFilePath "..\examples\ou-list.txt" -ConfigPath "..\shared-config\config-ultimate.json"

# Run with CSV input file
.\Intune-DDG-AutoCreator-Ultimate.ps1 -InputFilePath "..\examples\ou-list.csv" -InputFormat CSV -ConfigPath "..\shared-config\config-ultimate.json"

# Run with JSON input file
.\Intune-DDG-AutoCreator-Ultimate.ps1 -InputFilePath "..\examples\ou-list.json" -InputFormat JSON -ConfigPath "..\shared-config\config-ultimate.json"
```

### Interactive Mode Examples
```powershell
# Interactive mode with GridView selection
.\Intune-DDG-AutoCreator-Ultimate.ps1 -Interactive -ConfigPath "..\shared-config\config-ultimate.json"

# Interactive mode with custom input file
.\Intune-DDG-AutoCreator-Ultimate.ps1 -Interactive -InputFilePath "..\examples\ou-list.csv" -ConfigPath "..\shared-config\config-ultimate.json"
```

### Advanced Usage Examples
```powershell
# Dry run mode (preview only)
.\Intune-DDG-AutoCreator-Ultimate.ps1 -DryRun -InputFilePath "..\examples\ou-list.txt" -ConfigPath "..\shared-config\config-ultimate.json"

# Parallel processing with custom job limit
.\Intune-DDG-AutoCreator-Ultimate.ps1 -Parallel -MaxParallelJobs 8 -InputFilePath "..\examples\ou-list.csv" -ConfigPath "..\shared-config\config-ultimate.json"

# Update existing groups
.\Intune-DDG-AutoCreator-Ultimate.ps1 -UpdateExisting -InputFilePath "..\examples\ou-list.txt" -ConfigPath "..\shared-config\config-ultimate.json"

# Cleanup mode to remove obsolete groups
.\Intune-DDG-AutoCreator-Ultimate.ps1 -CleanupMode -ConfigPath "..\shared-config\config-ultimate.json"

# Custom group prefix override
.\Intune-DDG-AutoCreator-Ultimate.ps1 -GroupPrefix "CUSTOM" -InputFilePath "..\examples\ou-list.txt" -ConfigPath "..\shared-config\config-ultimate.json"
```

## Module Usage Examples

### Authentication Module Examples
```powershell
# Import the authentication module
Import-Module "..\shared-modules\AuthenticationModule.psm1" -Force

# Interactive authentication
Connect-DDGMicrosoftGraph -AuthenticationMethod Interactive

# Device code authentication
Connect-DDGMicrosoftGraph -AuthenticationMethod DeviceCode

# Test connection
if (Test-DDGGraphConnection) {
    Write-Host "Connected successfully!" -ForegroundColor Green
}

# Check required permissions
$RequiredPerms = Get-DDGRequiredPermissions
Write-Host "Required permissions: $($RequiredPerms -join ', ')"

# Test current permissions
$PermissionTest = Test-DDGPermissions
if ($PermissionTest.HasAllPermissions) {
    Write-Host "All required permissions are available" -ForegroundColor Green
} else {
    Write-Host "Missing permissions: $($PermissionTest.MissingPermissions -join ', ')" -ForegroundColor Red
}
```

### Teams Integration Examples
```powershell
# Import the Teams module
Import-Module "..\shared-modules\TeamsIntegrationModule.psm1" -Force

# Load configuration
$Config = Get-Content "..\shared-config\config-ultimate.json" | ConvertFrom-Json

# Test webhook
if (Test-TeamsWebhook -WebhookUrl $Config.Teams.WebhookUrl) {
    Write-Host "Teams webhook is working!" -ForegroundColor Green
}

# Send basic notification
Send-TeamsNotification -WebhookUrl $Config.Teams.WebhookUrl -Title "Test Notification" -Message "This is a test message from the DDG AutoCreator"

# Send adaptive card
$CardData = @{
    Title = "DDG AutoCreator Results"
    Subtitle = "Execution Summary"
    Facts = @(
        @{ Name = "Groups Created"; Value = "15" }
        @{ Name = "Groups Updated"; Value = "3" }
        @{ Name = "Errors"; Value = "0" }
        @{ Name = "Duration"; Value = "2 minutes 30 seconds" }
    )
    Actions = @(
        @{ Type = "OpenUrl"; Title = "View Report"; Url = "https://portal.azure.com" }
    )
}
Send-TeamsAdaptiveCard -WebhookUrl $Config.Teams.WebhookUrl -CardData $CardData

# Send error alert
Send-TeamsErrorAlert -WebhookUrl $Config.Teams.WebhookUrl -ErrorMessage "Failed to create group: IT-Department" -ScriptName "DDG AutoCreator"
```

## Configuration Examples

### Environment-Specific Usage
```powershell
# Load base configuration
$Config = Get-Content "..\shared-config\config-ultimate.json" | ConvertFrom-Json

# Use Development environment settings
$Environment = "Development"
$EnvConfig = $Config.Environments.$Environment

# Apply environment-specific settings
foreach ($Section in $EnvConfig.PSObject.Properties.Name) {
    foreach ($Setting in $EnvConfig.$Section.PSObject.Properties.Name) {
        $Config.$Section.$Setting = $EnvConfig.$Section.$Setting
    }
}

# Now use the environment-specific configuration
Write-Host "Using environment: $Environment"
Write-Host "Group prefix: $($Config.General.DefaultGroupPrefix)"
```

### Custom Configuration Override
```powershell
# Load configuration
$Config = Get-Content "..\shared-config\config-ultimate.json" | ConvertFrom-Json

# Override specific settings for this execution
$Config.General.DefaultGroupPrefix = "TEMP"
$Config.Features.ParallelProcessing = $false
$Config.Teams.EnableNotifications = $false

# Save temporary configuration
$TempConfigPath = "$env:TEMP\temp-config.json"
$Config | ConvertTo-Json -Depth 10 | Out-File $TempConfigPath

# Use temporary configuration
.\Intune-DDG-AutoCreator-Ultimate.ps1 -ConfigPath $TempConfigPath -InputFilePath "..\examples\ou-list.txt"
```

## Troubleshooting Examples

### Common Issues and Solutions

#### Authentication Issues
```powershell
# Clear authentication cache
Disconnect-DDGMicrosoftGraph

# Try different authentication method
Connect-DDGMicrosoftGraph -AuthenticationMethod DeviceCode

# Check authentication status
$AuthStatus = Get-DDGAuthenticationStatus
Write-Host "Authentication Status: $($AuthStatus.Status)"
```

#### Permission Issues
```powershell
# Check current permissions
$PermTest = Test-DDGPermissions
if (-not $PermTest.HasAllPermissions) {
    Write-Host "Missing permissions:" -ForegroundColor Red
    $PermTest.MissingPermissions | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

# Get RBAC role information
$RBACRoles = Get-DDGRBACRoles
Write-Host "Current RBAC roles: $($RBACRoles -join ', ')"
```

#### Teams Integration Issues
```powershell
# Test webhook connectivity
if (-not (Test-TeamsWebhook -WebhookUrl $Config.Teams.WebhookUrl)) {
    Write-Host "Teams webhook test failed. Check the URL in configuration." -ForegroundColor Red
}

# Send test notification
try {
    Send-TeamsNotification -WebhookUrl $Config.Teams.WebhookUrl -Title "Test" -Message "Testing connectivity"
    Write-Host "Teams notification sent successfully" -ForegroundColor Green
} catch {
    Write-Host "Failed to send Teams notification: $($_.Exception.Message)" -ForegroundColor Red
}
```

## Best Practices

1. **Always test with dry run first:**
   ```powershell
   .\Intune-DDG-AutoCreator-Ultimate.ps1 -DryRun -InputFilePath "..\examples\ou-list.txt"
   ```

2. **Use interactive mode for initial setup:**
   ```powershell
   .\Intune-DDG-AutoCreator-Ultimate.ps1 -Interactive
   ```

3. **Enable Teams notifications for production:**
   ```powershell
   # Update config to enable Teams notifications
   $Config.Teams.EnableNotifications = $true
   ```

4. **Use appropriate batch sizes for your environment:**
   ```powershell
   # For large environments, increase batch size
   $Config.General.BatchSize = 20
   ```

5. **Enable backup for production runs:**
   ```powershell
   $Config.General.CreateBackup = $true
   ```

