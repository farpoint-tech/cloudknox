# Shared Configuration

## Overview
This directory contains the shared configuration file used by both scripts and modules.

## Configuration File: config-ultimate.json

### Structure Overview
The configuration file is organized into logical sections:

#### General Settings
- `DefaultGroupPrefix` - Prefix for all created groups
- `BatchSize` - Number of items to process in each batch
- `DelayBetweenBatches` - Delay in seconds between batches
- `MaxRetryAttempts` - Maximum retry attempts for failed operations
- `LogLevel` - Logging verbosity (Debug, Info, Warning, Error)
- `ExportResults` - Enable result export
- `CreateBackup` - Enable backup creation

#### Group Naming Templates
Multiple naming templates for different scenarios:
- `Default` - Standard naming pattern
- `Department` - Department-based naming
- `Location` - Location-based naming
- `Custom` - Custom naming pattern
- `Enterprise` - Enterprise naming pattern

#### Membership Rules
Dynamic group membership rule templates:
- `OrderID` - Based on Order ID
- `GroupTag` - Based on Group Tag
- `Custom` - Custom rule pattern
- `ZTDId` - Based on Zero Touch Deployment ID

#### Authentication Configuration
- `Scopes` - Required Graph API scopes
- `TenantId` - Azure AD Tenant ID (optional)
- `ClientId` - Application Client ID (optional)
- `UseDeviceCode` - Enable device code authentication
- `UseInteractiveAuth` - Enable interactive authentication
- `UseCredentials` - Enable credential-based authentication

#### Validation Settings
- `ValidateOUFormat` - Enable OU format validation
- `CheckDuplicates` - Enable duplicate detection
- `ValidateCharacterLimits` - Enable character limit validation
- `RequiredOUPattern` - Regex pattern for OU validation
- `MaxOULength` - Maximum OU name length

#### Reporting Configuration
- `GenerateHTMLReport` - Enable HTML report generation
- `GenerateCSVReport` - Enable CSV report generation
- `GenerateJSONReport` - Enable JSON report generation
- `IncludePreflightChecks` - Include preflight check results
- `ShowMembershipPreview` - Show membership rule preview

#### Teams Integration
- `EnableNotifications` - Enable Teams notifications
- `WebhookUrl` - Teams webhook URL
- `NotifyOnStart` - Send notification when script starts
- `NotifyOnCompletion` - Send notification when script completes
- `NotifyOnErrors` - Send notification on errors
- `IncludeStatistics` - Include statistics in notifications

#### Performance Settings
- `EnableCaching` - Enable result caching
- `CacheTimeout` - Cache timeout in seconds
- `ConnectionTimeout` - Connection timeout in seconds
- `MaxConcurrentRequests` - Maximum concurrent API requests

### Environment-Specific Configurations

The configuration file includes three pre-configured environments:

#### Development Environment
- Prefix: "DEV"
- Debug logging enabled
- Interactive mode enabled
- Parallel processing disabled
- Teams notifications disabled

#### Testing Environment
- Prefix: "TEST"
- Info logging level
- Moderate parallel processing (3 jobs)
- Teams notifications enabled
- Audit mode enabled

#### Production Environment
- Prefix: "PROD"
- Warning logging level
- High parallel processing (8 jobs)
- Full Teams integration
- Scheduled mode enabled
- Enhanced security settings

## Customization Guide

### Basic Customization
1. **Update Group Prefix:**
   ```json
   "General": {
     "DefaultGroupPrefix": "YOUR-PREFIX"
   }
   ```

2. **Configure Authentication:**
   ```json
   "Authentication": {
     "TenantId": "your-tenant-id",
     "UseInteractiveAuth": true
   }
   ```

3. **Set Teams Webhook:**
   ```json
   "Teams": {
     "EnableNotifications": true,
     "WebhookUrl": "https://your-teams-webhook-url"
   }
   ```

### Advanced Customization

#### Custom Naming Template
```json
"GroupNaming": {
  "Templates": {
    "MyCustom": "{Prefix}-Custom-{OU}-{Type}"
  },
  "DefaultTemplate": "MyCustom"
}
```

#### Custom Membership Rule
```json
"MembershipRules": {
  "Templates": {
    "MyRule": "(device.devicePhysicalIds -any _ -contains \"MyTag:{OU}\")"
  },
  "DefaultTemplate": "MyRule"
}
```

#### Environment Selection
To use a specific environment, scripts can load the environment-specific settings:

```powershell
$Config = Get-Content "config-ultimate.json" | ConvertFrom-Json
$Environment = "Production"  # or "Development" or "Testing"
$EnvConfig = $Config.Environments.$Environment

# Merge environment settings with base config
foreach ($Section in $EnvConfig.PSObject.Properties.Name) {
    foreach ($Setting in $EnvConfig.$Section.PSObject.Properties.Name) {
        $Config.$Section.$Setting = $EnvConfig.$Section.$Setting
    }
}
```

## Security Considerations

### Sensitive Information
- Never store passwords or secrets in the configuration file
- Use Azure Key Vault or secure credential storage for sensitive data
- Consider using environment variables for sensitive settings

### Access Control
- Restrict access to the configuration file
- Use appropriate file system permissions
- Consider encrypting sensitive sections

### Best Practices
- Use separate configuration files for different environments
- Validate configuration before use
- Regularly review and update settings
- Document any customizations made

## Validation
The configuration file includes built-in validation settings. Scripts should validate the configuration before use:

```powershell
# Example validation
$Config = Get-Content "config-ultimate.json" | ConvertFrom-Json

if (-not $Config.General.DefaultGroupPrefix) {
    throw "DefaultGroupPrefix is required"
}

if ($Config.Teams.EnableNotifications -and -not $Config.Teams.WebhookUrl) {
    throw "WebhookUrl is required when Teams notifications are enabled"
}
```

