# Enhanced LAPS Diagnostic Script for Windows Devices

## Description

Comprehensive diagnostic solution for Local Administrator Password Solution (LAPS) on Windows devices. This PowerShell script provides extensive diagnostic and monitoring capabilities for LAPS implementations in Microsoft Intune-managed environments, including automated repair options and alerting.

## Features

### Comprehensive LAPS Diagnostics
- **Configuration check**: Verify LAPS configuration (Registry, CSP settings)
- **Password status**: Check current password status and last rotation date
- **Policy validation**: Verify applied LAPS policies (Legacy LAPS & Windows LAPS)
- **Event log analysis**: Evaluate LAPS-related events in the Windows Event Log

### Detailed Reporting
- **HTML reports**: Generate detailed visual diagnostic reports
- **CSV export**: Export diagnostic data for further analysis
- **Dashboard view**: Clear overview of LAPS status
- **Trend analysis**: Historical data evaluation

### Automated Repair
- **Configuration error correction**: Automatic fix for common issues
- **Policy re-application**: Re-apply LAPS policies
- **Service restart**: Restart relevant services when needed
- **Registry repair**: Correct registry settings

### Monitoring and Alerting
- **Proactive monitoring**: Continuous LAPS status monitoring
- **Email notifications**: Automatic alerts for issues
- **Teams integration**: Microsoft Teams alerts via webhook
- **Threshold monitoring**: Configurable monitoring thresholds

## Prerequisites

- Windows 10/11 or Windows Server 2016+
- PowerShell 5.1 or higher
- LAPS installed and configured (Legacy LAPS or Windows LAPS)
- Local administrator rights
- Microsoft Graph PowerShell SDK (for Intune integration, optional)

## Usage

```powershell
# Full LAPS diagnostic
.\"Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1"

# Configuration check only
.\"Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1" -ConfigOnly

# With HTML report
.\"Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1" -GenerateReport

# With automatic repair
.\"Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1" -AutoRepair

# With email alert
.\"Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1" -EmailAlert -SMTPServer "smtp.company.com"

# Continuous monitoring
.\"Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1" -Monitor -Interval 300
```

## Diagnostic Areas

### 1. LAPS Installation
- Verify LAPS components are installed
- Validate installation integrity
- Version check (Legacy LAPS vs. Windows LAPS)

### 2. Configuration
- Registry settings
- Group policy application
- Permissions and security settings

### 3. Password Management
- Current password status
- Password rotation history
- Expiry times and policies

### 4. Event Logs
- LAPS-specific events
- Error and warning messages
- Audit logs

### 5. Network Connectivity
- Domain controller reachability
- LDAP connections
- DNS resolution

## Output Formats

### HTML Report
- Interactive dashboard view
- Graphical display of results
- Drill-down functionality
- Export options

### CSV Export
- Structured data output
- Compatible with Excel and other tools
- Historical data collection
- Trend analysis support

### Console Output
- Real-time diagnostic results
- Colour-coded status display
- Progress indicators
- Detailed error messages

## Automation

### Scheduled Execution
```powershell
# Windows Task Scheduler
schtasks /create /tn "LAPS Diagnostic" /tr "powershell.exe -File 'C:\Scripts\Enhanced LAPS-Diagnoseskript.ps1'" /sc daily /st 09:00
```

### Intune Integration
- Deploy as an Intune PowerShell script
- Compliance policy integration
- Automatic reporting to Intune

## Troubleshooting

### Common Issues
1. **LAPS not installed**: Automatic installation check
2. **Configuration errors**: Guided repair functions
3. **Permission issues**: Elevated rights check
4. **Network issues**: Connectivity tests

### Debug Mode
```powershell
.\"Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1" -Debug -Verbose
```

## Security Notes

- Script requires administrator rights
- Sensitive data is not stored in logs
- Secure transmission of diagnostic data
- Compliant with data protection regulations

## Author

Philipp Schmidt - Farpoint Technologies

## Version

1.0 - Initial release of the enhanced LAPS diagnostic solution
