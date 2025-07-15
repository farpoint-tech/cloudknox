# Device Rename GroupTAG Enhanced v2.0

**Dynamic Device Renaming in Intune Using Group Tags and PowerShell**

**Version:** 2.0  
**Original Concept:** AliAlame - CYBERSYSTEM  
**Enhanced Version:** Philipp Schmidt  
**Date:** July 15, 2025

## 🎯 Overview

This enhanced PowerShell script automatically renames AAD-joined Intune devices to a standardized "GroupTag-SerialTail" format (≤15 characters). The script provides multiple authentication options, enhanced UI, comprehensive logging, and Teams integration capabilities.

## 📁 Project Structure

```
Device-Rename-GroupTAG-Enhanced/
├── script/                         # Main PowerShell Script
│   └── DeviceRename-GroupTAG-Enhanced-v2.ps1
├── modules/                        # PowerShell Modules
│   └── TeamsIntegrationModule.psm1
├── docs/                          # Documentation
│   ├── DynamicDeviceRenaminginIntune-EnhancedVersionv2.0
│   └── DynamicDeviceRenaminginIntuneUsingGroupTagsandPowerShell-EnhancedVersionv2.0
├── examples/                      # Usage Examples (Empty)
├── LICENSE                        # License File
└── README.md                      # This File
```

## ✨ Key Features

### 🔐 Multiple Authentication Options
- **Interactive Authentication** (Recommended)
- **Username/Password Authentication** 
- **Client Credentials (App Registration)**
- **Device Code Authentication**

### 🎨 Enhanced User Interface
- Colorful, eye-friendly PowerShell interface
- Progress indicators and status updates
- Clear error messages and guidance
- ISE-compatible design

### 📊 Comprehensive Logging
- Detailed execution logs
- Error tracking and debugging
- Log rotation and management
- Configurable log levels

### 🔔 Teams Integration
- Real-time notifications via Microsoft Teams webhooks
- Execution summaries and status updates
- Error alerts and warnings
- Customizable notification templates

### 🛡️ Security & Compliance
- Secure credential handling
- RBAC role validation
- Audit trail maintenance
- Permission verification

## 🚀 Quick Start

### Prerequisites
- PowerShell 5.1 or higher
- Microsoft Graph PowerShell SDK
- Appropriate Azure AD permissions
- Intune-managed devices

### Basic Usage

#### Interactive Authentication (Recommended)
```powershell
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive
```

#### Username/Password Authentication
```powershell
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Username "admin@domain.com" -Password "SecurePassword123"
```

#### Client Credentials Authentication
```powershell
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -TenantId "your-tenant-id" -ClientId "your-client-id" -ClientSecret "your-client-secret"
```

### Advanced Usage

#### With Teams Integration
```powershell
# Import Teams module first
Import-Module ".\modules\TeamsIntegrationModule.psm1" -Force

# Run script with Teams notifications
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -TeamsWebhook "https://your-teams-webhook-url"
```

#### Batch Processing
```powershell
# Process multiple devices
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -BatchMode -MaxDevices 50
```

## 🔧 Configuration

### Required Azure AD RBAC Roles

#### For Username/Password Authentication:
- **Intune Administrator** (Recommended)
- **Global Administrator** (Full access)
- **Cloud Device Administrator** (Device management)
- **Azure AD Joined Device Local Administrator** (Device-specific)

#### For App Registration (Client Credentials):
- No specific user roles required (uses app permissions)

### Required Graph API Permissions
- `Device.Read.All` (Application or Delegated)
- `DeviceManagementServiceConfig.Read.All` (Application or Delegated)
- `User.Read` (Delegated)
- `DeviceManagementManagedDevices.Read.All` (Delegated - for user auth)

### Log Location
- **Default Path:** `C:\ProgramData\IntuneDeviceRenamer\logs\`
- **Log Rotation:** Automatic cleanup of old log files
- **Log Levels:** Debug, Info, Warning, Error

## 📋 Device Naming Convention

The script renames devices using the following format:
- **Pattern:** `GroupTag-SerialTail`
- **Maximum Length:** 15 characters
- **Example:** `IT-DEPT-ABC123` (where IT-DEPT is the GroupTag and ABC123 is the serial number tail)

### GroupTag Sources
1. **Autopilot GroupTag** (Primary)
2. **Device Category** (Fallback)
3. **Custom Attribute** (Configurable)
4. **Default Prefix** (Last resort)

## 🔔 Teams Integration

### Setup Teams Webhook
1. Create an Incoming Webhook in your Teams channel
2. Copy the webhook URL
3. Use the URL with the `-TeamsWebhook` parameter

### Notification Types
- **Start Notifications** - Script execution begins
- **Progress Updates** - Device processing status
- **Success Notifications** - Successful renames
- **Error Alerts** - Failures and issues
- **Summary Reports** - Execution statistics

### Example Teams Integration
```powershell
# Import Teams module
Import-Module ".\modules\TeamsIntegrationModule.psm1" -Force

# Run with Teams notifications
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -TeamsWebhook "https://outlook.office.com/webhook/your-webhook-url"
```

## 🛠️ Troubleshooting

### Common Issues

#### Authentication Failures
- Verify Azure AD permissions
- Check RBAC role assignments
- Validate client credentials
- Ensure MFA is properly configured

#### Device Not Found
- Confirm device is Intune-managed
- Verify device is AAD-joined
- Check device compliance status
- Validate GroupTag assignment

#### Naming Conflicts
- Review existing device names
- Check character limits (15 max)
- Validate GroupTag format
- Ensure serial number uniqueness

### Debug Mode
```powershell
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -Debug -Verbose
```

### Log Analysis
```powershell
# View recent logs
Get-Content "C:\ProgramData\IntuneDeviceRenamer\logs\latest.log" -Tail 50

# Search for errors
Select-String -Path "C:\ProgramData\IntuneDeviceRenamer\logs\*.log" -Pattern "ERROR"
```

## 📖 Documentation

Detailed documentation is available in the `docs/` directory:
- **DynamicDeviceRenaminginIntune-EnhancedVersionv2.0** - Technical documentation
- **DynamicDeviceRenaminginIntuneUsingGroupTagsandPowerShell-EnhancedVersionv2.0** - Implementation guide

## 🤝 Contributing

This project builds upon the original work by AliAlame from CYBERSYSTEM. Contributions and improvements are welcome.

### Original Author
- **AliAlame** - CYBERSYSTEM (https://www.cybersystem.ca)

### Enhanced Version
- **Philipp Schmidt** - Farpoint Technologies

## 📄 License

This project is licensed under the terms specified in the LICENSE file.

## 🆘 Support

For technical support and questions:
1. Check the troubleshooting section above
2. Review the detailed documentation in the `docs/` directory
3. Examine log files for specific error messages
4. Verify Azure AD permissions and RBAC roles

## 🔄 Version History

### v2.0 (Current)
- Enhanced UI with colorful interface
- Multiple authentication options
- Teams integration capabilities
- Comprehensive logging system
- Improved error handling
- RBAC role validation

### v1.0 (Original)
- Basic device renaming functionality
- Single authentication method
- Minimal logging
- Original concept by AliAlame - CYBERSYSTEM

