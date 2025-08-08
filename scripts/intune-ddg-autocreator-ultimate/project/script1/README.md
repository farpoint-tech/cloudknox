# Script1: Primary DDG AutoCreator

## Overview
This directory contains the main Intune Dynamic Device Group AutoCreator Ultimate script.

## Files
- `Intune-DDG-AutoCreator-Ultimate.ps1` - Main PowerShell script

## Usage

### Basic Usage
```powershell
# Navigate to script1 directory
cd script1

# Run with default configuration
.\Intune-DDG-AutoCreator-Ultimate.ps1 -ConfigPath "..\shared-config\config-ultimate.json"
```

### Advanced Usage Examples

#### Interactive Mode with GridView
```powershell
.\Intune-DDG-AutoCreator-Ultimate.ps1 -Interactive -ConfigPath "..\shared-config\config-ultimate.json"
```

#### Dry Run Mode (Preview Only)
```powershell
.\Intune-DDG-AutoCreator-Ultimate.ps1 -DryRun -ConfigPath "..\shared-config\config-ultimate.json"
```

#### Parallel Processing
```powershell
.\Intune-DDG-AutoCreator-Ultimate.ps1 -Parallel -MaxParallelJobs 8 -ConfigPath "..\shared-config\config-ultimate.json"
```

#### Custom Input File
```powershell
.\Intune-DDG-AutoCreator-Ultimate.ps1 -InputFilePath "C:\temp\ou-list.csv" -InputFormat CSV -ConfigPath "..\shared-config\config-ultimate.json"
```

## Dependencies
- Shared modules from `../shared-modules/`
- Configuration from `../shared-config/config-ultimate.json`
- Microsoft Graph PowerShell SDK

## Module Import
The script automatically imports required modules:
```powershell
Import-Module "..\shared-modules\AuthenticationModule.psm1" -Force
Import-Module "..\shared-modules\TeamsIntegrationModule.psm1" -Force
```

