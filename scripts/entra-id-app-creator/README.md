# Entra ID App Creator

## Description

Automated PowerShell solution for creating app registrations and enterprise apps in Microsoft Entra ID (formerly Azure AD). This script simplifies the complex process of app creation, automatically configures API permissions, client secrets and service principals. Supports both interactive and fully automated (non-interactive) execution via CLI parameters.

## Features

### Automated App Creation
- **App registration**: Automatic creation of new app registrations
- **Enterprise app**: Automatic creation of the associated service principal
- **Client secret**: Generation of secure client secrets with configurable validity (1–2 years)
- **API permissions**: Interactive configuration of Microsoft Graph permissions

### CLI Parameters & Automation
- **Fully parameterised**: Can be run non-interactively for CI/CD pipelines
- **Parameters**: `-TenantId`, `-AppName`, `-OwnerName`, `-SecretValidityYears`, `-SaveToFile`, `-OutputPath`

### Security
- **No automatic plaintext export**: Client secret is only displayed in the console
- **File export requires explicit confirmation**: `-SaveToFile` flag or interactive approval required
- **ACL restriction**: If file export is enabled, file permissions are restricted to the current user
- **Rollback on failure**: If a step fails after app creation, the app is automatically deleted

### Output & Documentation
- **Copy-ready results**: Structured output of all important information
- **Authentication examples**: Ready-to-use code examples for Azure CLI, PowerShell and Microsoft Graph
- **Troubleshooting hints**: Guidance for common issues

## Prerequisites

### PowerShell and Modules
- PowerShell 5.1 or higher
- Microsoft Graph PowerShell SDK (installed automatically if missing)
- Internet connection to Microsoft Entra ID

### Permissions
- **Global Administrator** or **Application Administrator** in Entra ID
- Permission to create app registrations
- Permission to manage enterprise apps

### Required Graph Permissions
- `Application.ReadWrite.All`
- `Directory.ReadWrite.All`

## Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `-TenantId` | String | Tenant ID or tenant name (e.g. contoso.onmicrosoft.com) | Interactive prompt |
| `-AppName` | String | Name of the app registration | Interactive prompt |
| `-OwnerName` | String | Owner name (stored in app notes) | `$env:USERNAME` |
| `-SecretValidityYears` | Int (1–2) | Client secret validity in years | `1` |
| `-SaveToFile` | Switch | Export app details incl. secret to a file | No |
| `-OutputPath` | String | Output directory for file export | `.` (current directory) |

## Usage

```powershell
# Fully interactive mode
.\Create-EntraIDApp.ps1

# Non-interactive with parameters
.\Create-EntraIDApp.ps1 -TenantId "contoso.onmicrosoft.com" -AppName "MyTool" -SecretValidityYears 2

# With file export
.\Create-EntraIDApp.ps1 -TenantId "contoso.onmicrosoft.com" -AppName "MyTool" -SaveToFile -OutputPath "C:\Secrets"
```

## Supported API Permissions

### Predefined Microsoft Graph Permissions

| # | Permission | Type | Description |
|---|-----------|------|-------------|
| 1 | User.Read | Delegated | Read user profile |
| 2 | User.ReadBasic.All | Delegated | Read basic profiles of all users |
| 3 | User.Read.All | Application | Read all user profiles |
| 4 | Directory.Read.All | Application | Read directory data |
| 5 | Directory.ReadWrite.All | Application | Read and write directory data |
| 6 | Group.Read.All | Application | Read all group profiles |
| 7 | Group.ReadWrite.All | Application | Read and write group profiles |
| 8 | Mail.Read | Application | Read emails |
| 9 | Mail.Send | Application | Send emails |
| 10 | Sites.Read.All | Application | Read all SharePoint site collections |
| 11 | Sites.ReadWrite.All | Application | Read and write all SharePoint site collections |
| 12 | Custom | Any | Enter custom API ID and permission name |

## Output Example

```
=== App Registration ===
Name:           MyTool
App (Client) ID: 12345678-1234-1234-1234-123456789012
Object ID:      87654321-4321-4321-4321-210987654321

=== Client Secret ===
Value:          abcdef123456789...
Valid until:    05.03.2027

=== Enterprise App ===
Name:           MyTool
Object ID:      11111111-2222-3333-4444-555555555555

=== Tenant Information ===
Tenant ID:      99999999-8888-7777-6666-555555555555
Tenant Name:    contoso.onmicrosoft.com
```

## Authentication Examples

### Azure CLI
```bash
az login --service-principal -u <ClientId> -p "<Secret>" --tenant <TenantId>
```

### PowerShell
```powershell
$credential = New-Object System.Management.Automation.PSCredential("<ClientId>", `
    (ConvertTo-SecureString "<Secret>" -AsPlainText -Force))
Connect-AzAccount -ServicePrincipal -Credential $credential -Tenant "<TenantId>"
```

### Microsoft Graph PowerShell
```powershell
$credential = New-Object System.Management.Automation.PSCredential("<ClientId>", `
    (ConvertTo-SecureString "<Secret>" -AsPlainText -Force))
Connect-MgGraph -ClientSecretCredential $credential -TenantId "<TenantId>"
```

## Rollback Behaviour

If any step fails **after** the app registration has been created (e.g. secret creation or service principal creation fails), the script automatically deletes the app registration via `Remove-MgApplication` to prevent orphaned entries.

## Security Notes

- Client secrets can only be viewed once – note the value immediately
- Store secrets securely (Azure Key Vault, password manager)
- Rotate secrets regularly (recommended: max. 1 year validity)
- Assign only the minimum required permissions
- Monitor app usage regularly and remove unused apps

## Troubleshooting

### Authentication error
```
Error during login: Insufficient privileges to complete the operation
```
**Solution**: Ensure you have Global Administrator or Application Administrator rights.

### Module installation failed
```
Install-Module: Access denied
```
**Solution**: Run PowerShell as administrator or use `-Scope CurrentUser`.

### Permission not found
```
Warning: Permission 'CustomPermission.Read' not found.
```
**Solution**: Check the spelling of the custom permission name.

### Service principal creation delayed
```
Warning: Enterprise app could not be verified. It may still be processing.
```
**Solution**: This is normal. The enterprise app is created asynchronously and will be available after a few minutes.

## Author

Philipp Schmidt - Farpoint Technologies

## Version

2.0 - Added CLI parameters, rollback, improved secret security, code refactoring
