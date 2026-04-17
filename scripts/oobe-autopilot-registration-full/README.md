# OOBE Autopilot Registration - Full Version

## Description

Full and extended version of the OOBE (Out-of-Box Experience) Autopilot registration script for Microsoft Intune. This comprehensive solution offers advanced features, detailed logging and a user-friendly interface for professional Autopilot device registration in enterprise environments.

## Features

### Enhanced User Interface
- **Graphical interface**: User-friendly GUI for easy operation
- **Progress indicators**: Visual display of registration progress
- **Interactive dialogs**: User-guided configuration
- **Multi-language support**: Localisation for different languages

### Comprehensive Configuration
- **Advanced parameters**: Detailed configuration options
- **Profile management**: Multiple registration profiles
- **Batch processing**: Mass registration of multiple devices
- **Template system**: Predefined configuration templates

### Detailed Logging
- **Comprehensive logging**: Detailed recording of all actions
- **HTML reports**: Generation of professional reports
- **Export functions**: CSV/JSON export for further analysis
- **Audit trail**: Complete traceability

### Notifications and Integration
- **Email notifications**: Automatic status emails
- **Teams integration**: Notifications via Microsoft Teams
- **SIEM integration**: Integration into Security Information Systems
- **Webhook support**: Customisable webhook notifications

### Advanced Functions
- **Offline mode**: Registration without internet connection
- **Retry mechanism**: Automatic retry on errors
- **Validation**: Comprehensive data validation
- **Rollback functions**: Undo registrations

## Prerequisites

- Windows 10/11 (Version 1903 or higher)
- PowerShell 5.1 or higher
- .NET Framework 4.7.2 or higher (for GUI)
- Internet connection for Autopilot service
- Extended Azure AD permissions:
  - `DeviceManagementServiceConfig.ReadWrite.All`
  - `Device.ReadWrite.All`
  - `Directory.Read.All`
  - `User.Read.All`

## Usage

### GUI Mode (Recommended)
```powershell
# Launch graphical user interface
.\"OOBE Autopilot Registration.ps1" -GUI

# With predefined profile
.\"OOBE Autopilot Registration.ps1" -GUI -Profile "Corporate"
```

### Command Line Mode
```powershell
# Extended registration
.\"OOBE Autopilot Registration.ps1" -GroupTag "IT-Department" -AssignedUser "user@company.com"

# Batch registration
.\"OOBE Autopilot Registration.ps1" -BatchFile "C:\Devices.csv" -Profile "BulkRegistration"

# With email notification
.\"OOBE Autopilot Registration.ps1" -EmailNotification -SMTPServer "smtp.company.com"
```

### Automated Mode
```powershell
# Fully automated registration
.\"OOBE Autopilot Registration.ps1" -Automated -ConfigFile "C:\AutopilotConfig.json"
```

## Parameters

### Basic Parameters
| Parameter | Description |
|-----------|-------------|
| `-GUI` | Launch the graphical user interface |
| `-GroupTag` | Group tag for the Autopilot device |
| `-AssignedUser` | Assigned user (UPN) |
| `-Profile` | Use registration profile |
| `-TenantId` | Azure AD tenant ID |

### Advanced Parameters
| Parameter | Description |
|-----------|-------------|
| `-BatchFile` | CSV file for batch registration |
| `-ConfigFile` | JSON configuration file |
| `-EmailNotification` | Enable email notifications |
| `-TeamsWebhook` | Teams webhook for notifications |
| `-ReportPath` | Path for reports and logs |
| `-Offline` | Enable offline mode |

### Batch Parameters
| Parameter | Description |
|-----------|-------------|
| `-MaxRetries` | Maximum number of retry attempts |
| `-RetryDelay` | Delay between retries |
| `-ParallelProcessing` | Enable parallel processing |
| `-ValidationOnly` | Validation only, no registration |

## Configuration Files

### AutopilotConfig.json
```json
{
  "DefaultSettings": {
    "GroupTag": "Corporate-Devices",
    "OrderIdentifier": "PO-2024-001",
    "PurchaseOrderIdentifier": "12345"
  },
  "Notifications": {
    "Email": {
      "Enabled": true,
      "SMTPServer": "smtp.company.com",
      "Recipients": ["admin@company.com"]
    },
    "Teams": {
      "Enabled": true,
      "WebhookURL": "https://outlook.office.com/webhook/..."
    }
  },
  "Logging": {
    "Level": "Detailed",
    "RetentionDays": 30,
    "ExportFormat": "JSON"
  }
}
```

### Devices.csv (Batch Registration)
```csv
SerialNumber,GroupTag,AssignedUser,OrderIdentifier
ABC123456,IT-Department,john.doe@company.com,PO-2024-001
DEF789012,HR-Department,jane.smith@company.com,PO-2024-002
```

## Reporting

### HTML Reports
- Executive summary for management
- Detailed technical report
- Error analysis
- Trend analysis

### Export Options
- CSV export: Structured data output
- JSON export: Machine-readable data
- PDF reports: Professional documentation
- Excel compatibility

## Troubleshooting

```powershell
# Full diagnostics
.\"OOBE Autopilot Registration.ps1" -Diagnose -Verbose

# Network diagnostics
.\"OOBE Autopilot Registration.ps1" -NetworkDiagnose

# Permission check
.\"OOBE Autopilot Registration.ps1" -CheckPermissions

# Rollback a registration
.\"OOBE Autopilot Registration.ps1" -Rollback -DeviceId "12345"
```

### Common Issues

| Issue | Solution |
|-------|---------|
| GUI does not start | Check .NET Framework version |
| Batch import failed | Validate CSV format |
| Email sending fails | Check SMTP configuration |
| Teams notifications missing | Validate webhook URL |

## Security and Compliance

- **Encrypted data transmission**: TLS 1.2+ for all connections
- **Credential protection**: Secure storage of credentials
- **Audit logging**: Complete logging of all actions
- **Access control**: Role-based permissions
- **GDPR compliant**: Data-protection-compliant data processing

## Author

Philipp Schmidt - Farpoint Technologies

## Version

2.0 - Full version with extended GUI and enterprise features
