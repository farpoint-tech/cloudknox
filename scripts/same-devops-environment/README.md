# Same DevOps Environment

## Description

PowerShell script for standardising and setting up development environments on new Windows devices. This solution ensures consistent environments by automating the installation of applications, PowerShell modules, VS Code extensions and PowerShell profile configuration.

## Features

### Application Installation
- **winget-based**: Installs Git, PowerShell 7 and VS Code via winget
- **Update check**: Checks all configured apps for available updates before installing
- **Already-installed detection**: Skips already installed applications gracefully

### PowerShell Module Management
- **Gallery comparison**: Fetches latest versions from PowerShell Gallery before processing
- **Smart analysis**: Separates modules into "to install", "to update" and "up to date"
- **Automatic update**: Updates outdated modules; falls back to reinstall if needed

### VS Code Extensions
- **10 extensions**: Installs a curated set of extensions for PowerShell and Azure development
- **Skip if installed**: Only installs missing extensions

### PowerShell Profile Setup
- **Multi-profile**: Configures Windows PS 5.1, PS 7+ and VS Code profiles
- **Backup**: Creates timestamped backup of existing profiles before overwriting
- **Syntax validation**: Validates the created profile using `[scriptblock]::Create()`
- **Platform detection**: Handles Windows, Parallels VM (Mac) and Unix paths correctly

### Custom Profile Functions

| Function | Description |
|----------|-------------|
| `Get-PublicIP` | Returns the public IP address |
| `Get-UTCTime` | Returns the current UTC time |
| `Find-TenantID` | Finds tenant ID for a given domain |
| `Get-RandomPassword` | Generates a random password |
| Custom prompt | Shows timestamp in the PS prompt |

## Prerequisites

- Windows 10/11
- PowerShell 5.1 or higher
- winget (App Installer from Microsoft Store)
- Administrator privileges (recommended for system-wide installs)

## Usage

```powershell
# Run the setup script
.\sameDevOpsEnvironment.ps1
```

The script runs through 5 steps automatically:
1. Check dependencies and upgrade existing apps
2. Install applications via winget
3. Install / update PowerShell modules
4. Install VS Code extensions
5. Configure PowerShell profiles

## Installed Applications

| Application | winget ID |
|-------------|-----------|
| Git | `Git.Git` |
| PowerShell 7 | `Microsoft.PowerShell` |
| VS Code | `Microsoft.VisualStudioCode` |

## PowerShell Modules

| Module | Purpose |
|--------|---------|
| Az | Azure PowerShell |
| ExchangeOnlineManagement | Exchange Online |
| M365Permissions | Microsoft 365 Permissions |
| Microsoft.Graph | Microsoft Graph SDK |
| Microsoft.Graph.Entra | Entra ID Extensions |
| Microsoft.Graph.Beta | Graph Beta Endpoints |
| PNP.PowerShell | SharePoint / PNP |
| Wintuner | Intune App Packaging |
| ZeroTrustAssessment | Zero Trust Assessment |

## VS Code Extensions

| Extension | Description |
|-----------|-------------|
| `github.copilot` | GitHub Copilot |
| `ms-vsliveshare.vsliveshare` | Live Share |
| `ms-vscode.powershell` | PowerShell Extension |
| `gruntfuggly.todo-tree` | TODO Tree |
| `mechatroner.rainbow-csv` | Rainbow CSV |
| `azemoh.one-monokai` | One Monokai Theme |
| `ms-azuretools.vscode-bicep` | Bicep Extension |
| `microsoft-dciborow.align-bicep` | Align Bicep |
| `eamodio.gitlens` | GitLens |
| `shd101wyy.markdown-preview-enhanced` | Markdown Preview Enhanced |

## Platform Support

| Platform | Support |
|----------|---------|
| Windows 10/11 | Full |
| PowerShell 5.1 | Full |
| PowerShell 7.x | Full |
| Parallels VM (Mac) | Full |
| macOS/Linux | Partial (PS 7+ profiles only) |

## Customisation

Edit the configuration arrays at the top of the script to adjust what gets installed:

```powershell
# Add or remove winget apps
$installApps = @{
    "Git.Git"                    = "Git"
    "Microsoft.PowerShell"       = "PowerShell 7"
    "Microsoft.VisualStudioCode" = "VS Code"
}

# Add or remove PS modules
$RequiredModules = @(
    "Az",
    "Microsoft.Graph",
    ...
)

# Add or remove VS Code extensions
$VSCodeExtensions = @(
    "github.copilot",
    ...
)
```

## Authors

**Script:** Roy Klooster - RKSolutions
**Repository:** Philipp Schmidt - Farpoint Technologies

## Version

1.3 - Language consistency update (fully English)
