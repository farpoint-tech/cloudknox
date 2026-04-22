<#
.SYNOPSIS
    Automatically creates an app registration and enterprise app in Microsoft Entra ID.

.DESCRIPTION
    This script automates the process of creating an app registration and the associated
    enterprise app (service principal) in Microsoft Entra ID. It enables configuration of
    API permissions and generates a client secret for authentication.

    Can be run fully interactively OR via parameters (non-interactive/automated).

    Rollback: If a step fails after app creation, the already-created app is automatically
    deleted to avoid orphaned entries.

    Secret security: The client secret is ONLY displayed in the console. A file export
    requires explicit consent (-SaveToFile or interactive confirmation).

.PARAMETER TenantId
    Tenant ID or tenant name (e.g. contoso.onmicrosoft.com). If not provided: interactive prompt.

.PARAMETER AppName
    Name of the app registration. If not provided: interactive prompt.

.PARAMETER OwnerName
    Name of the author/owner (stored in app notes). Default: current username.

.PARAMETER SecretValidityYears
    Validity period of the client secret in years. Default: 1.

.PARAMETER SaveToFile
    If specified: exports the app details (including secret) to a text file.
    SECURITY NOTE: File contains the secret in plaintext – store securely!

.PARAMETER OutputPath
    Path for the file export (only relevant with -SaveToFile). Default: current directory.

.EXAMPLE
    .\Create-EntraIDApp.ps1
    Fully interactive mode.

.EXAMPLE
    .\Create-EntraIDApp.ps1 -TenantId "contoso.onmicrosoft.com" -AppName "MyTool" -SecretValidityYears 2
    Creates the app non-interactively with predefined values (permissions are still configured interactively).

.EXAMPLE
    .\Create-EntraIDApp.ps1 -TenantId "contoso.onmicrosoft.com" -AppName "MyTool" -SaveToFile
    Creates the app and exports details to a file.

.NOTES
    Required permissions:
    - Global Administrator or Application Administrator in Entra ID
    - The Microsoft Graph PowerShell modules must be installed or will be installed automatically.

    The generated client secret should be stored securely, as it cannot be retrieved
    after the first display.

    Version: 2.0
    Updated: 2026-04-17 - Full English translation
#>

param(
    [Parameter(HelpMessage="Tenant ID or tenant name (e.g. contoso.onmicrosoft.com)")]
    [string]$TenantId,

    [Parameter(HelpMessage="Name of the app registration")]
    [string]$AppName,

    [Parameter(HelpMessage="Name of the owner (stored in app notes)")]
    [string]$OwnerName = $env:USERNAME,

    [Parameter(HelpMessage="Validity period of the client secret in years")]
    [ValidateRange(1, 2)]
    [int]$SecretValidityYears = 1,

    [Parameter(HelpMessage="Export app details including secret to file (SECURITY NOTE)")]
    [switch]$SaveToFile,

    [Parameter(HelpMessage="Output path for file export (default: current directory)")]
    [string]$OutputPath = "."
)

# ===== HELPER FUNCTION: ADD GRAPH PERMISSION =====
function Add-GraphPermissionToApp {
    param(
        [string]$AppObjectId,
        [string]$ApiId,
        [string]$PermissionName,
        [ValidateSet("Application", "Delegated")]
        [string]$PermType,
        [array]$CurrentAccess
    )

    $sp = Get-MgServicePrincipal -Filter "appId eq '$ApiId'"

    if ($PermType -eq "Application") {
        $role = $sp.AppRoles | Where-Object { $_.Value -eq $PermissionName }
        if (-not $role) {
            Write-Host "   Warning: Permission '$PermissionName' not found." -ForegroundColor Yellow
            return $CurrentAccess
        }
        $accessType = "Role"
        $permId     = $role.Id
    } else {
        $scope = $sp.OAuth2PermissionScopes | Where-Object { $_.Value -eq $PermissionName }
        if (-not $scope) {
            Write-Host "   Warning: Permission '$PermissionName' not found." -ForegroundColor Yellow
            return $CurrentAccess
        }
        $accessType = "Scope"
        $permId     = $scope.Id
    }

    # Check if API is already in the list
    $existingApi = $CurrentAccess | Where-Object { $_.ResourceAppId -eq $ApiId }
    if ($existingApi) {
        $alreadyAdded = $existingApi.ResourceAccess | Where-Object { $_.Id -eq $permId }
        if (-not $alreadyAdded) {
            $existingApi.ResourceAccess += @{ Id = $permId; Type = $accessType }
        }
    } else {
        $CurrentAccess += @{
            ResourceAppId  = $ApiId
            ResourceAccess = @(@{ Id = $permId; Type = $accessType })
        }
    }

    Update-MgApplication -ApplicationId $AppObjectId -RequiredResourceAccess $CurrentAccess
    Write-Host "   ✓ Permission added: $PermissionName ($PermType)" -ForegroundColor Green
    return $CurrentAccess
}

# ===== CHECK / INSTALL MODULES =====
if (-not (Get-Module -ListAvailable -Name Microsoft.Graph)) {
    Write-Host "Installing Microsoft Graph PowerShell module..." -ForegroundColor Yellow
    Install-Module -Name Microsoft.Graph -Scope CurrentUser -Force
}

Import-Module Microsoft.Graph.Authentication
Import-Module Microsoft.Graph.Applications

# ===== BANNER =====
Write-Host @"
========================================================================
  Microsoft Entra ID - App Registration and Enterprise App Creation
========================================================================

This script automatically creates:
- A new app registration in Entra ID
- A client secret with the desired validity period
- An enterprise app (service principal)
- Configured API permissions per your requirements

At the end you will receive all the information needed for authentication:
- Tenant ID
- App (Client) ID
- Client Secret

Prerequisites:
- You need Global Administrator or Application Administrator rights
- An active internet connection to Microsoft Entra ID

"@ -ForegroundColor Cyan

# ===== INPUTS (interactive if parameters are missing) =====
if (-not $TenantId) {
    $TenantId = Read-Host "Please enter the Tenant ID or tenant name (e.g. contoso.onmicrosoft.com)"
}

# Establish connection
Write-Host "`nPlease sign in with an account that has sufficient permissions (Global Admin or App Administrator)." -ForegroundColor Cyan
try {
    Connect-MgGraph -TenantId $TenantId -Scopes "Application.ReadWrite.All", "Directory.ReadWrite.All"

    $context = Get-MgContext
    if ($null -eq $context) { throw "Sign-in failed." }

    Write-Host "Successfully signed in as: $($context.Account)" -ForegroundColor Green
    Write-Host "Connected to tenant: $($context.TenantId)`n" -ForegroundColor Green
}
catch {
    Write-Host "Error during sign-in: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Please make sure you are using the correct credentials and have sufficient permissions." -ForegroundColor Yellow
    exit 1
}

# Request app details (if not passed via parameter)
if (-not $AppName) {
    Write-Host "Please enter the details for the new app:" -ForegroundColor Cyan
    $AppName = Read-Host "App name (used for both app registration and enterprise app)"
}

if ($PSBoundParameters.ContainsKey('OwnerName') -eq $false -and $OwnerName -eq $env:USERNAME) {
    $inputOwner = Read-Host "Author/owner name [Default: $OwnerName]"
    if (-not [string]::IsNullOrWhiteSpace($inputOwner)) { $OwnerName = $inputOwner }
}

if (-not $PSBoundParameters.ContainsKey('SecretValidityYears')) {
    $inputYears = Read-Host "Client secret validity in years (1-2) [Default: 1]"
    if ($inputYears -match '^[12]$') { $SecretValidityYears = [int]$inputYears }
}

# Configure permissions
$configurePermissions = Read-Host "Would you like to configure API permissions for the app? (Y/N) [Default: N]"
$permissions = @()

if ($configurePermissions -eq "Y" -or $configurePermissions -eq "y") {
    Write-Host "`n=== Configure API Permissions ===" -ForegroundColor Cyan

    Write-Host @"

Commonly used Microsoft Graph permissions:
------------------------------------------
 1. User.Read              - Read user profile (Delegated)
 2. User.ReadBasic.All     - Read basic profiles of all users (Delegated)
 3. User.Read.All          - Read all user profiles (Application)
 4. Directory.Read.All     - Read directory data (Application)
 5. Directory.ReadWrite.All- Read and write directory data (Application)
 6. Group.Read.All         - Read all group profiles (Application)
 7. Group.ReadWrite.All    - Read and write group profiles (Application)
 8. Mail.Read              - Read emails (Application)
 9. Mail.Send              - Send emails (Application)
10. Sites.Read.All         - Read all SharePoint site collections (Application)
11. Sites.ReadWrite.All    - Read and write all SharePoint site collections (Application)

Custom permission:
------------------
12. Enter a custom permission

"@ -ForegroundColor White

    $done = $false
    while (-not $done) {
        Write-Host "`nEnter a number or 'done' to finish:" -ForegroundColor Yellow
        $choice = Read-Host "Selection"

        if ($choice -eq "done") {
            $done = $true
        } elseif ($choice -eq "12") {
            $apiId          = Read-Host "API ID (e.g. 00000003-0000-0000-c000-000000000000 for Microsoft Graph)"
            $permissionName = Read-Host "Permission name (e.g. User.Read)"
            $permissionType = Read-Host "Permission type (Application or Delegated)"

            $permissions += @{ ApiId = $apiId; PermissionName = $permissionName; Type = $permissionType }
            Write-Host "Custom permission added: $permissionName ($permissionType)" -ForegroundColor Green
        } elseif ($choice -in 1..11) {
            $permissionMap = @{
                1  = @{ Name = "User.Read";               Type = "Delegated" }
                2  = @{ Name = "User.ReadBasic.All";      Type = "Delegated" }
                3  = @{ Name = "User.Read.All";           Type = "Application" }
                4  = @{ Name = "Directory.Read.All";      Type = "Application" }
                5  = @{ Name = "Directory.ReadWrite.All"; Type = "Application" }
                6  = @{ Name = "Group.Read.All";          Type = "Application" }
                7  = @{ Name = "Group.ReadWrite.All";     Type = "Application" }
                8  = @{ Name = "Mail.Read";               Type = "Application" }
                9  = @{ Name = "Mail.Send";               Type = "Application" }
                10 = @{ Name = "Sites.Read.All";          Type = "Application" }
                11 = @{ Name = "Sites.ReadWrite.All";     Type = "Application" }
            }
            $sel = $permissionMap[[int]$choice]
            $permissions += @{ ApiId = "00000003-0000-0000-c000-000000000000"; PermissionName = $sel.Name; Type = $sel.Type }
            Write-Host "Permission added: $($sel.Name) ($($sel.Type))" -ForegroundColor Green
        } else {
            Write-Host "Invalid selection. Please enter 1-12 or 'done'." -ForegroundColor Red
        }
    }
}

# ===== CREATION PROCESS WITH ROLLBACK =====
$app             = $null
$secret          = $null
$servicePrincipal = $null

try {
    Write-Host "`nStarting creation process..." -ForegroundColor Cyan

    # STEP 1: Create app registration
    Write-Host "1. Creating new app registration: $AppName..." -ForegroundColor Cyan

    $appParams = @{
        DisplayName     = $AppName
        SignInAudience  = "AzureADMyOrg"
        Notes           = "Created by: $OwnerName on $(Get-Date -Format 'dd.MM.yyyy')"
    }

    $app = New-MgApplication @appParams
    Write-Host "   ✓ App registration created successfully (Object ID: $($app.Id))" -ForegroundColor Green

    # STEP 2: API permissions
    if ($permissions.Count -gt 0) {
        Write-Host "2. Configuring API permissions..." -ForegroundColor Cyan
        $currentAccess = @()
        if ($app.RequiredResourceAccess) { $currentAccess = @($app.RequiredResourceAccess) }

        foreach ($perm in $permissions) {
            try {
                $currentAccess = Add-GraphPermissionToApp `
                    -AppObjectId   $app.Id `
                    -ApiId         $perm.ApiId `
                    -PermissionName $perm.PermissionName `
                    -PermType      $perm.Type `
                    -CurrentAccess $currentAccess
            } catch {
                Write-Host "   Warning: Permission $($perm.PermissionName) could not be set: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }

    # STEP 3: Create client secret
    Write-Host "3. Generating client secret ($SecretValidityYears year(s))..." -ForegroundColor Cyan
    $endDate = (Get-Date).AddYears($SecretValidityYears)

    $secret = Add-MgApplicationPassword -ApplicationId $app.Id -PasswordCredential @{
        displayName = "Auto-generated secret"
        endDateTime = $endDate
    }
    Write-Host "   ✓ Client secret created (valid until: $($endDate.ToString('dd.MM.yyyy')))" -ForegroundColor Green

    # STEP 4: Create service principal
    Write-Host "4. Creating enterprise app (service principal)..." -ForegroundColor Cyan
    $servicePrincipal = New-MgServicePrincipal -AppId $app.AppId

    Write-Host "   Waiting for service principal creation to complete..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10

    $checkSP = Get-MgServicePrincipal -Filter "appId eq '$($app.AppId)'"
    if ($null -eq $checkSP) {
        Start-Sleep -Seconds 10
        $checkSP = Get-MgServicePrincipal -Filter "appId eq '$($app.AppId)'"
    }

    if ($null -ne $checkSP) {
        Write-Host "   ✓ Enterprise app created (Object ID: $($checkSP.Id))" -ForegroundColor Green
    } else {
        Write-Host "   Warning: Enterprise app could not be verified (may still be processing)." -ForegroundColor Yellow
    }

    # ===== DISPLAY RESULTS =====
    Write-Host @"

========================================================================
                   CREATION PROCESS COMPLETED
========================================================================

"@ -ForegroundColor Green

    Write-Host @"
### COPY AREA - APP DETAILS ###

=== App Registration ===
Name:            $AppName
App (Client) ID: $($app.AppId)
Object ID:       $($app.Id)

=== Client Secret ===
Value:           $($secret.SecretText)
Valid until:     $($endDate.ToString('dd.MM.yyyy'))

=== Enterprise App ===
Name:            $AppName
Object ID:       $(if ($null -ne $checkSP) { $checkSP.Id } else { "Not verified" })

=== Tenant Information ===
Tenant ID:       $($context.TenantId)
Tenant Name:     $($context.TenantDomain)

### AUTHENTICATION EXAMPLES ###

# Azure CLI
az login --service-principal -u $($app.AppId) -p "$($secret.SecretText)" --tenant $($context.TenantId)

# PowerShell
`$credential = New-Object System.Management.Automation.PSCredential("$($app.AppId)", (ConvertTo-SecureString "$($secret.SecretText)" -AsPlainText -Force))
Connect-AzAccount -ServicePrincipal -Credential `$credential -Tenant "$($context.TenantId)"

# Microsoft Graph PowerShell
Connect-MgGraph -ClientId "$($app.AppId)" -TenantId "$($context.TenantId)" -ClientSecretCredential (New-Object System.Management.Automation.PSCredential("$($app.AppId)", (ConvertTo-SecureString "$($secret.SecretText)" -AsPlainText -Force)))

"@ -ForegroundColor White -BackgroundColor DarkBlue

    # ===== FILE EXPORT (only with explicit consent) =====
    if (-not $SaveToFile) {
        $saveChoice = Read-Host "`n⚠️  Would you like to save the details (including secret) to a text file? The secret will be visible! (Y/N) [Default: N]"
        $SaveToFile = ($saveChoice -eq "Y" -or $saveChoice -eq "y")
    }

    if ($SaveToFile) {
        $exportPath = Join-Path $OutputPath "EntraID_App_$($AppName)_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
        try {
            $exportContent = @"
========================================================================
              MICROSOFT ENTRA ID APP DETAILS
========================================================================

⚠️  SECURITY NOTE: This file contains a client secret in plaintext.
    Please secure or delete this file according to your security policies.

=== App Registration ===
Name:            $AppName
App (Client) ID: $($app.AppId)
Object ID:       $($app.Id)
Created by:      $OwnerName
Created on:      $(Get-Date)

=== Client Secret ===
Value:           $($secret.SecretText)
Valid until:     $($endDate.ToString('dd.MM.yyyy'))

=== Enterprise App (Service Principal) ===
Name:            $AppName
Object ID:       $(if ($null -ne $checkSP) { $checkSP.Id } else { "Not verified" })

=== Tenant Information ===
Tenant ID:       $($context.TenantId)
Tenant Name:     $($context.TenantDomain)

=== Configured API Permissions ===
$(if ($permissions.Count -gt 0) {
    ($permissions | ForEach-Object { "$($_.PermissionName) ($($_.Type))" }) -join "`n"
} else { "No permissions configured" })

=== Usage ===

# Azure CLI
az login --service-principal -u $($app.AppId) -p "$($secret.SecretText)" --tenant $($context.TenantId)

# PowerShell
`$credential = New-Object System.Management.Automation.PSCredential("$($app.AppId)", (ConvertTo-SecureString "$($secret.SecretText)" -AsPlainText -Force))
Connect-AzAccount -ServicePrincipal -Credential `$credential -Tenant "$($context.TenantId)"

IMPORTANT: Store this information securely!
"@
            $exportContent | Out-File -FilePath $exportPath -Encoding UTF8

            # Restrict file permissions to current user only
            try {
                $acl = Get-Acl $exportPath
                $acl.SetAccessRuleProtection($true, $false)
                $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
                    $env:USERNAME, "FullControl", "Allow"
                )
                $acl.SetAccessRule($rule)
                Set-Acl $exportPath $acl
            } catch {
                Write-Warning "ACL restriction failed (non-critical): $($_.Exception.Message)"
            }

            Write-Host "`n✓ Details saved: $((Get-Item $exportPath).FullName)" -ForegroundColor Yellow
            Write-Host "  ⚠️  File contains secret in plaintext – store securely or delete immediately!" -ForegroundColor Red
        } catch {
            Write-Host "`nError saving file: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "Please note the secret from the copy area above manually." -ForegroundColor Yellow
        }
    } else {
        Write-Host "`n✓ No file export. Please note the secret from the copy area above." -ForegroundColor Cyan
    }
}
catch {
    Write-Host "`n❌ Error during app creation:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "`nError details:" -ForegroundColor Yellow
    Write-Host "Type:     $($_.Exception.GetType().Name)" -ForegroundColor Yellow
    Write-Host "Position: $($_.InvocationInfo.PositionMessage)" -ForegroundColor Yellow

    # ===== ROLLBACK: Delete app if it was created =====
    if ($null -ne $app) {
        Write-Host "`n🔄 Rollback: Deleting already-created app registration '$AppName'..." -ForegroundColor Yellow
        try {
            Remove-MgApplication -ApplicationId $app.Id -Confirm:$false
            Write-Host "   ✓ App registration removed (rollback successful)." -ForegroundColor Green
        } catch {
            Write-Host "   ⚠ Rollback failed: App '$AppName' (ID: $($app.Id)) must be deleted manually." -ForegroundColor Red
            Write-Host "   Entra Portal: https://entra.microsoft.com → App registrations → All applications" -ForegroundColor Yellow
        }
    }
}
finally {
    Write-Host "`nScript completed. Thank you for using the Entra ID App Creation script." -ForegroundColor Cyan
}
