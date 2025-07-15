<#
.SYNOPSIS
    Dynamic Device Renaming in Intune Using Group Tags and PowerShell - Enhanced Version v2.0
    
.DESCRIPTION
    Renames an AAD-joined Intune device to "GroupTag-SerialTail" format (≤15 characters)
    with enhanced UI, logging, and multiple authentication options including username/password.
    
.AUTHOR
    Original Concept: AliAlame - CYBERSYSTEM (https://www.cybersystem.ca)
    Enhanced Version: Philipp Schmidt
    
.VERSION
    V2.0
    
.NOTES
    Original concept and base implementation by AliAlame from CYBERSYSTEM.
    This enhanced version includes improved UI, multiple authentication options, and error handling.
    
    REQUIRED AZURE AD RBAC ROLES:
    For App Registration (Client Credentials):
    - No specific user roles required (uses app permissions)
    
    For Username/Password Authentication:
    - Intune Administrator (recommended)
    - Global Administrator (full access)
    - Cloud Device Administrator (device management)
    - Azure AD Joined Device Local Administrator (device-specific)
    
    Required Graph API Permissions:
    - Device.Read.All (Application or Delegated)
    - DeviceManagementServiceConfig.Read.All (Application or Delegated)
    - User.Read (Delegated)
    - DeviceManagementManagedDevices.Read.All (Delegated - for user auth)
    
    Logs: C:\ProgramData\IntuneDeviceRenamer\logs\
    
.PARAMETER TenantId
    Azure AD Tenant ID
    
.PARAMETER ClientId
    Azure App Registration Client ID
    
.PARAMETER ClientSecret
    Azure App Registration Client Secret (for app authentication)
    
.PARAMETER Username
    Username for delegated authentication
    
.PARAMETER Password
    Password for delegated authentication (will be prompted securely if not provided)
    
.PARAMETER AuthMethod
    Authentication method: 'ClientCredentials', 'UsernamePassword', 'DeviceCode', 'Interactive'
    
.PARAMETER DebugMode
    If true, performs dry run without renaming or rebooting
    
.PARAMETER Interactive
    If true, prompts for credentials interactively
    
.EXAMPLE
    # App Registration (Client Credentials)
    .\DeviceRename-GroupTAG-Enhanced-v2.ps1 -TenantId "tenant-id" -ClientId "client-id" -ClientSecret "secret"
    
.EXAMPLE
    # Username/Password Authentication
    .\DeviceRename-GroupTAG-Enhanced-v2.ps1 -TenantId "tenant-id" -ClientId "client-id" -AuthMethod "UsernamePassword" -Username "admin@domain.com"
    
.EXAMPLE
    # Device Code Flow (MFA-friendly)
    .\DeviceRename-GroupTAG-Enhanced-v2.ps1 -TenantId "tenant-id" -ClientId "client-id" -AuthMethod "DeviceCode"
    
.EXAMPLE
    # Interactive Browser Authentication
    .\DeviceRename-GroupTAG-Enhanced-v2.ps1 -TenantId "tenant-id" -ClientId "client-id" -AuthMethod "Interactive"
    
.LICENSE
    MIT License - Same as original implementation
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$TenantId,
    
    [Parameter(Mandatory=$false)]
    [string]$ClientId,
    
    [Parameter(Mandatory=$false)]
    [string]$ClientSecret,
    
    [Parameter(Mandatory=$false)]
    [string]$Username,
    
    [Parameter(Mandatory=$false)]
    [SecureString]$Password,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet('ClientCredentials', 'UsernamePassword', 'DeviceCode', 'Interactive')]
    [string]$AuthMethod = 'ClientCredentials',
    
    [Parameter(Mandatory=$false)]
    [switch]$DebugMode,
    
    [Parameter(Mandatory=$false)]
    [switch]$Interactive
)

# ==================== CONFIGURATION ====================

# Default settings (can be overridden by parameters)
$DefaultTenantId = 'XXXXXXXXXXXXXXXXXXXX'
$DefaultClientId = 'XXXXXXXXXXXXXXXXXXXX'
$DefaultClientSecret = 'XXXXXXXXXXXXXXXXXXXX'

# Logging configuration
$LogDir = 'C:\ProgramData\IntuneDeviceRenamer\logs'
$MaxNameLength = 15

# Authentication endpoints
$AuthEndpoints = @{
    TokenEndpoint = "https://login.microsoftonline.com/{0}/oauth2/v2.0/token"
    DeviceCodeEndpoint = "https://login.microsoftonline.com/{0}/oauth2/v2.0/devicecode"
    GraphEndpoint = "https://graph.microsoft.com"
}

# ==================== RBAC INFORMATION ====================

$RBACInfo = @"

=== REQUIRED AZURE AD RBAC ROLES ===

For CLIENT CREDENTIALS (App Registration):
✅ No specific user roles required
✅ Uses application permissions only
✅ Recommended for automated/unattended scenarios

For USERNAME/PASSWORD Authentication:
🔑 REQUIRED ROLES (one of the following):

1. INTUNE ADMINISTRATOR (Recommended)
   - Full access to Intune device management
   - Can read device information and configurations
   - Scope: Microsoft Intune only

2. GLOBAL ADMINISTRATOR
   - Full access to all Azure AD and Microsoft 365 services
   - Can perform all operations
   - Scope: Entire tenant (use with caution)

3. CLOUD DEVICE ADMINISTRATOR
   - Can manage device objects in Azure AD
   - Can read device properties and configurations
   - Scope: Device management across Azure AD

4. AZURE AD JOINED DEVICE LOCAL ADMINISTRATOR
   - Can manage specific Azure AD joined devices
   - Limited to devices where explicitly granted
   - Scope: Specific devices only

ADDITIONAL CONSIDERATIONS:
⚠️  MFA may be required based on Conditional Access policies
⚠️  Account must not be blocked or disabled
⚠️  Account must have appropriate licenses (Intune, Azure AD P1/P2)

=== GRAPH API PERMISSIONS REQUIRED ===

Application Permissions (for Client Credentials):
- Device.Read.All
- DeviceManagementServiceConfig.Read.All

Delegated Permissions (for Username/Password):
- Device.Read.All
- DeviceManagementServiceConfig.Read.All
- DeviceManagementManagedDevices.Read.All
- User.Read

"@

# ==================== FUNCTIONS ====================

function Write-ColoredOutput {
    param(
        [string]$Message,
        [string]$Color = "White",
        [string]$Type = "INFO"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $colorMap = @{
        "INFO" = "Cyan"
        "SUCCESS" = "Green"
        "WARNING" = "Yellow"
        "ERROR" = "Red"
        "DEBUG" = "Magenta"
        "RBAC" = "Blue"
    }
    
    if ($colorMap.ContainsKey($Type)) {
        $Color = $colorMap[$Type]
    }
    
    Write-Host "[$timestamp] [$Type] $Message" -ForegroundColor $Color
}

function Show-RBACInformation {
    Write-ColoredOutput $RBACInfo "RBAC"
}

function Initialize-Logging {
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    
    $script:LogFile = Join-Path $LogDir "Rename_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
    
    Write-ColoredOutput "Logging initialized: $LogFile" "INFO"
}

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    
    # Write to console with color
    Write-ColoredOutput $Message $Level
    
    # Write to log file
    if ($script:LogFile) {
        $logEntry | Out-File -FilePath $script:LogFile -Append -Encoding UTF8
    }
}

function Get-AuthenticationMethod {
    if ($Interactive) {
        Write-ColoredOutput "=== Authentication Method Selection ===" "INFO"
        Write-ColoredOutput "Available authentication methods:" "INFO"
        Write-ColoredOutput "1. Client Credentials (App Registration)" "INFO"
        Write-ColoredOutput "2. Username/Password" "INFO"
        Write-ColoredOutput "3. Device Code Flow (MFA-friendly)" "INFO"
        Write-ColoredOutput "4. Interactive Browser" "INFO"
        
        do {
            $choice = Read-Host "Select authentication method (1-4)"
        } while ($choice -notin @('1','2','3','4'))
        
        $methodMap = @{
            '1' = 'ClientCredentials'
            '2' = 'UsernamePassword'
            '3' = 'DeviceCode'
            '4' = 'Interactive'
        }
        
        return $methodMap[$choice]
    }
    
    return $AuthMethod
}

function Get-Credentials {
    $selectedAuthMethod = Get-AuthenticationMethod
    
    Write-ColoredOutput "Using authentication method: $selectedAuthMethod" "INFO"
    
    # Get Tenant ID and Client ID (required for all methods)
    if ($Interactive -or -not $TenantId) {
        if (-not $TenantId) {
            $script:TenantId = Read-Host "Enter Tenant ID"
        }
        if (-not $ClientId) {
            $script:ClientId = Read-Host "Enter Client ID"
        }
    } else {
        if (-not $TenantId) { $script:TenantId = $DefaultTenantId }
        if (-not $ClientId) { $script:ClientId = $DefaultClientId }
    }
    
    $credentials = @{
        TenantId = $script:TenantId
        ClientId = $script:ClientId
        AuthMethod = $selectedAuthMethod
    }
    
    switch ($selectedAuthMethod) {
        'ClientCredentials' {
            if ($Interactive -or -not $ClientSecret) {
                if (-not $ClientSecret) {
                    $secureSecret = Read-Host "Enter Client Secret" -AsSecureString
                    $credentials.ClientSecret = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret))
                } else {
                    $credentials.ClientSecret = $ClientSecret
                }
            } else {
                $credentials.ClientSecret = if ($ClientSecret) { $ClientSecret } else { $DefaultClientSecret }
            }
        }
        
        'UsernamePassword' {
            if (-not $Username) {
                $credentials.Username = Read-Host "Enter Username (e.g., admin@domain.com)"
            } else {
                $credentials.Username = $Username
            }
            
            if (-not $Password) {
                $credentials.Password = Read-Host "Enter Password" -AsSecureString
            } else {
                $credentials.Password = $Password
            }
        }
        
        'DeviceCode' {
            Write-ColoredOutput "Device Code Flow selected - you'll receive a code to enter in your browser" "INFO"
        }
        
        'Interactive' {
            Write-ColoredOutput "Interactive Browser authentication selected" "INFO"
        }
    }
    
    return $credentials
}

function Get-GraphAccessToken {
    param(
        [hashtable]$Credentials
    )
    
    Write-Log "Requesting Graph API access token using $($Credentials.AuthMethod)..." "INFO"
    
    try {
        switch ($Credentials.AuthMethod) {
            'ClientCredentials' {
                return Get-ClientCredentialsToken -Credentials $Credentials
            }
            'UsernamePassword' {
                return Get-UsernamePasswordToken -Credentials $Credentials
            }
            'DeviceCode' {
                return Get-DeviceCodeToken -Credentials $Credentials
            }
            'Interactive' {
                return Get-InteractiveToken -Credentials $Credentials
            }
        }
    }
    catch {
        Write-Log "Authentication failed: $($_.Exception.Message)" "ERROR"
        Write-Log "Please verify your credentials and RBAC role assignments" "ERROR"
        Show-RBACInformation
        throw
    }
}

function Get-ClientCredentialsToken {
    param([hashtable]$Credentials)
    
    $body = @{
        client_id = $Credentials.ClientId
        scope = "https://graph.microsoft.com/.default"
        client_secret = $Credentials.ClientSecret
        grant_type = "client_credentials"
    }
    
    $uri = $AuthEndpoints.TokenEndpoint -f $Credentials.TenantId
    $response = Invoke-RestMethod -Uri $uri -Method POST -Body $body -ContentType 'application/x-www-form-urlencoded' -Verbose:$DebugMode
    
    Write-Log "Client Credentials token obtained successfully" "SUCCESS"
    return $response.access_token
}

function Get-UsernamePasswordToken {
    param([hashtable]$Credentials)
    
    $passwordText = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($Credentials.Password))
    
    $body = @{
        client_id = $Credentials.ClientId
        scope = "https://graph.microsoft.com/Device.Read.All https://graph.microsoft.com/DeviceManagementServiceConfig.Read.All https://graph.microsoft.com/DeviceManagementManagedDevices.Read.All https://graph.microsoft.com/User.Read"
        username = $Credentials.Username
        password = $passwordText
        grant_type = "password"
    }
    
    $uri = $AuthEndpoints.TokenEndpoint -f $Credentials.TenantId
    
    try {
        $response = Invoke-RestMethod -Uri $uri -Method POST -Body $body -ContentType 'application/x-www-form-urlencoded' -Verbose:$DebugMode
        Write-Log "Username/Password token obtained successfully" "SUCCESS"
        return $response.access_token
    }
    catch {
        if ($_.Exception.Message -like "*AADSTS50076*" -or $_.Exception.Message -like "*MFA*") {
            Write-Log "MFA is required. Please use Device Code or Interactive authentication method." "ERROR"
            Write-Log "Switching to Device Code Flow..." "WARNING"
            return Get-DeviceCodeToken -Credentials $Credentials
        }
        throw
    }
    finally {
        # Clear password from memory
        $passwordText = $null
    }
}

function Get-DeviceCodeToken {
    param([hashtable]$Credentials)
    
    # Step 1: Get device code
    $deviceCodeBody = @{
        client_id = $Credentials.ClientId
        scope = "https://graph.microsoft.com/Device.Read.All https://graph.microsoft.com/DeviceManagementServiceConfig.Read.All https://graph.microsoft.com/DeviceManagementManagedDevices.Read.All https://graph.microsoft.com/User.Read"
    }
    
    $deviceCodeUri = $AuthEndpoints.DeviceCodeEndpoint -f $Credentials.TenantId
    $deviceCodeResponse = Invoke-RestMethod -Uri $deviceCodeUri -Method POST -Body $deviceCodeBody -ContentType 'application/x-www-form-urlencoded'
    
    # Display instructions to user
    Write-ColoredOutput "=== DEVICE CODE AUTHENTICATION ===" "WARNING"
    Write-ColoredOutput "Please follow these steps:" "INFO"
    Write-ColoredOutput "1. Open a web browser and go to: $($deviceCodeResponse.verification_uri)" "INFO"
    Write-ColoredOutput "2. Enter this code: $($deviceCodeResponse.user_code)" "WARNING"
    Write-ColoredOutput "3. Sign in with an account that has the required RBAC roles" "INFO"
    Write-ColoredOutput "Waiting for authentication..." "INFO"
    
    # Step 2: Poll for token
    $tokenBody = @{
        grant_type = "urn:ietf:params:oauth:grant-type:device_code"
        client_id = $Credentials.ClientId
        device_code = $deviceCodeResponse.device_code
    }
    
    $tokenUri = $AuthEndpoints.TokenEndpoint -f $Credentials.TenantId
    $interval = $deviceCodeResponse.interval
    $expiresIn = $deviceCodeResponse.expires_in
    $startTime = Get-Date
    
    do {
        Start-Sleep -Seconds $interval
        
        try {
            $response = Invoke-RestMethod -Uri $tokenUri -Method POST -Body $tokenBody -ContentType 'application/x-www-form-urlencoded'
            Write-Log "Device Code authentication successful!" "SUCCESS"
            return $response.access_token
        }
        catch {
            $errorResponse = $_.Exception.Response
            if ($errorResponse.StatusCode -eq 400) {
                # Still waiting for user to complete authentication
                $elapsed = ((Get-Date) - $startTime).TotalSeconds
                if ($elapsed -gt $expiresIn) {
                    throw "Device code expired. Please try again."
                }
                Write-ColoredOutput "Still waiting for authentication... ($([math]::Round($expiresIn - $elapsed)) seconds remaining)" "INFO"
            } else {
                throw
            }
        }
    } while ($true)
}

function Get-InteractiveToken {
    param([hashtable]$Credentials)
    
    Write-Log "Interactive authentication requires additional PowerShell modules" "WARNING"
    Write-Log "For production use, consider using Device Code Flow instead" "INFO"
    
    # For now, fall back to device code flow
    Write-Log "Falling back to Device Code Flow..." "INFO"
    return Get-DeviceCodeToken -Credentials $Credentials
}

function Get-DeviceSerial {
    Write-Log "Retrieving device serial number..." "INFO"
    
    try {
        $serial = (Get-CimInstance Win32_BIOS).SerialNumber.Trim()
        
        if (-not $serial) {
            throw "BIOS serial number is empty"
        }
        
        Write-Log "Device serial number: $serial" "SUCCESS"
        return $serial
    }
    catch {
        Write-Log "Failed to retrieve serial number: $($_.Exception.Message)" "ERROR"
        throw
    }
}

function Get-AutopilotDevice {
    param(
        [string]$AccessToken,
        [string]$Serial
    )
    
    Write-Log "Querying Autopilot devices..." "INFO"
    
    try {
        $uri = "https://graph.microsoft.com/beta/deviceManagement/windowsAutopilotDeviceIdentities"
        $headers = @{ Authorization = "Bearer $AccessToken" }
        
        $response = Invoke-RestMethod -Uri $uri -Headers $headers -Method GET -Verbose:$DebugMode
        $device = $response.value | Where-Object { $_.serialNumber -eq $Serial }
        
        if (-not $device) {
            throw "No Autopilot record found for serial $Serial"
        }
        
        $groupTag = $device.groupTag
        Write-Log "Found device with GroupTag: $groupTag" "SUCCESS"
        
        return $device
    }
    catch {
        Write-Log "Failed to query Autopilot devices: $($_.Exception.Message)" "ERROR"
        if ($_.Exception.Message -like "*Forbidden*" -or $_.Exception.Message -like "*403*") {
            Write-Log "Access denied. Please verify RBAC role assignments:" "ERROR"
            Show-RBACInformation
        }
        throw
    }
}

function Build-NewDeviceName {
    param(
        [string]$GroupTag,
        [string]$Serial
    )
    
    Write-Log "Building new device name..." "INFO"
    
    if (-not $GroupTag) {
        throw "GroupTag is empty"
    }
    
    # Clean serial for naming (remove non-alphanumeric characters)
    $serialClean = $Serial -replace '[^0-9A-Za-z]', ''
    Write-Log "Cleaned serial: $serialClean" "DEBUG"
    
    # Calculate available length for serial
    $baseLength = $GroupTag.Length + 1  # +1 for hyphen
    $availableLength = $MaxNameLength - $baseLength
    
    if ($availableLength -le 0) {
        throw "GroupTag '$GroupTag' is too long for NetBIOS limit (max $MaxNameLength chars)"
    }
    
    # Use cleaned serial for SerialTail
    $serialTail = if ($serialClean.Length -le $availableLength) {
        $serialClean
    } else {
        $serialClean.Substring($serialClean.Length - $availableLength, $availableLength)
    }
    
    $newName = "$GroupTag-$serialTail"
    Write-Log "Proposed new name: $newName (Length: $($newName.Length))" "SUCCESS"
    
    return $newName
}

function Rename-Device {
    param(
        [string]$NewName
    )
    
    $currentName = $env:COMPUTERNAME
    
    if ($currentName -eq $NewName) {
        Write-Log "Device already has correct name: $currentName" "SUCCESS"
        return $false
    }
    
    if ($DebugMode) {
        Write-Log "DEBUG MODE: Would rename from '$currentName' to '$NewName'" "DEBUG"
        return $false
    }
    
    Write-Log "Renaming device from '$currentName' to '$NewName'..." "INFO"
    
    try {
        Rename-Computer -NewName $NewName -Force -ErrorAction Stop
        Write-Log "Device rename successful!" "SUCCESS"
        return $true
    }
    catch {
        Write-Log "Device rename failed: $($_.Exception.Message)" "ERROR"
        throw
    }
}

function Handle-Reboot {
    param(
        [bool]$RenameOccurred
    )
    
    if (-not $RenameOccurred) {
        Write-Log "No reboot required" "INFO"
        return
    }
    
    if ($DebugMode) {
        Write-Log "DEBUG MODE: Would schedule reboot" "DEBUG"
        return
    }
    
    Write-Log "Handling reboot..." "INFO"
    
    try {
        $computerSystem = Get-CimInstance Win32_ComputerSystem
        
        if ($computerSystem.UserName -match 'defaultUser') {
            Write-Log "ESP/OOBE context detected - Exiting with code 1641 for forced reboot" "INFO"
            exit 1641
        } else {
            # Show user notification and schedule reboot
            Add-Type -AssemblyName PresentationFramework
            [System.Windows.MessageBox]::Show(
                "Device name was updated to: $NewName`n`nThe system will reboot automatically in 10 minutes, or you can reboot manually now.",
                "Device Renamed",
                "OK",
                "Info"
            ) | Out-Null
            
            # Schedule reboot in 10 minutes
            shutdown.exe /g /t 600 /f /c "Restarting after device rename to $NewName."
            Write-Log "Reboot scheduled in 10 minutes" "SUCCESS"
        }
    }
    catch {
        Write-Log "Fallback: Using shutdown command" "WARNING"
        shutdown.exe /g /t 600 /f /c "Restarting after device rename to $NewName."
    }
}

# ==================== MAIN EXECUTION ====================

function Main {
    try {
        # Initialize
        Write-ColoredOutput "=== Dynamic Device Renaming in Intune - Enhanced Version v2.0 ===" "INFO"
        Write-ColoredOutput "Original Concept: AliAlame - CYBERSYSTEM" "INFO"
        Write-ColoredOutput "Enhanced Version: Philipp Schmidt" "INFO"
        Write-ColoredOutput "=================================================================" "INFO"
        
        Initialize-Logging
        
        if ($DebugMode) {
            Write-Log "DEBUG MODE ENABLED - No changes will be made" "WARNING"
        }
        
        # Show RBAC information if interactive
        if ($Interactive) {
            Show-RBACInformation
            $continue = Read-Host "Continue with authentication? (Y/N)"
            if ($continue -ne 'Y' -and $continue -ne 'y') {
                Write-Log "Script execution cancelled by user" "INFO"
                exit 0
            }
        }
        
        # Get credentials
        $credentials = Get-Credentials
        
        # Get access token
        $accessToken = Get-GraphAccessToken -Credentials $credentials
        
        # Get device serial
        $serial = Get-DeviceSerial
        
        # Query Autopilot device
        $device = Get-AutopilotDevice -AccessToken $accessToken -Serial $serial
        
        # Build new name
        $newName = Build-NewDeviceName -GroupTag $device.groupTag -Serial $serial
        
        # Rename device
        $renameOccurred = Rename-Device -NewName $newName
        
        # Handle reboot if needed
        Handle-Reboot -RenameOccurred $renameOccurred
        
        Write-Log "Script execution completed successfully!" "SUCCESS"
        exit 0
        
    }
    catch {
        Write-Log "Script execution failed: $($_.Exception.Message)" "ERROR"
        Write-Log "Stack trace: $($_.ScriptStackTrace)" "DEBUG"
        
        if ($_.Exception.Message -like "*403*" -or $_.Exception.Message -like "*Forbidden*") {
            Write-Log "This appears to be a permissions issue. Please review RBAC requirements:" "ERROR"
            Show-RBACInformation
        }
        
        exit 1
    }
}

# Execute main function
Main

