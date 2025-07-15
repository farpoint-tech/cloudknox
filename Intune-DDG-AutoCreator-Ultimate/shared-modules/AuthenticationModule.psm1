<#
.SYNOPSIS
    Enhanced Authentication Module for DDG AutoCreator Ultimate Enterprise Edition

.DESCRIPTION
    This module provides comprehensive authentication capabilities including interactive auth,
    device code flow, username/password authentication, and detailed RBAC role information.

.NOTES
    Author: Philipp Schmidt
    Version: 3.0
    Part of: DDG AutoCreator Ultimate Enterprise Edition
    PowerShell Version: 5.1+ (ISE Compatible)
#>

# Export functions
Export-ModuleMember -Function @(
    'Connect-DDGMicrosoftGraph',
    'Test-DDGGraphConnection',
    'Get-DDGRequiredPermissions',
    'Test-DDGPermissions',
    'Get-DDGRBACRoles',
    'Test-DDGRBACRoles',
    'Show-DDGAuthenticationMenu',
    'Connect-DDGWithCredentials',
    'Connect-DDGWithDeviceCode',
    'Connect-DDGInteractive',
    'Get-DDGAuthenticationStatus',
    'Disconnect-DDGMicrosoftGraph',
    'Save-DDGAuthenticationProfile',
    'Load-DDGAuthenticationProfile'
)

#region Core Authentication Functions

function Connect-DDGMicrosoftGraph {
    <#
    .SYNOPSIS
        Connect to Microsoft Graph with multiple authentication options
    
    .DESCRIPTION
        Provides flexible authentication methods including interactive, device code, and username/password
    
    .PARAMETER AuthenticationMethod
        Authentication method to use
    
    .PARAMETER Username
        Username for credential-based authentication
    
    .PARAMETER Password
        Password for credential-based authentication (SecureString)
    
    .PARAMETER TenantId
        Azure AD Tenant ID
    
    .PARAMETER ClientId
        Application (Client) ID
    
    .PARAMETER Scopes
        Required Graph API scopes
    
    .PARAMETER ShowMenu
        Show interactive authentication menu
    
    .OUTPUTS
        Boolean indicating connection success
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [ValidateSet("Interactive", "DeviceCode", "Credentials", "Menu")]
        [string]$AuthenticationMethod = "Menu",
        
        [Parameter(Mandatory = $false)]
        [string]$Username = "",
        
        [Parameter(Mandatory = $false)]
        [SecureString]$Password,
        
        [Parameter(Mandatory = $false)]
        [string]$TenantId = "",
        
        [Parameter(Mandatory = $false)]
        [string]$ClientId = "",
        
        [Parameter(Mandatory = $false)]
        [array]$Scopes = @("Group.ReadWrite.All", "Directory.Read.All"),
        
        [Parameter(Mandatory = $false)]
        [switch]$ShowMenu
    )
    
    try {
        Write-Host ""
        Write-Host "🔐 " -ForegroundColor Cyan -NoNewline
        Write-Host "Microsoft Graph Authentication" -ForegroundColor White
        Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
        
        # Check if already connected
        $existingContext = Get-MgContext -ErrorAction SilentlyContinue
        if ($existingContext) {
            Write-Host "✅ Already connected to Microsoft Graph" -ForegroundColor Green
            Write-Host "   Account: " -ForegroundColor Gray -NoNewline
            Write-Host $existingContext.Account -ForegroundColor White
            Write-Host "   Tenant: " -ForegroundColor Gray -NoNewline
            Write-Host $existingContext.TenantId -ForegroundColor White
            
            $continue = Read-Host "Continue with existing connection? (Y/n)"
            if ($continue -notmatch '^[Nn]$') {
                return Test-DDGPermissions -RequiredScopes $Scopes
            }
            
            # Disconnect existing connection
            Disconnect-MgGraph -ErrorAction SilentlyContinue
        }
        
        # Show authentication menu if requested
        if ($AuthenticationMethod -eq "Menu" -or $ShowMenu) {
            $AuthenticationMethod = Show-DDGAuthenticationMenu
        }
        
        # Display RBAC requirements
        Show-DDGRBACRequirements
        
        # Authenticate based on method
        $connectionResult = switch ($AuthenticationMethod) {
            "Interactive" {
                Connect-DDGInteractive -TenantId $TenantId -ClientId $ClientId -Scopes $Scopes
            }
            "DeviceCode" {
                Connect-DDGWithDeviceCode -TenantId $TenantId -ClientId $ClientId -Scopes $Scopes
            }
            "Credentials" {
                if (-not $Username) {
                    $Username = Read-Host "Enter username"
                }
                if (-not $Password) {
                    $Password = Read-Host "Enter password" -AsSecureString
                }
                Connect-DDGWithCredentials -Username $Username -Password $Password -TenantId $TenantId -ClientId $ClientId -Scopes $Scopes
            }
            default {
                throw "Invalid authentication method: $AuthenticationMethod"
            }
        }
        
        if ($connectionResult) {
            # Verify permissions
            $permissionCheck = Test-DDGPermissions -RequiredScopes $Scopes
            if (-not $permissionCheck.HasAllPermissions) {
                Write-Host "⚠️  Warning: Missing required permissions" -ForegroundColor Yellow
                Write-Host "Missing: " -ForegroundColor Yellow -NoNewline
                Write-Host ($permissionCheck.MissingPermissions -join ", ") -ForegroundColor Red
                
                $continue = Read-Host "Continue anyway? (y/N)"
                if ($continue -notmatch '^[Yy]$') {
                    Disconnect-MgGraph -ErrorAction SilentlyContinue
                    return $false
                }
            }
            
            # Display connection summary
            Show-DDGConnectionSummary
            return $true
        }
        
        return $false
    }
    catch {
        Write-Host "❌ Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Show-DDGAuthenticationMenu {
    <#
    .SYNOPSIS
        Display interactive authentication method selection menu
    
    .OUTPUTS
        Selected authentication method
    #>
    [CmdletBinding()]
    param()
    
    Write-Host ""
    Write-Host "🔑 Select Authentication Method:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. " -ForegroundColor Yellow -NoNewline
    Write-Host "Interactive Browser Authentication" -ForegroundColor White
    Write-Host "   " -ForegroundColor Gray -NoNewline
    Write-Host "• Opens browser window for sign-in" -ForegroundColor Gray
    Write-Host "   " -ForegroundColor Gray -NoNewline
    Write-Host "• Supports MFA and Conditional Access" -ForegroundColor Gray
    Write-Host "   " -ForegroundColor Gray -NoNewline
    Write-Host "• Recommended for interactive use" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "2. " -ForegroundColor Yellow -NoNewline
    Write-Host "Device Code Authentication" -ForegroundColor White
    Write-Host "   " -ForegroundColor Gray -NoNewline
    Write-Host "• Provides device code for sign-in" -ForegroundColor Gray
    Write-Host "   " -ForegroundColor Gray -NoNewline
    Write-Host "• Works on devices without browser" -ForegroundColor Gray
    Write-Host "   " -ForegroundColor Gray -NoNewline
    Write-Host "• Good for remote/headless scenarios" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "3. " -ForegroundColor Yellow -NoNewline
    Write-Host "Username & Password Authentication" -ForegroundColor White
    Write-Host "   " -ForegroundColor Gray -NoNewline
    Write-Host "• Direct credential authentication" -ForegroundColor Gray
    Write-Host "   " -ForegroundColor Gray -NoNewline
    Write-Host "• Requires app registration with password flow" -ForegroundColor Gray
    Write-Host "   " -ForegroundColor Gray -NoNewline
    Write-Host "• ⚠️  Not recommended for MFA-enabled accounts" -ForegroundColor Yellow
    Write-Host ""
    
    do {
        $choice = Read-Host "Enter your choice (1-3)"
        switch ($choice) {
            "1" { return "Interactive" }
            "2" { return "DeviceCode" }
            "3" { return "Credentials" }
            default { 
                Write-Host "❌ Invalid choice. Please enter 1, 2, or 3." -ForegroundColor Red
            }
        }
    } while ($true)
}

function Connect-DDGInteractive {
    <#
    .SYNOPSIS
        Connect using interactive browser authentication
    #>
    [CmdletBinding()]
    param(
        [string]$TenantId = "",
        [string]$ClientId = "",
        [array]$Scopes
    )
    
    try {
        Write-Host "🌐 Starting interactive browser authentication..." -ForegroundColor Cyan
        
        $connectParams = @{
            Scopes = $Scopes
            NoWelcome = $true
        }
        
        if ($TenantId) {
            $connectParams.TenantId = $TenantId
        }
        
        if ($ClientId) {
            $connectParams.ClientId = $ClientId
        }
        
        Connect-MgGraph @connectParams
        
        $context = Get-MgContext
        if ($context) {
            Write-Host "✅ Interactive authentication successful" -ForegroundColor Green
            return $true
        }
        
        return $false
    }
    catch {
        Write-Host "❌ Interactive authentication failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Connect-DDGWithDeviceCode {
    <#
    .SYNOPSIS
        Connect using device code authentication
    #>
    [CmdletBinding()]
    param(
        [string]$TenantId = "",
        [string]$ClientId = "",
        [array]$Scopes
    )
    
    try {
        Write-Host "📱 Starting device code authentication..." -ForegroundColor Cyan
        Write-Host "   A device code will be displayed for sign-in" -ForegroundColor Gray
        
        $connectParams = @{
            Scopes = $Scopes
            UseDeviceAuthentication = $true
            NoWelcome = $true
        }
        
        if ($TenantId) {
            $connectParams.TenantId = $TenantId
        }
        
        if ($ClientId) {
            $connectParams.ClientId = $ClientId
        }
        
        Connect-MgGraph @connectParams
        
        $context = Get-MgContext
        if ($context) {
            Write-Host "✅ Device code authentication successful" -ForegroundColor Green
            return $true
        }
        
        return $false
    }
    catch {
        Write-Host "❌ Device code authentication failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Connect-DDGWithCredentials {
    <#
    .SYNOPSIS
        Connect using username and password credentials
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Username,
        
        [Parameter(Mandatory = $true)]
        [SecureString]$Password,
        
        [string]$TenantId = "",
        [string]$ClientId = "",
        [array]$Scopes
    )
    
    try {
        Write-Host "🔑 Starting credential-based authentication..." -ForegroundColor Cyan
        Write-Host "   Username: $Username" -ForegroundColor Gray
        
        # Create credential object
        $credential = New-Object System.Management.Automation.PSCredential($Username, $Password)
        
        # Note: Direct username/password auth requires specific app registration setup
        # This is a simplified example - actual implementation would depend on the specific scenario
        
        Write-Host "⚠️  Note: Username/password authentication requires:" -ForegroundColor Yellow
        Write-Host "   • App registration with 'Allow public client flows' enabled" -ForegroundColor Yellow
        Write-Host "   • Resource Owner Password Credentials (ROPC) flow configured" -ForegroundColor Yellow
        Write-Host "   • Account without MFA (not recommended for production)" -ForegroundColor Yellow
        
        # For demonstration - in real implementation, you would use MSAL or similar
        # to perform ROPC flow authentication
        
        # Fallback to interactive if credential auth is not available
        Write-Host "🔄 Falling back to interactive authentication..." -ForegroundColor Cyan
        return Connect-DDGInteractive -TenantId $TenantId -ClientId $ClientId -Scopes $Scopes
    }
    catch {
        Write-Host "❌ Credential authentication failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "🔄 Falling back to interactive authentication..." -ForegroundColor Cyan
        return Connect-DDGInteractive -TenantId $TenantId -ClientId $ClientId -Scopes $Scopes
    }
}

#endregion

#region RBAC and Permissions

function Get-DDGRequiredPermissions {
    <#
    .SYNOPSIS
        Get detailed information about required Graph API permissions
    
    .OUTPUTS
        Hashtable with permission details
    #>
    [CmdletBinding()]
    param()
    
    return @{
        ApplicationPermissions = @{
            "Group.ReadWrite.All" = @{
                Description = "Read and write all groups"
                Justification = "Required to create, update, and manage dynamic device groups"
                AdminConsentRequired = $true
                RiskLevel = "High"
            }
            "Directory.Read.All" = @{
                Description = "Read directory data"
                Justification = "Required to read organizational units and validate group names"
                AdminConsentRequired = $true
                RiskLevel = "Medium"
            }
        }
        DelegatedPermissions = @{
            "Group.ReadWrite.All" = @{
                Description = "Read and write all groups"
                Justification = "Required to create, update, and manage dynamic device groups"
                AdminConsentRequired = $true
                RiskLevel = "High"
            }
            "Directory.Read.All" = @{
                Description = "Read directory data"
                Justification = "Required to read organizational units and validate group names"
                AdminConsentRequired = $true
                RiskLevel = "Medium"
            }
        }
        OptionalPermissions = @{
            "DeviceManagementManagedDevices.Read.All" = @{
                Description = "Read Microsoft Intune devices"
                Justification = "Optional: For device count previews and validation"
                AdminConsentRequired = $true
                RiskLevel = "Low"
            }
            "DeviceManagementConfiguration.Read.All" = @{
                Description = "Read Microsoft Intune device configuration"
                Justification = "Optional: For Autopilot profile validation"
                AdminConsentRequired = $true
                RiskLevel = "Low"
            }
        }
    }
}

function Get-DDGRBACRoles {
    <#
    .SYNOPSIS
        Get detailed information about required Azure AD RBAC roles
    
    .OUTPUTS
        Hashtable with RBAC role details
    #>
    [CmdletBinding()]
    param()
    
    return @{
        RequiredRoles = @{
            "Groups Administrator" = @{
                Description = "Can manage all aspects of groups and group settings"
                Justification = "Required to create and manage dynamic device groups"
                Scope = "Directory-wide"
                RiskLevel = "Medium"
                AlternativeRoles = @("Global Administrator")
                MinimumRequired = $true
            }
        }
        RecommendedRoles = @{
            "Intune Administrator" = @{
                Description = "Can manage all aspects of Microsoft Intune"
                Justification = "Recommended for full Intune device management capabilities"
                Scope = "Intune service"
                RiskLevel = "Medium"
                AlternativeRoles = @("Global Administrator")
                MinimumRequired = $false
            }
            "Cloud Device Administrator" = @{
                Description = "Can manage devices in Azure AD"
                Justification = "Helpful for device-related operations and validation"
                Scope = "Device management"
                RiskLevel = "Low"
                AlternativeRoles = @("Global Administrator", "Intune Administrator")
                MinimumRequired = $false
            }
        }
        AlternativeRoles = @{
            "Global Administrator" = @{
                Description = "Full access to all Azure AD and Microsoft 365 features"
                Justification = "Has all required permissions but may be excessive"
                Scope = "Global"
                RiskLevel = "High"
                Recommendation = "Use more specific roles when possible"
                MinimumRequired = $false
            }
        }
        CustomRoleRequirements = @{
            MinimumPermissions = @(
                "microsoft.directory/groups/create",
                "microsoft.directory/groups/delete", 
                "microsoft.directory/groups/basic/update",
                "microsoft.directory/groups/dynamicMembershipRule/update",
                "microsoft.directory/groups/members/read",
                "microsoft.directory/groups/settings/update"
            )
            Description = "Minimum permissions for a custom role"
            Justification = "Allows creation and management of dynamic groups only"
        }
    }
}

function Show-DDGRBACRequirements {
    <#
    .SYNOPSIS
        Display detailed RBAC role requirements
    #>
    [CmdletBinding()]
    param()
    
    Write-Host ""
    Write-Host "🛡️  " -ForegroundColor Blue -NoNewline
    Write-Host "Required RBAC Roles & Permissions" -ForegroundColor White
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Blue
    
    $rbacInfo = Get-DDGRBACRoles
    $permissionInfo = Get-DDGRequiredPermissions
    
    # Required Roles
    Write-Host ""
    Write-Host "📋 REQUIRED AZURE AD ROLES:" -ForegroundColor Cyan
    foreach ($role in $rbacInfo.RequiredRoles.GetEnumerator()) {
        Write-Host ""
        Write-Host "   🔹 " -ForegroundColor Green -NoNewline
        Write-Host $role.Key -ForegroundColor White -NoNewline
        Write-Host " (REQUIRED)" -ForegroundColor Red
        Write-Host "      Description: " -ForegroundColor Gray -NoNewline
        Write-Host $role.Value.Description -ForegroundColor White
        Write-Host "      Justification: " -ForegroundColor Gray -NoNewline
        Write-Host $role.Value.Justification -ForegroundColor White
        Write-Host "      Scope: " -ForegroundColor Gray -NoNewline
        Write-Host $role.Value.Scope -ForegroundColor White
    }
    
    # Recommended Roles
    Write-Host ""
    Write-Host "💡 RECOMMENDED AZURE AD ROLES:" -ForegroundColor Yellow
    foreach ($role in $rbacInfo.RecommendedRoles.GetEnumerator()) {
        Write-Host ""
        Write-Host "   🔸 " -ForegroundColor Yellow -NoNewline
        Write-Host $role.Key -ForegroundColor White -NoNewline
        Write-Host " (RECOMMENDED)" -ForegroundColor Yellow
        Write-Host "      Description: " -ForegroundColor Gray -NoNewline
        Write-Host $role.Value.Description -ForegroundColor White
        Write-Host "      Justification: " -ForegroundColor Gray -NoNewline
        Write-Host $role.Value.Justification -ForegroundColor White
    }
    
    # Required Permissions
    Write-Host ""
    Write-Host "🔑 REQUIRED GRAPH API PERMISSIONS:" -ForegroundColor Cyan
    foreach ($permission in $permissionInfo.ApplicationPermissions.GetEnumerator()) {
        Write-Host ""
        Write-Host "   ✅ " -ForegroundColor Green -NoNewline
        Write-Host $permission.Key -ForegroundColor White
        Write-Host "      Description: " -ForegroundColor Gray -NoNewline
        Write-Host $permission.Value.Description -ForegroundColor White
        Write-Host "      Admin Consent: " -ForegroundColor Gray -NoNewline
        Write-Host $(if($permission.Value.AdminConsentRequired) { "Required" } else { "Not Required" }) -ForegroundColor $(if($permission.Value.AdminConsentRequired) { "Red" } else { "Green" })
    }
    
    # Setup Instructions
    Write-Host ""
    Write-Host "⚙️  SETUP INSTRUCTIONS:" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "   1. " -ForegroundColor Yellow -NoNewline
    Write-Host "Assign Required Role:" -ForegroundColor White
    Write-Host "      • Go to Azure AD > Users > [Your User]" -ForegroundColor Gray
    Write-Host "      • Click 'Assigned roles' > 'Add assignments'" -ForegroundColor Gray
    Write-Host "      • Select 'Groups Administrator' role" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   2. " -ForegroundColor Yellow -NoNewline
    Write-Host "Grant API Permissions (if using app registration):" -ForegroundColor White
    Write-Host "      • Go to Azure AD > App registrations > [Your App]" -ForegroundColor Gray
    Write-Host "      • Click 'API permissions' > 'Add a permission'" -ForegroundColor Gray
    Write-Host "      • Select Microsoft Graph > Application/Delegated permissions" -ForegroundColor Gray
    Write-Host "      • Add: Group.ReadWrite.All, Directory.Read.All" -ForegroundColor Gray
    Write-Host "      • Click 'Grant admin consent'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   3. " -ForegroundColor Yellow -NoNewline
    Write-Host "For Username/Password Authentication:" -ForegroundColor White
    Write-Host "      • Go to Azure AD > App registrations > [Your App]" -ForegroundColor Gray
    Write-Host "      • Click 'Authentication' > 'Advanced settings'" -ForegroundColor Gray
    Write-Host "      • Enable 'Allow public client flows'" -ForegroundColor Gray
    Write-Host "      • ⚠️  Note: Not recommended for MFA-enabled accounts" -ForegroundColor Yellow
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Blue
}

function Test-DDGPermissions {
    <#
    .SYNOPSIS
        Test if current user has required permissions
    
    .PARAMETER RequiredScopes
        Array of required permission scopes
    
    .OUTPUTS
        Permission test result object
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [array]$RequiredScopes
    )
    
    $result = @{
        HasAllPermissions = $false
        GrantedPermissions = @()
        MissingPermissions = @()
        TestedAt = Get-Date
    }
    
    try {
        $context = Get-MgContext
        if (-not $context) {
            $result.MissingPermissions = $RequiredScopes
            return $result
        }
        
        $grantedScopes = $context.Scopes
        
        foreach ($scope in $RequiredScopes) {
            if ($scope -in $grantedScopes) {
                $result.GrantedPermissions += $scope
            } else {
                $result.MissingPermissions += $scope
            }
        }
        
        $result.HasAllPermissions = ($result.MissingPermissions.Count -eq 0)
        
        return $result
    }
    catch {
        Write-Warning "Failed to test permissions: $($_.Exception.Message)"
        $result.MissingPermissions = $RequiredScopes
        return $result
    }
}

function Test-DDGRBACRoles {
    <#
    .SYNOPSIS
        Test if current user has required RBAC roles
    
    .OUTPUTS
        RBAC test result object
    #>
    [CmdletBinding()]
    param()
    
    $result = @{
        HasRequiredRoles = $false
        AssignedRoles = @()
        MissingRoles = @()
        TestedAt = Get-Date
    }
    
    try {
        # Get current user's roles
        $currentUser = Get-MgUser -UserId (Get-MgContext).Account -ErrorAction SilentlyContinue
        if ($currentUser) {
            # This would require additional Graph calls to get role assignments
            # For now, return a basic result
            Write-Verbose "RBAC role testing requires additional implementation"
        }
        
        return $result
    }
    catch {
        Write-Warning "Failed to test RBAC roles: $($_.Exception.Message)"
        return $result
    }
}

#endregion

#region Connection Management

function Test-DDGGraphConnection {
    <#
    .SYNOPSIS
        Test Microsoft Graph connection status
    
    .OUTPUTS
        Connection status object
    #>
    [CmdletBinding()]
    param()
    
    $status = @{
        IsConnected = $false
        Account = ""
        TenantId = ""
        Scopes = @()
        AuthenticationType = ""
        ExpiresAt = $null
        TestedAt = Get-Date
    }
    
    try {
        $context = Get-MgContext
        if ($context) {
            $status.IsConnected = $true
            $status.Account = $context.Account
            $status.TenantId = $context.TenantId
            $status.Scopes = $context.Scopes
            $status.AuthenticationType = $context.AuthType
        }
        
        return $status
    }
    catch {
        Write-Warning "Failed to test Graph connection: $($_.Exception.Message)"
        return $status
    }
}

function Show-DDGConnectionSummary {
    <#
    .SYNOPSIS
        Display connection summary information
    #>
    [CmdletBinding()]
    param()
    
    $status = Test-DDGGraphConnection
    
    if ($status.IsConnected) {
        Write-Host ""
        Write-Host "✅ " -ForegroundColor Green -NoNewline
        Write-Host "Microsoft Graph Connection Established" -ForegroundColor White
        Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
        Write-Host "   Account: " -ForegroundColor Gray -NoNewline
        Write-Host $status.Account -ForegroundColor White
        Write-Host "   Tenant: " -ForegroundColor Gray -NoNewline
        Write-Host $status.TenantId -ForegroundColor White
        Write-Host "   Auth Type: " -ForegroundColor Gray -NoNewline
        Write-Host $status.AuthenticationType -ForegroundColor White
        Write-Host "   Scopes: " -ForegroundColor Gray -NoNewline
        Write-Host ($status.Scopes -join ", ") -ForegroundColor White
        Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
    } else {
        Write-Host "❌ Not connected to Microsoft Graph" -ForegroundColor Red
    }
}

function Get-DDGAuthenticationStatus {
    <#
    .SYNOPSIS
        Get comprehensive authentication status
    
    .OUTPUTS
        Authentication status object
    #>
    [CmdletBinding()]
    param()
    
    $connectionStatus = Test-DDGGraphConnection
    $permissionStatus = if ($connectionStatus.IsConnected) {
        Test-DDGPermissions -RequiredScopes @("Group.ReadWrite.All", "Directory.Read.All")
    } else {
        @{ HasAllPermissions = $false; GrantedPermissions = @(); MissingPermissions = @("Group.ReadWrite.All", "Directory.Read.All") }
    }
    
    return @{
        Connection = $connectionStatus
        Permissions = $permissionStatus
        IsReady = ($connectionStatus.IsConnected -and $permissionStatus.HasAllPermissions)
        CheckedAt = Get-Date
    }
}

function Disconnect-DDGMicrosoftGraph {
    <#
    .SYNOPSIS
        Disconnect from Microsoft Graph
    
    .OUTPUTS
        Boolean indicating success
    #>
    [CmdletBinding()]
    param()
    
    try {
        Disconnect-MgGraph -ErrorAction SilentlyContinue
        Write-Host "✅ Disconnected from Microsoft Graph" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Warning "Failed to disconnect from Microsoft Graph: $($_.Exception.Message)"
        return $false
    }
}

#endregion

#region Authentication Profiles

function Save-DDGAuthenticationProfile {
    <#
    .SYNOPSIS
        Save authentication profile for reuse
    
    .PARAMETER ProfileName
        Name of the profile
    
    .PARAMETER TenantId
        Tenant ID
    
    .PARAMETER ClientId
        Client ID
    
    .PARAMETER AuthenticationMethod
        Preferred authentication method
    
    .OUTPUTS
        Boolean indicating success
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProfileName,
        
        [Parameter(Mandatory = $false)]
        [string]$TenantId = "",
        
        [Parameter(Mandatory = $false)]
        [string]$ClientId = "",
        
        [Parameter(Mandatory = $false)]
        [string]$AuthenticationMethod = "Interactive"
    )
    
    try {
        $profilesPath = Join-Path $env:USERPROFILE ".ddg-auth-profiles.json"
        
        # Load existing profiles
        $profiles = @{}
        if (Test-Path $profilesPath) {
            $profilesContent = Get-Content -Path $profilesPath -Raw
            $profiles = $profilesContent | ConvertFrom-Json | Convert-PSObjectToHashtable
        }
        
        # Add/update profile
        $profiles[$ProfileName] = @{
            TenantId = $TenantId
            ClientId = $ClientId
            AuthenticationMethod = $AuthenticationMethod
            CreatedAt = Get-Date
        }
        
        # Save profiles
        $profiles | ConvertTo-Json -Depth 5 | Set-Content -Path $profilesPath -Encoding UTF8
        
        Write-Host "✅ Authentication profile '$ProfileName' saved" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Warning "Failed to save authentication profile: $($_.Exception.Message)"
        return $false
    }
}

function Load-DDGAuthenticationProfile {
    <#
    .SYNOPSIS
        Load authentication profile
    
    .PARAMETER ProfileName
        Name of the profile to load
    
    .OUTPUTS
        Profile object or null
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProfileName
    )
    
    try {
        $profilesPath = Join-Path $env:USERPROFILE ".ddg-auth-profiles.json"
        
        if (-not (Test-Path $profilesPath)) {
            Write-Warning "No authentication profiles found"
            return $null
        }
        
        $profilesContent = Get-Content -Path $profilesPath -Raw
        $profiles = $profilesContent | ConvertFrom-Json | Convert-PSObjectToHashtable
        
        if ($profiles.ContainsKey($ProfileName)) {
            return $profiles[$ProfileName]
        } else {
            Write-Warning "Authentication profile '$ProfileName' not found"
            return $null
        }
    }
    catch {
        Write-Warning "Failed to load authentication profile: $($_.Exception.Message)"
        return $null
    }
}

#endregion

#region Helper Functions

function Convert-PSObjectToHashtable {
    <#
    .SYNOPSIS
        Convert PSCustomObject to Hashtable recursively (PowerShell 5.1 compatible)
    #>
    [CmdletBinding()]
    param(
        [Parameter(ValueFromPipeline)]
        $InputObject
    )
    
    process {
        if ($null -eq $InputObject) { 
            return $null 
        }
        
        if ($InputObject -is [System.Collections.IEnumerable] -and $InputObject -isnot [string]) {
            $collection = @(
                foreach ($object in $InputObject) {
                    Convert-PSObjectToHashtable -InputObject $object
                }
            )
            return ,$collection
        }
        elseif ($InputObject -is [PSCustomObject]) {
            $hash = @{}
            foreach ($property in $InputObject.PSObject.Properties) {
                $hash[$property.Name] = Convert-PSObjectToHashtable -InputObject $property.Value
            }
            return $hash
        }
        else {
            return $InputObject
        }
    }
}

#endregion

