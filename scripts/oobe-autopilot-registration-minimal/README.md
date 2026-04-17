# OOBE Autopilot Registration - Minimal Version

## Description

Minimal version of the OOBE (Out-of-Box Experience) Autopilot registration script for Microsoft Intune. This lightweight solution enables quick and simple registration of devices in the Windows Autopilot programme during the initial setup process.

## Features

### Fast Registration
- **Minimal overhead**: Lightweight implementation for maximum performance
- **OOBE integration**: Seamless integration into the Windows setup process
- **Automatic detection**: Automatic capture of the device hardware ID
- **Direct registration**: Data sent directly to the Autopilot service

### Simple Configuration
- **Few parameters**: Minimal configuration requirements
- **Plug-and-play**: Ready to use with minimal adjustment
- **Sensible defaults**: Reasonable default configuration
- **Error tolerance**: Robust error handling

### Basic Logging
- **Essential logging**: Important events are recorded
- **Compact logs**: Minimal storage usage
- **Error logging**: Detailed error messages
- **Status tracking**: Registration status tracking

## Prerequisites

- Windows 10/11 (Version 1903 or higher)
- PowerShell 5.1 or higher
- Internet connection to Autopilot service
- Azure AD permissions:
  - `DeviceManagementServiceConfig.ReadWrite.All`
  - `Device.ReadWrite.All`

## Parameters

| Parameter | Description |
|-----------|-------------|
| `-GroupTag` | Optional – Group tag for the Autopilot device |
| `-TenantId` | Optional – Azure AD tenant ID |
| `-Silent` | Optional – Silent execution without user interaction |
| `-LogPath` | Optional – Path for log files |

## Usage

```powershell
# Simple registration
.\"OOBE Autopilot Registration - Minimal Version.ps1"

# With group tag
.\"OOBE Autopilot Registration - Minimal Version.ps1" -GroupTag "IT-Department"

# With tenant ID
.\"OOBE Autopilot Registration - Minimal Version.ps1" -TenantId "your-tenant-id"

# Silent execution during OOBE (as administrator)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force
.\"OOBE Autopilot Registration - Minimal Version.ps1" -Silent

# Silent with log path
.\"OOBE Autopilot Registration - Minimal Version.ps1" -Silent -LogPath "C:\Temp\Autopilot.log"
```

## How It Works

1. **Hardware ID capture**: Automatically captures the device hardware ID (PKID + hash)
2. **Autopilot registration**: Sends device data directly to the Microsoft Autopilot service
3. **Status feedback**: Displays registration status and logs important events

## Deployment Options

### USB Drive
- Copy script to USB drive
- Run from USB during OOBE
- Automatic registration

### Network Share
- Place script on a network share
- Run via UNC path during OOBE
- Centralised management

### Cloud Download
- Download script from cloud storage
- Run immediately after download
- Always uses the latest version

### Intune Deployment
- Deploy as a PowerShell script in Intune
- Execute during Autopilot process
- Automatic device registration

## Comparison: Minimal vs. Full Version

| Feature | Minimal | Full |
|---------|---------|------|
| Basic registration | ✅ | ✅ |
| Group tag support | ✅ | ✅ |
| Simple configuration | ✅ | ✅ |
| Minimal overhead | ✅ | ❌ |
| Enhanced UI | ❌ | ✅ |
| Teams notifications | ❌ | ✅ |
| Detailed reports | ❌ | ✅ |
| Batch processing | ❌ | ✅ |
| Email notifications | ❌ | ✅ |

## Troubleshooting

| Issue | Solution |
|-------|---------|
| No internet connection | Check Wi-Fi/Ethernet connection |
| Permission error | Validate Azure AD permissions |
| Hardware ID error | Run as administrator |
| Timeout issues | Check network connection stability |

```powershell
# Enable extended logging
.\"OOBE Autopilot Registration - Minimal Version.ps1" -Verbose -Debug
```

## Security Notes

- Script requires administrator rights
- Secure transmission of device data
- No storage of sensitive information
- Compliant with data protection regulations

## Author

Philipp Schmidt - Farpoint Technologies

## Version

1.0 - Minimal version for fast OOBE registration
