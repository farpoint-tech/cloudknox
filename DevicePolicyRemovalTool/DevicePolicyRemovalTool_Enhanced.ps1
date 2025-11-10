# Intune Policy Management Tool with Enhanced Authentication
# Version 3.0 - Fixed authentication and policy retrieval
# Created: 2025-04-16

# Global variables
$DeviceTypeFilter = "All"
$BatchSize = 10

# Check and install required modules
Write-Host "Checking required modules..." -ForegroundColor Cyan
$requiredModules = @(
    @{Name = "Microsoft.Graph.Authentication"; RequiredVersion = "2.0.0"},
    @{Name = "Microsoft.Graph.DeviceManagement"; RequiredVersion = "2.0.0"},
    @{Name = "Microsoft.Graph.DeviceManagement.Administration"; RequiredVersion = "2.0.0"},
    @{Name = "Microsoft.Graph.DeviceManagement.Enrolment"; RequiredVersion = "2.0.0"}
)
$modulesToInstall = @()

foreach ($module in $requiredModules) {
    if (-not (Get-Module -ListAvailable -Name $module.Name | Where-Object { $_.Version -ge $module.RequiredVersion })) {
        $modulesToInstall += $module
    }
}

if ($modulesToInstall.Count -gt 0) {
    Write-Host "The following modules need to be installed or updated:" -ForegroundColor Yellow
    foreach ($module in $modulesToInstall) {
        Write-Host " - $($module.Name) (Required version: $($module.RequiredVersion))" -ForegroundColor Yellow
    }
    
    $installConfirm = Read-Host "Do you want to install these modules? (Y/N)"
    
    if ($installConfirm -eq 'Y') {
        foreach ($module in $modulesToInstall) {
            try {
                Write-Host "Installing $($module.Name)..." -ForegroundColor Cyan
                Install-Module $module.Name -MinimumVersion $module.RequiredVersion -Scope CurrentUser -Force -AllowClobber
                Write-Host "Successfully installed $($module.Name)" -ForegroundColor Green
            }
            catch {
                Write-Host "Failed to install $($module.Name)`:" -ForegroundColor Red
                Write-Host $_.Exception.Message -ForegroundColor Red
                Write-Host "Please install it manually with`:" -ForegroundColor Yellow
                Write-Host "Install-Module $($module.Name) -MinimumVersion $($module.RequiredVersion) -Scope CurrentUser -Force" -ForegroundColor Yellow
                exit
            }
        }
    }
    else {
        Write-Host "Module installation cancelled. The script cannot continue without required modules." -ForegroundColor Red
        exit
    }
}

# Import required modules
try {
    Import-Module Microsoft.Graph.Authentication -MinimumVersion 2.0.0 -Force
    Import-Module Microsoft.Graph.DeviceManagement -MinimumVersion 2.0.0 -Force
    Import-Module Microsoft.Graph.DeviceManagement.Administration -MinimumVersion 2.0.0 -Force
    Import-Module Microsoft.Graph.DeviceManagement.Enrolment -MinimumVersion 2.0.0 -Force
    Write-Host "Modules imported successfully" -ForegroundColor Green
}
catch {
    Write-Host "Failed to import modules`:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit
}

# Main script execution
try {
    # Authentication
    Write-Host "`n===== AUTHENTICATION OPTIONS =====" -ForegroundColor Magenta
    Write-Host "1. Interactive Browser Authentication" -ForegroundColor Cyan
    Write-Host "2. Device Code Authentication" -ForegroundColor Cyan
    Write-Host "3. Exit" -ForegroundColor Yellow
    
    $authChoice = Read-Host "`nSelect authentication method (1-3)"
    
    # Define the required scopes - expanded for full device management access
    $scopes = @(
        "DeviceManagementConfiguration.ReadWrite.All",
        "DeviceManagementApps.ReadWrite.All",
        "DeviceManagementServiceConfig.ReadWrite.All",
        "DeviceManagementManagedDevices.ReadWrite.All",
        "Directory.Read.All",
        "Directory.ReadWrite.All"
    )
    
    # Clear any existing connections
    Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
    
    try {
        switch ($authChoice) {
            '1' {
                Write-Host "Initiating interactive browser authentication..." -ForegroundColor Cyan
                Write-Host "A browser window will open. Please sign in with your credentials." -ForegroundColor Cyan
                
                # Use Connect-MgGraph with explicit scopes
                Connect-MgGraph -Scopes $scopes -UseDeviceAuthentication:$false -ErrorAction Stop
            }
            '2' {
                Write-Host "Initiating device code authentication..." -ForegroundColor Cyan
                Write-Host "You will be provided with a code to enter in a browser." -ForegroundColor Cyan
                
                # Use device code flow with explicit scopes
                Connect-MgGraph -Scopes $scopes -UseDeviceAuthentication -ErrorAction Stop
            }
            '3' {
                Write-Host "Exiting script." -ForegroundColor Yellow
                exit
            }
            default {
                Write-Host "Invalid choice. Defaulting to interactive browser authentication." -ForegroundColor Yellow
                Connect-MgGraph -Scopes $scopes -UseDeviceAuthentication:$false -ErrorAction Stop
            }
        }
        
        # Verify connection and token
        $context = Get-MgContext
        if (-not $context) {
            throw "Failed to get Microsoft Graph context after authentication."
        }
        
        Write-Host "Authentication successful!" -ForegroundColor Green
        Write-Host "Connected as: $($context.Account)" -ForegroundColor Green
        Write-Host "Scopes: $($context.Scopes -join ', ')" -ForegroundColor Cyan
        
        # Verify required permissions
        $requiredPermissions = @(
            "DeviceManagementConfiguration.ReadWrite.All",
            "DeviceManagementApps.ReadWrite.All"
        )
        
        $missingPermissions = @()
        foreach ($permission in $requiredPermissions) {
            if ($context.Scopes -notcontains $permission) {
                $missingPermissions += $permission
            }
        }
        
        if ($missingPermissions.Count -gt 0) {
            Write-Host "Warning: Missing required permissions:" -ForegroundColor Yellow
            foreach ($permission in $missingPermissions) {
                Write-Host " - $permission" -ForegroundColor Yellow
            }
            Write-Host "Some functionality may not work correctly." -ForegroundColor Yellow
            $continueAnyway = Read-Host "Do you want to continue anyway? (Y/N)"
            if ($continueAnyway -ne 'Y') {
                Write-Host "Exiting script." -ForegroundColor Yellow
                exit
            }
        }
    }
    catch {
        Write-Host "Authentication failed`:" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit
    }
    
    # Set initial batch size
    Write-Host "`n===== BATCH PROCESSING SETTINGS =====" -ForegroundColor Magenta
    Write-Host "1. Process individually (1 policy per batch)" -ForegroundColor Cyan
    Write-Host "2. Small batches (10 policies)" -ForegroundColor Cyan
    Write-Host "3. Medium batches (20 policies)" -ForegroundColor Cyan
    Write-Host "4. Large batches (50 policies)" -ForegroundColor Cyan
    Write-Host "5. Process ALL policies at once (Use with caution!)" -ForegroundColor Yellow
    
    $batchChoice = Read-Host "`nSelect batch size (1-5)"
    
    switch ($batchChoice) {
        '1' { $BatchSize = 1 }
        '2' { $BatchSize = 10 }
        '3' { $BatchSize = 20 }
        '4' { $BatchSize = 50 }
        '5' {
            $confirm = Read-Host "WARNING: This will process ALL policies at once. Are you sure? (Y/N)"
            if ($confirm -eq 'Y') {
                $BatchSize = -1
            }
            else {
                $BatchSize = 10
                Write-Host "Defaulting to small batches (10 policies)." -ForegroundColor Cyan
            }
        }
        default {
            $BatchSize = 10
            Write-Host "Invalid choice. Defaulting to small batches (10 policies)." -ForegroundColor Yellow
        }
    }
    
    Write-Host "Batch size set to: $(if($BatchSize -eq -1){"ALL"}else{$BatchSize})" -ForegroundColor Green
    
    # Set initial device type filter
    Write-Host "`n===== DEVICE TYPE FILTER =====" -ForegroundColor Magenta
    Write-Host "1. All Device Types" -ForegroundColor Cyan
    Write-Host "2. Windows Only" -ForegroundColor Cyan
    Write-Host "3. macOS Only" -ForegroundColor Cyan
    Write-Host "4. iOS Only" -ForegroundColor Cyan
    Write-Host "5. Android Only" -ForegroundColor Cyan
    
    $filterChoice = Read-Host "`nSelect device type filter (1-5)"
    
    switch ($filterChoice) {
        '1' { $DeviceTypeFilter = "All" }
        '2' { $DeviceTypeFilter = "Windows" }
        '3' { $DeviceTypeFilter = "macOS" }
        '4' { $DeviceTypeFilter = "iOS" }
        '5' { $DeviceTypeFilter = "Android" }
        default {
            $DeviceTypeFilter = "All"
            Write-Host "Invalid choice. Defaulting to All Device Types." -ForegroundColor Yellow
        }
    }
    
    Write-Host "Device type filter set to: $DeviceTypeFilter" -ForegroundColor Green
    
    # Store authentication method for potential reconnection
    $authMethod = $authChoice
    
    # Main menu loop
    $exit = $false
    while (-not $exit) {
        Write-Host "`n===== INTUNE POLICY MANAGEMENT TOOL =====" -ForegroundColor Magenta
        Write-Host "1. Manage Device Configuration Policies" -ForegroundColor Cyan
        Write-Host "2. Manage Device Compliance Policies" -ForegroundColor Cyan
        Write-Host "3. Change Batch Size (Current: $(if($BatchSize -eq -1){"ALL"}else{$BatchSize}))" -ForegroundColor Cyan
        Write-Host "4. Change Device Type Filter (Current: $DeviceTypeFilter)" -ForegroundColor Cyan
        Write-Host "5. Re-authenticate" -ForegroundColor Cyan
        Write-Host "6. Exit" -ForegroundColor Yellow
        
        $mainChoice = Read-Host "`nSelect option (1-6)"
        
        # Check if authentication is still valid
        try {
            $context = Get-MgContext
            if (-not $context) {
                Write-Host "Authentication session expired. Re-authenticating..." -ForegroundColor Yellow
                
                # Re-authenticate with the same method as before
                if ($authMethod -eq '2') {
                    Connect-MgGraph -Scopes $scopes -UseDeviceAuthentication -ErrorAction Stop
                }
                else {
                    Connect-MgGraph -Scopes $scopes -UseDeviceAuthentication:$false -ErrorAction Stop
                }
                
                $context = Get-MgContext
                if (-not $context) {
                    throw "Failed to re-authenticate."
                }
                
                Write-Host "Re-authentication successful!" -ForegroundColor Green
            }
        }
        catch {
            Write-Host "Authentication error`:" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
            Write-Host "Please select option 5 to re-authenticate." -ForegroundColor Yellow
        }
        
        switch ($mainChoice) {
            '1' { 
                # Process Device Configuration Policies
                $PolicyType = "DeviceConfiguration"
                
                # Get filtered policies
                Write-Host "Retrieving $PolicyType policies..." -ForegroundColor Cyan
                
                try {
                    # Use a more reliable approach to get policies
                    try {
                        # First try with standard cmdlet
                        $allPolicies = @(Get-MgDeviceManagementDeviceConfiguration -All -ErrorAction Stop)
                    }
                    catch {
                        Write-Host "Standard policy retrieval failed, trying alternative method..." -ForegroundColor Yellow
                        
                        # Alternative approach using REST API directly
                        $uri = "https://graph.microsoft.com/v1.0/deviceManagement/deviceConfigurations"
                        $response = Invoke-MgGraphRequest -Uri $uri -Method GET -ErrorAction Stop
                        $allPolicies = @($response.value)
                        
                        # If we have more pages, get them
                        while ($response.'@odata.nextLink') {
                            $response = Invoke-MgGraphRequest -Uri $response.'@odata.nextLink' -Method GET -ErrorAction Stop
                            $allPolicies += $response.value
                        }
                    }
                    
                    # Apply device type filter if not "All"
                    if ($DeviceTypeFilter -ne "All") {
                        $filteredPolicies = @()
                        
                        foreach ($policy in $allPolicies) {
                            $includePolicy = $false
                            
                            # Check policy name and properties for device type indicators
                            if ($policy.DisplayName -match $DeviceTypeFilter -or 
                                ($policy.Description -and $policy.Description -match $DeviceTypeFilter)) {
                                $includePolicy = $true
                            }
                            
                            # Check platform-specific properties
                            switch ($DeviceTypeFilter) {
                                "Windows" {
                                    if (($policy.AdditionalProperties -and 
                                         ($policy.AdditionalProperties.ContainsKey("windows10CompliancePolicy") -or 
                                          $policy.AdditionalProperties.ContainsKey("windows81CompliancePolicy"))) -or
                                        ($policy.'@odata.type' -and $policy.'@odata.type' -match "windows") -or
                                        ($policy.ODataType -and $policy.ODataType -match "windows")) {
                                        $includePolicy = $true
                                    }
                                }
                                "macOS" {
                                    if (($policy.AdditionalProperties -and 
                                         $policy.AdditionalProperties.ContainsKey("macOSCompliancePolicy")) -or
                                        ($policy.'@odata.type' -and $policy.'@odata.type' -match "macOS") -or
                                        ($policy.ODataType -and $policy.ODataType -match "macOS")) {
                                        $includePolicy = $true
                                    }
                                }
                                "iOS" {
                                    if (($policy.AdditionalProperties -and 
                                         $policy.AdditionalProperties.ContainsKey("iosCompliancePolicy")) -or
                                        ($policy.'@odata.type' -and $policy.'@odata.type' -match "ios") -or
                                        ($policy.ODataType -and $policy.ODataType -match "ios")) {
                                        $includePolicy = $true
                                    }
                                }
                                "Android" {
                                    if (($policy.AdditionalProperties -and 
                                         ($policy.AdditionalProperties.ContainsKey("androidCompliancePolicy") -or 
                                          $policy.AdditionalProperties.ContainsKey("androidWorkProfileCompliancePolicy"))) -or
                                        ($policy.'@odata.type' -and $policy.'@odata.type' -match "android") -or
                                        ($policy.ODataType -and $policy.ODataType -match "android")) {
                                        $includePolicy = $true
                                    }
                                }
                            }
                            
                            if ($includePolicy) {
                                $filteredPolicies += $policy
                            }
                        }
                        
                        $policies = $filteredPolicies
                    }
                    else {
                        $policies = $allPolicies
                    }
                    
                    $totalPolicies = $policies.Count
                    
                    if ($totalPolicies -eq 0) {
                        Write-Host "No $PolicyType policies found matching the filter: $DeviceTypeFilter" -ForegroundColor Yellow
                        Read-Host "Press Enter to continue..."
                        continue
                    }
                    
                    Write-Host "Found $totalPolicies $PolicyType policies matching filter: $DeviceTypeFilter" -ForegroundColor Green
                    
                    # Handle bulk deletion of all policies
                    if ($BatchSize -eq -1) {
                        Write-Host "`n===== POLICIES TO DELETE =====" -ForegroundColor Yellow
                        for ($i = 0; $i -lt $policies.Count; $i++) {
                            Write-Host " $($i+1). $($policies[$i].DisplayName)" -ForegroundColor Cyan
                        }
                        
                        $confirmation = Read-Host "`nAre you sure you want to delete ALL $totalPolicies policies? (Y/N)"
                        if ($confirmation -ne 'Y') {
                            Write-Host "Deletion cancelled." -ForegroundColor Cyan
                            continue
                        }
                        
                        $successCount = 0
                        $failCount = 0
                        
                        for ($i = 0; $i -lt $policies.Count; $i++) {
                            $policy = $policies[$i]
                            Write-Host "Deleting ($($i+1)/$totalPolicies): $($policy.DisplayName)" -ForegroundColor Cyan
                            
                            try {
                                # Try standard cmdlet first
                                try {
                                    Remove-MgDeviceManagementDeviceConfiguration -DeviceConfigurationId $policy.Id -ErrorAction Stop
                                }
                                catch {
                                    # Fall back to REST API
                                    $uri = "https://graph.microsoft.com/v1.0/deviceManagement/deviceConfigurations/$($policy.Id)"
                                    Invoke-MgGraphRequest -Uri $uri -Method DELETE -ErrorAction Stop
                                }
                                
                                Write-Host "  Successfully deleted!" -ForegroundColor Green
                                $successCount++
                            }
                            catch {
                                Write-Host "  Failed to delete`:" -ForegroundColor Red
                                Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
                                $failCount++
                            }
                        }
                        
                        Write-Host "`nDeletion Summary:" -ForegroundColor Magenta
                        Write-Host "Successfully deleted: $successCount" -ForegroundColor Green
                        if ($failCount -gt 0) {
                            Write-Host "Failed to delete: $failCount" -ForegroundColor Red
                        }
                        
                        Read-Host "Press Enter to continue..."
                        continue
                    }
                    
                    # Process in batches
                    $currentIndex = 0
                    $processingBatches = $true
                    
                    while ($processingBatches) {
                        $endIndex = [Math]::Min($currentIndex + $BatchSize - 1, $totalPolicies - 1)
                        $currentBatch = $policies[$currentIndex..$endIndex]
                        
                        Write-Host "`n===== POLICY BATCH $($currentIndex + 1) - $($endIndex + 1) OF $totalPolicies =====" -ForegroundColor Magenta
                        Write-Host "Device Type Filter: $DeviceTypeFilter" -ForegroundColor Cyan
                        
                        for ($i = 0; $i -lt $currentBatch.Count; $i++) {
                            $policy = $currentBatch[$i]
                            $deviceType = "Unknown"
                            
                            # Try to determine device type from policy properties
                            if (($policy.'@odata.type' -and $policy.'@odata.type' -match "windows") -or
                                ($policy.ODataType -and $policy.ODataType -match "windows") -or
                                ($policy.AdditionalProperties -and 
                                 ($policy.AdditionalProperties.ContainsKey("windows10CompliancePolicy") -or 
                                  $policy.AdditionalProperties.ContainsKey("windows81CompliancePolicy")))) {
                                $deviceType = "Windows"
                            }
                            elseif (($policy.'@odata.type' -and $policy.'@odata.type' -match "macOS") -or
                                    ($policy.ODataType -and $policy.ODataType -match "macOS") -or
                                    ($policy.AdditionalProperties -and 
                                     $policy.AdditionalProperties.ContainsKey("macOSCompliancePolicy"))) {
                                $deviceType = "macOS"
                            }
                            elseif (($policy.'@odata.type' -and $policy.'@odata.type' -match "ios") -or
                                    ($policy.ODataType -and $policy.ODataType -match "ios") -or
                                    ($policy.AdditionalProperties -and 
                                     $policy.AdditionalProperties.ContainsKey("iosCompliancePolicy"))) {
                                $deviceType = "iOS"
                            }
                            elseif (($policy.'@odata.type' -and $policy.'@odata.type' -match "android") -or
                                    ($policy.ODataType -and $policy.ODataType -match "android") -or
                                    ($policy.AdditionalProperties -and 
                                     ($policy.AdditionalProperties.ContainsKey("androidCompliancePolicy") -or 
                                      $policy.AdditionalProperties.ContainsKey("androidWorkProfileCompliancePolicy")))) {
                                $deviceType = "Android"
                            }
                            
                            Write-Host " $($i+1). $($policy.DisplayName) [$deviceType]" -ForegroundColor Cyan
                        }
                        
                        Write-Host "`nA - Delete ALL policies in this batch" -ForegroundColor Cyan
                        Write-Host "S - Select specific policies to delete" -ForegroundColor Cyan
                        Write-Host "N - Next batch" -ForegroundColor Cyan
                        Write-Host "B - Back to main menu" -ForegroundColor Yellow
                        
                        $batchChoice = Read-Host "`nEnter choice (A/S/N/B)"
                        
                        switch ($batchChoice.ToUpper()) {
                            'A' {
                                $confirmation = Read-Host "Are you sure you want to delete ALL policies in this batch? (Y/N)"
                                if ($confirmation -eq 'Y') {
                                    $successCount = 0
                                    $failCount = 0
                                    
                                    for ($i = 0; $i -lt $currentBatch.Count; $i++) {
                                        $policy = $currentBatch[$i]
                                        Write-Host "Deleting: $($policy.DisplayName)" -ForegroundColor Cyan
                                        
                                        try {
                                            # Try standard cmdlet first
                                            try {
                                                Remove-MgDeviceManagementDeviceConfiguration -DeviceConfigurationId $policy.Id -ErrorAction Stop
                                            }
                                            catch {
                                                # Fall back to REST API
                                                $uri = "https://graph.microsoft.com/v1.0/deviceManagement/deviceConfigurations/$($policy.Id)"
                                                Invoke-MgGraphRequest -Uri $uri -Method DELETE -ErrorAction Stop
                                            }
                                            
                                            Write-Host "  Successfully deleted!" -ForegroundColor Green
                                            $successCount++
                                        }
                                        catch {
                                            Write-Host "  Failed to delete`:" -ForegroundColor Red
                                            Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
                                            $failCount++
                                        }
                                    }
                                    
                                    Write-Host "`nDeletion Summary:" -ForegroundColor Magenta
                                    Write-Host "Successfully deleted: $successCount" -ForegroundColor Green
                                    if ($failCount -gt 0) {
                                        Write-Host "Failed to delete: $failCount" -ForegroundColor Red
                                    }
                                    
                                    Read-Host "Press Enter to continue..."
                                    
                                    # Refresh policies after deletion
                                    try {
                                        # Use a more reliable approach to get policies
                                        try {
                                            # First try with standard cmdlet
                                            $allPolicies = @(Get-MgDeviceManagementDeviceConfiguration -All -ErrorAction Stop)
                                        }
                                        catch {
                                            # Alternative approach using REST API directly
                                            $uri = "https://graph.microsoft.com/v1.0/deviceManagement/deviceConfigurations"
                                            $response = Invoke-MgGraphRequest -Uri $uri -Method GET -ErrorAction Stop
                                            $allPolicies = @($response.value)
                                            
                                            # If we have more pages, get them
                                            while ($response.'@odata.nextLink') {
                                                $response = Invoke-MgGraphRequest -Uri $response.'@odata.nextLink' -Method GET -ErrorAction Stop
                                                $allPolicies += $response.value
                                            }
                                        }
                                        
                                        # Apply device type filter if not "All"
                                        if ($DeviceTypeFilter -ne "All") {
                                            $filteredPolicies = @()
                                            
                                            foreach ($policy in $allPolicies) {
                                                $includePolicy = $false
                                                
                                                # Check policy name and properties for device type indicators
                                                if ($policy.DisplayName -match $DeviceTypeFilter -or 
                                                    ($policy.Description -and $policy.Description -match $DeviceTypeFilter)) {
                                                    $includePolicy = $true
                                                }
                                                
                                                # Check platform-specific properties
                                                switch ($DeviceTypeFilter) {
                                                    "Windows" {
                                                        if (($policy.AdditionalProperties -and 
                                                             ($policy.AdditionalProperties.ContainsKey("windows10CompliancePolicy") -or 
                                                              $policy.AdditionalProperties.ContainsKey("windows81CompliancePolicy"))) -or
                                                            ($policy.'@odata.type' -and $policy.'@odata.type' -match "windows") -or
                                                            ($policy.ODataType -and $policy.ODataType -match "windows")) {
                                                            $includePolicy = $true
                                                        }
                                                    }
                                                    "macOS" {
                                                        if (($policy.AdditionalProperties -and 
                                                             $policy.AdditionalProperties.ContainsKey("macOSCompliancePolicy")) -or
                                                            ($policy.'@odata.type' -and $policy.'@odata.type' -match "macOS") -or
                                                            ($policy.ODataType -and $policy.ODataType -match "macOS")) {
                                                            $includePolicy = $true
                                                        }
                                                    }
                                                    "iOS" {
                                                        if (($policy.AdditionalProperties -and 
                                                             $policy.AdditionalProperties.ContainsKey("iosCompliancePolicy")) -or
                                                            ($policy.'@odata.type' -and $policy.'@odata.type' -match "ios") -or
                                                            ($policy.ODataType -and $policy.ODataType -match "ios")) {
                                                            $includePolicy = $true
                                                        }
                                                    }
                                                    "Android" {
                                                        if (($policy.AdditionalProperties -and 
                                                             ($policy.AdditionalProperties.ContainsKey("androidCompliancePolicy") -or 
                                                              $policy.AdditionalProperties.ContainsKey("androidWorkProfileCompliancePolicy"))) -or
                                                            ($policy.'@odata.type' -and $policy.'@odata.type' -match "android") -or
                                                            ($policy.ODataType -and $policy.ODataType -match "android")) {
                                                            $includePolicy = $true
                                                        }
                                                    }
                                                }
                                                
                                                if ($includePolicy) {
                                                    $filteredPolicies += $policy
                                                }
                                            }
                                            
                                            $policies = $filteredPolicies
                                        }
                                        else {
                                            $policies = $allPolicies
                                        }
                                        
                                        $totalPolicies = $policies.Count
                                        
                                        if ($totalPolicies -eq 0) {
                                            Write-Host "No policies left matching the current filter." -ForegroundColor Green
                                            Read-Host "Press Enter to continue..."
                                            $processingBatches = $false
                                        }
                                    }
                                    catch {
                                        Write-Host "Error refreshing policies`:" -ForegroundColor Red
                                        Write-Host $_.Exception.Message -ForegroundColor Red
                                    }
                                }
                            }
                            'S' {
                                $selectionInput = Read-Host "Enter policy numbers to delete (comma-separated, e.g., 1,3,5)"
                                
                                # Parse the selection
                                $selectedIndices = @()
                                $selectionInput -split ',' | ForEach-Object {
                                    $index = $_.Trim()
                                    if ($index -match '^\d+$') {
                                        $numericIndex = [int]$index - 1
                                        if ($numericIndex -ge 0 -and $numericIndex -lt $currentBatch.Count) {
                                            $selectedIndices += $numericIndex
                                        }
                                        else {
                                            Write-Host "Invalid selection: $($index). Ignoring." -ForegroundColor Yellow
                                        }
                                    }
                                    elseif ($index -match '^(\d+)-(\d+)$') {
                                        $start = [int]$Matches[1] - 1
                                        $end = [int]$Matches[2] - 1
                                        if ($start -ge 0 -and $end -lt $currentBatch.Count -and $start -le $end) {
                                            $start..$end | ForEach-Object { $selectedIndices += $_ }
                                        }
                                        else {
                                            Write-Host "Invalid range: $index. Ignoring." -ForegroundColor Yellow
                                        }
                                    }
                                }
                                
                                # Remove duplicates
                                $selectedIndices = $selectedIndices | Select-Object -Unique | Sort-Object
                                
                                if ($selectedIndices.Count -eq 0) {
                                    Write-Host "No valid selections made." -ForegroundColor Yellow
                                }
                                else {
                                    Write-Host "`n===== SELECTED POLICIES TO DELETE =====" -ForegroundColor Yellow
                                    for ($i = 0; $i -lt $selectedIndices.Count; $i++) {
                                        $policy = $currentBatch[$selectedIndices[$i]]
                                        Write-Host " $($i+1). $($policy.DisplayName)" -ForegroundColor Cyan
                                    }
                                    
                                    $confirmation = Read-Host "`nAre you sure you want to delete these $($selectedIndices.Count) policies? (Y/N)"
                                    if ($confirmation -eq 'Y') {
                                        $successCount = 0
                                        $failCount = 0
                                        
                                        foreach ($index in $selectedIndices) {
                                            $policy = $currentBatch[$index]
                                            Write-Host "Deleting: $($policy.DisplayName)" -ForegroundColor Cyan
                                            
                                            try {
                                                # Try standard cmdlet first
                                                try {
                                                    Remove-MgDeviceManagementDeviceConfiguration -DeviceConfigurationId $policy.Id -ErrorAction Stop
                                                }
                                                catch {
                                                    # Fall back to REST API
                                                    $uri = "https://graph.microsoft.com/v1.0/deviceManagement/deviceConfigurations/$($policy.Id)"
                                                    Invoke-MgGraphRequest -Uri $uri -Method DELETE -ErrorAction Stop
                                                }
                                                
                                                Write-Host "  Successfully deleted!" -ForegroundColor Green
                                                $successCount++
                                            }
                                            catch {
                                                Write-Host "  Failed to delete`:" -ForegroundColor Red
                                                Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
                                                $failCount++
                                            }
                                        }
                                        
                                        Write-Host "`nDeletion Summary:" -ForegroundColor Magenta
                                        Write-Host "Successfully deleted: $successCount" -ForegroundColor Green
                                        if ($failCount -gt 0) {
                                            Write-Host "Failed to delete: $failCount" -ForegroundColor Red
                                        }
                                        
                                        Read-Host "Press Enter to continue..."
                                        
                                        # Refresh policies after deletion
                                        try {
                                            # Use a more reliable approach to get policies
                                            try {
                                                # First try with standard cmdlet
                                                $allPolicies = @(Get-MgDeviceManagementDeviceConfiguration -All -ErrorAction Stop)
                                            }
                                            catch {
                                                # Alternative approach using REST API directly
                                                $uri = "https://graph.microsoft.com/v1.0/deviceManagement/deviceConfigurations"
                                                $response = Invoke-MgGraphRequest -Uri $uri -Method GET -ErrorAction Stop
                                                $allPolicies = @($response.value)
                                                
                                                # If we have more pages, get them
                                                while ($response.'@odata.nextLink') {
                                                    $response = Invoke-MgGraphRequest -Uri $response.'@odata.nextLink' -Method GET -ErrorAction Stop
                                                    $allPolicies += $response.value
                                                }
                                            }
                                            
                                            # Apply device type filter if not "All"
                                            if ($DeviceTypeFilter -ne "All") {
                                                $filteredPolicies = @()
                                                
                                                foreach ($policy in $allPolicies) {
                                                    $includePolicy = $false
                                                    
                                                    # Check policy name and properties for device type indicators
                                                    if ($policy.DisplayName -match $DeviceTypeFilter -or 
                                                        ($policy.Description -and $policy.Description -match $DeviceTypeFilter)) {
                                                        $includePolicy = $true
                                                    }
                                                    
                                                    # Check platform-specific properties
                                                    switch ($DeviceTypeFilter) {
                                                        "Windows" {
                                                            if (($policy.AdditionalProperties -and 
                                                                 ($policy.AdditionalProperties.ContainsKey("windows10CompliancePolicy") -or 
                                                                  $policy.AdditionalProperties.ContainsKey("windows81CompliancePolicy"))) -or
                                                                ($policy.'@odata.type' -and $policy.'@odata.type' -match "windows") -or
                                                                ($policy.ODataType -and $policy.ODataType -match "windows")) {
                                                                $includePolicy = $true
                                                            }
                                                        }
                                                        "macOS" {
                                                            if (($policy.AdditionalProperties -and 
                                                                 $policy.AdditionalProperties.ContainsKey("macOSCompliancePolicy")) -or
                                                                ($policy.'@odata.type' -and $policy.'@odata.type' -match "macOS") -or
                                                                ($policy.ODataType -and $policy.ODataType -match "macOS")) {
                                                                $includePolicy = $true
                                                            }
                                                        }
                                                        "iOS" {
                                                            if (($policy.AdditionalProperties -and 
                                                                 $policy.AdditionalProperties.ContainsKey("iosCompliancePolicy")) -or
                                                                ($policy.'@odata.type' -and $policy.'@odata.type' -match "ios") -or
                                                                ($policy.ODataType -and $policy.ODataType -match "ios")) {
                                                                $includePolicy = $true
                                                            }
                                                        }
                                                        "Android" {
                                                            if (($policy.AdditionalProperties -and 
                                                                 ($policy.AdditionalProperties.ContainsKey("androidCompliancePolicy") -or 
                                                                  $policy.AdditionalProperties.ContainsKey("androidWorkProfileCompliancePolicy"))) -or
                                                                ($policy.'@odata.type' -and $policy.'@odata.type' -match "android") -or
                                                                ($policy.ODataType -and $policy.ODataType -match "android")) {
                                                                $includePolicy = $true
                                                            }
                                                        }
                                                    }
                                                    
                                                    if ($includePolicy) {
                                                        $filteredPolicies += $policy
                                                    }
                                                }
                                                
                                                $policies = $filteredPolicies
                                            }
                                            else {
                                                $policies = $allPolicies
                                            }
                                            
                                            $totalPolicies = $policies.Count
                                            
                                            if ($totalPolicies -eq 0) {
                                                Write-Host "No policies left matching the current filter." -ForegroundColor Green
                                                Read-Host "Press Enter to continue..."
                                                $processingBatches = $false
                                            }
                                        }
                                        catch {
                                            Write-Host "Error refreshing policies`:" -ForegroundColor Red
                                            Write-Host $_.Exception.Message -ForegroundColor Red
                                        }
                                    }
                                }
                            }
                            'N' { 
                                $currentIndex += $BatchSize 
                                if ($currentIndex -ge $totalPolicies) {
                                    $currentIndex = 0
                                }
                            }
                            'B' { 
                                $processingBatches = $false 
                            }
                            default { 
                                Write-Host "Invalid choice. Please try again." -ForegroundColor Yellow 
                            }
                        }
                    }
                }
                catch {
                    Write-Host "Error retrieving policies`:" -ForegroundColor Red
                    Write-Host $_.Exception.Message -ForegroundColor Red
                    Read-Host "Press Enter to continue..."
                }
            }
            '2' { 
                # Process Device Compliance Policies
                $PolicyType = "DeviceCompliance"
                
                # Get filtered policies
                Write-Host "Retrieving $PolicyType policies..." -ForegroundColor Cyan
                
                try {
                    # Use a more reliable approach to get policies
                    try {
                        # First try with standard cmdlet
                        $allPolicies = @(Get-MgDeviceManagementDeviceCompliancePolicy -All -ErrorAction Stop)
                    }
                    catch {
                        Write-Host "Standard policy retrieval failed, trying alternative method..." -ForegroundColor Yellow
                        
                        # Alternative approach using REST API directly
                        $uri = "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies"
                        $response = Invoke-MgGraphRequest -Uri $uri -Method GET -ErrorAction Stop
                        $allPolicies = @($response.value)
                        
                        # If we have more pages, get them
                        while ($response.'@odata.nextLink') {
                            $response = Invoke-MgGraphRequest -Uri $response.'@odata.nextLink' -Method GET -ErrorAction Stop
                            $allPolicies += $response.value
                        }
                    }
                    
                    # Apply device type filter if not "All"
                    if ($DeviceTypeFilter -ne "All") {
                        $filteredPolicies = @()
                        
                        foreach ($policy in $allPolicies) {
                            $includePolicy = $false
                            
                            # Check policy name and properties for device type indicators
                            if ($policy.DisplayName -match $DeviceTypeFilter -or 
                                ($policy.Description -and $policy.Description -match $DeviceTypeFilter)) {
                                $includePolicy = $true
                            }
                            
                            # Check platform-specific properties
                            switch ($DeviceTypeFilter) {
                                "Windows" {
                                    if (($policy.AdditionalProperties -and 
                                         ($policy.AdditionalProperties.ContainsKey("windows10CompliancePolicy") -or 
                                          $policy.AdditionalProperties.ContainsKey("windows81CompliancePolicy"))) -or
                                        ($policy.'@odata.type' -and $policy.'@odata.type' -match "windows") -or
                                        ($policy.ODataType -and $policy.ODataType -match "windows")) {
                                        $includePolicy = $true
                                    }
                                }
                                "macOS" {
                                    if (($policy.AdditionalProperties -and 
                                         $policy.AdditionalProperties.ContainsKey("macOSCompliancePolicy")) -or
                                        ($policy.'@odata.type' -and $policy.'@odata.type' -match "macOS") -or
                                        ($policy.ODataType -and $policy.ODataType -match "macOS")) {
                                        $includePolicy = $true
                                    }
                                }
                                "iOS" {
                                    if (($policy.AdditionalProperties -and 
                                         $policy.AdditionalProperties.ContainsKey("iosCompliancePolicy")) -or
                                        ($policy.'@odata.type' -and $policy.'@odata.type' -match "ios") -or
                                        ($policy.ODataType -and $policy.ODataType -match "ios")) {
                                        $includePolicy = $true
                                    }
                                }
                                "Android" {
                                    if (($policy.AdditionalProperties -and 
                                         ($policy.AdditionalProperties.ContainsKey("androidCompliancePolicy") -or 
                                          $policy.AdditionalProperties.ContainsKey("androidWorkProfileCompliancePolicy"))) -or
                                        ($policy.'@odata.type' -and $policy.'@odata.type' -match "android") -or
                                        ($policy.ODataType -and $policy.ODataType -match "android")) {
                                        $includePolicy = $true
                                    }
                                }
                            }
                            
                            if ($includePolicy) {
                                $filteredPolicies += $policy
                            }
                        }
                        
                        $policies = $filteredPolicies
                    }
                    else {
                        $policies = $allPolicies
                    }
                    
                    $totalPolicies = $policies.Count
                    
                    if ($totalPolicies -eq 0) {
                        Write-Host "No $PolicyType policies found matching the filter: $DeviceTypeFilter" -ForegroundColor Yellow
                        Read-Host "Press Enter to continue..."
                        continue
                    }
                    
                    Write-Host "Found $totalPolicies $PolicyType policies matching filter: $DeviceTypeFilter" -ForegroundColor Green
                    
                    # Handle bulk deletion of all policies
                    if ($BatchSize -eq -1) {
                        Write-Host "`n===== POLICIES TO DELETE =====" -ForegroundColor Yellow
                        for ($i = 0; $i -lt $policies.Count; $i++) {
                            Write-Host " $($i+1). $($policies[$i].DisplayName)" -ForegroundColor Cyan
                        }
                        
                        $confirmation = Read-Host "`nAre you sure you want to delete ALL $totalPolicies policies? (Y/N)"
                        if ($confirmation -ne 'Y') {
                            Write-Host "Deletion cancelled." -ForegroundColor Cyan
                            continue
                        }
                        
                        $successCount = 0
                        $failCount = 0
                        
                        for ($i = 0; $i -lt $policies.Count; $i++) {
                            $policy = $policies[$i]
                            Write-Host "Deleting ($($i+1)/$totalPolicies): $($policy.DisplayName)" -ForegroundColor Cyan
                            
                            try {
                                # Try standard cmdlet first
                                try {
                                    Remove-MgDeviceManagementDeviceCompliancePolicy -DeviceCompliancePolicyId $policy.Id -ErrorAction Stop
                                }
                                catch {
                                    # Fall back to REST API
                                    $uri = "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies/$($policy.Id)"
                                    Invoke-MgGraphRequest -Uri $uri -Method DELETE -ErrorAction Stop
                                }
                                
                                Write-Host "  Successfully deleted!" -ForegroundColor Green
                                $successCount++
                            }
                            catch {
                                Write-Host "  Failed to delete`:" -ForegroundColor Red
                                Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
                                $failCount++
                            }
                        }
                        
                        Write-Host "`nDeletion Summary:" -ForegroundColor Magenta
                        Write-Host "Successfully deleted: $successCount" -ForegroundColor Green
                        if ($failCount -gt 0) {
                            Write-Host "Failed to delete: $failCount" -ForegroundColor Red
                        }
                        
                        Read-Host "Press Enter to continue..."
                        continue
                    }
                    
                    # Process in batches
                    $currentIndex = 0
                    $processingBatches = $true
                    
                    while ($processingBatches) {
                        $endIndex = [Math]::Min($currentIndex + $BatchSize - 1, $totalPolicies - 1)
                        $currentBatch = $policies[$currentIndex..$endIndex]
                        
                        Write-Host "`n===== POLICY BATCH $($currentIndex + 1) - $($endIndex + 1) OF $totalPolicies =====" -ForegroundColor Magenta
                        Write-Host "Device Type Filter: $DeviceTypeFilter" -ForegroundColor Cyan
                        
                        for ($i = 0; $i -lt $currentBatch.Count; $i++) {
                            $policy = $currentBatch[$i]
                            $deviceType = "Unknown"
                            
                            # Try to determine device type from policy properties
                            if (($policy.'@odata.type' -and $policy.'@odata.type' -match "windows") -or
                                ($policy.ODataType -and $policy.ODataType -match "windows") -or
                                ($policy.AdditionalProperties -and 
                                 ($policy.AdditionalProperties.ContainsKey("windows10CompliancePolicy") -or 
                                  $policy.AdditionalProperties.ContainsKey("windows81CompliancePolicy")))) {
                                $deviceType = "Windows"
                            }
                            elseif (($policy.'@odata.type' -and $policy.'@odata.type' -match "macOS") -or
                                    ($policy.ODataType -and $policy.ODataType -match "macOS") -or
                                    ($policy.AdditionalProperties -and 
                                     $policy.AdditionalProperties.ContainsKey("macOSCompliancePolicy"))) {
                                $deviceType = "macOS"
                            }
                            elseif (($policy.'@odata.type' -and $policy.'@odata.type' -match "ios") -or
                                    ($policy.ODataType -and $policy.ODataType -match "ios") -or
                                    ($policy.AdditionalProperties -and 
                                     $policy.AdditionalProperties.ContainsKey("iosCompliancePolicy"))) {
                                $deviceType = "iOS"
                            }
                            elseif (($policy.'@odata.type' -and $policy.'@odata.type' -match "android") -or
                                    ($policy.ODataType -and $policy.ODataType -match "android") -or
                                    ($policy.AdditionalProperties -and 
                                     ($policy.AdditionalProperties.ContainsKey("androidCompliancePolicy") -or 
                                      $policy.AdditionalProperties.ContainsKey("androidWorkProfileCompliancePolicy")))) {
                                $deviceType = "Android"
                            }
                            
                            Write-Host " $($i+1). $($policy.DisplayName) [$deviceType]" -ForegroundColor Cyan
                        }
                        
                        Write-Host "`nA - Delete ALL policies in this batch" -ForegroundColor Cyan
                        Write-Host "S - Select specific policies to delete" -ForegroundColor Cyan
                        Write-Host "N - Next batch" -ForegroundColor Cyan
                        Write-Host "B - Back to main menu" -ForegroundColor Yellow
                        
                        $batchChoice = Read-Host "`nEnter choice (A/S/N/B)"
                        
                        switch ($batchChoice.ToUpper()) {
                            'A' {
                                $confirmation = Read-Host "Are you sure you want to delete ALL policies in this batch? (Y/N)"
                                if ($confirmation -eq 'Y') {
                                    $successCount = 0
                                    $failCount = 0
                                    
                                    for ($i = 0; $i -lt $currentBatch.Count; $i++) {
                                        $policy = $currentBatch[$i]
                                        Write-Host "Deleting: $($policy.DisplayName)" -ForegroundColor Cyan
                                        
                                        try {
                                            # Try standard cmdlet first
                                            try {
                                                Remove-MgDeviceManagementDeviceCompliancePolicy -DeviceCompliancePolicyId $policy.Id -ErrorAction Stop
                                            }
                                            catch {
                                                # Fall back to REST API
                                                $uri = "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies/$($policy.Id)"
                                                Invoke-MgGraphRequest -Uri $uri -Method DELETE -ErrorAction Stop
                                            }
                                            
                                            Write-Host "  Successfully deleted!" -ForegroundColor Green
                                            $successCount++
                                        }
                                        catch {
                                            Write-Host "  Failed to delete`:" -ForegroundColor Red
                                            Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
                                            $failCount++
                                        }
                                    }
                                    
                                    Write-Host "`nDeletion Summary:" -ForegroundColor Magenta
                                    Write-Host "Successfully deleted: $successCount" -ForegroundColor Green
                                    if ($failCount -gt 0) {
                                        Write-Host "Failed to delete: $failCount" -ForegroundColor Red
                                    }
                                    
                                    Read-Host "Press Enter to continue..."
                                    
                                    # Refresh policies after deletion
                                    try {
                                        # Use a more reliable approach to get policies
                                        try {
                                            # First try with standard cmdlet
                                            $allPolicies = @(Get-MgDeviceManagementDeviceCompliancePolicy -All -ErrorAction Stop)
                                        }
                                        catch {
                                            # Alternative approach using REST API directly
                                            $uri = "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies"
                                            $response = Invoke-MgGraphRequest -Uri $uri -Method GET -ErrorAction Stop
                                            $allPolicies = @($response.value)
                                            
                                            # If we have more pages, get them
                                            while ($response.'@odata.nextLink') {
                                                $response = Invoke-MgGraphRequest -Uri $response.'@odata.nextLink' -Method GET -ErrorAction Stop
                                                $allPolicies += $response.value
                                            }
                                        }
                                        
                                        # Apply device type filter if not "All"
                                        if ($DeviceTypeFilter -ne "All") {
                                            $filteredPolicies = @()
                                            
                                            foreach ($policy in $allPolicies) {
                                                $includePolicy = $false
                                                
                                                # Check policy name and properties for device type indicators
                                                if ($policy.DisplayName -match $DeviceTypeFilter -or 
                                                    ($policy.Description -and $policy.Description -match $DeviceTypeFilter)) {
                                                    $includePolicy = $true
                                                }
                                                
                                                # Check platform-specific properties
                                                switch ($DeviceTypeFilter) {
                                                    "Windows" {
                                                        if (($policy.AdditionalProperties -and 
                                                             ($policy.AdditionalProperties.ContainsKey("windows10CompliancePolicy") -or 
                                                              $policy.AdditionalProperties.ContainsKey("windows81CompliancePolicy"))) -or
                                                            ($policy.'@odata.type' -and $policy.'@odata.type' -match "windows") -or
                                                            ($policy.ODataType -and $policy.ODataType -match "windows")) {
                                                            $includePolicy = $true
                                                        }
                                                    }
                                                    "macOS" {
                                                        if (($policy.AdditionalProperties -and 
                                                             $policy.AdditionalProperties.ContainsKey("macOSCompliancePolicy")) -or
                                                            ($policy.'@odata.type' -and $policy.'@odata.type' -match "macOS") -or
                                                            ($policy.ODataType -and $policy.ODataType -match "macOS")) {
                                                            $includePolicy = $true
                                                        }
                                                    }
                                                    "iOS" {
                                                        if (($policy.AdditionalProperties -and 
                                                             $policy.AdditionalProperties.ContainsKey("iosCompliancePolicy")) -or
                                                            ($policy.'@odata.type' -and $policy.'@odata.type' -match "ios") -or
                                                            ($policy.ODataType -and $policy.ODataType -match "ios")) {
                                                            $includePolicy = $true
                                                        }
                                                    }
                                                    "Android" {
                                                        if (($policy.AdditionalProperties -and 
                                                             ($policy.AdditionalProperties.ContainsKey("androidCompliancePolicy") -or 
                                                              $policy.AdditionalProperties.ContainsKey("androidWorkProfileCompliancePolicy"))) -or
                                                            ($policy.'@odata.type' -and $policy.'@odata.type' -match "android") -or
                                                            ($policy.ODataType -and $policy.ODataType -match "android")) {
                                                            $includePolicy = $true
                                                        }
                                                    }
                                                }
                                                
                                                if ($includePolicy) {
                                                    $filteredPolicies += $policy
                                                }
                                            }
                                            
                                            $policies = $filteredPolicies
                                        }
                                        else {
                                            $policies = $allPolicies
                                        }
                                        
                                        $totalPolicies = $policies.Count
                                        
                                        if ($totalPolicies -eq 0) {
                                            Write-Host "No policies left matching the current filter." -ForegroundColor Green
                                            Read-Host "Press Enter to continue..."
                                            $processingBatches = $false
                                        }
                                    }
                                    catch {
                                        Write-Host "Error refreshing policies`:" -ForegroundColor Red
                                        Write-Host $_.Exception.Message -ForegroundColor Red
                                    }
                                }
                            }
                            'S' {
                                $selectionInput = Read-Host "Enter policy numbers to delete (comma-separated, e.g., 1,3,5)"
                                
                                # Parse the selection
                                $selectedIndices = @()
                                $selectionInput -split ',' | ForEach-Object {
                                    $index = $_.Trim()
                                    if ($index -match '^\d+$') {
                                        $numericIndex = [int]$index - 1
                                        if ($numericIndex -ge 0 -and $numericIndex -lt $currentBatch.Count) {
                                            $selectedIndices += $numericIndex
                                        }
                                        else {
                                            Write-Host "Invalid selection: $($index). Ignoring." -ForegroundColor Yellow
                                        }
                                    }
                                    elseif ($index -match '^(\d+)-(\d+)$') {
                                        $start = [int]$Matches[1] - 1
                                        $end = [int]$Matches[2] - 1
                                        if ($start -ge 0 -and $end -lt $currentBatch.Count -and $start -le $end) {
                                            $start..$end | ForEach-Object { $selectedIndices += $_ }
                                        }
                                        else {
                                            Write-Host "Invalid range: $index. Ignoring." -ForegroundColor Yellow
                                        }
                                    }
                                }
                                
                                # Remove duplicates
                                $selectedIndices = $selectedIndices | Select-Object -Unique | Sort-Object
                                
                                if ($selectedIndices.Count -eq 0) {
                                    Write-Host "No valid selections made." -ForegroundColor Yellow
                                }
                                else {
                                    Write-Host "`n===== SELECTED POLICIES TO DELETE =====" -ForegroundColor Yellow
                                    for ($i = 0; $i -lt $selectedIndices.Count; $i++) {
                                        $policy = $currentBatch[$selectedIndices[$i]]
                                        Write-Host " $($i+1). $($policy.DisplayName)" -ForegroundColor Cyan
                                    }
                                    
                                    $confirmation = Read-Host "`nAre you sure you want to delete these $($selectedIndices.Count) policies? (Y/N)"
                                    if ($confirmation -eq 'Y') {
                                        $successCount = 0
                                        $failCount = 0
                                        
                                        foreach ($index in $selectedIndices) {
                                            $policy = $currentBatch[$index]
                                            Write-Host "Deleting: $($policy.DisplayName)" -ForegroundColor Cyan
                                            
                                            try {
                                                # Try standard cmdlet first
                                                try {
                                                    Remove-MgDeviceManagementDeviceCompliancePolicy -DeviceCompliancePolicyId $policy.Id -ErrorAction Stop
                                                }
                                                catch {
                                                    # Fall back to REST API
                                                    $uri = "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies/$($policy.Id)"
                                                    Invoke-MgGraphRequest -Uri $uri -Method DELETE -ErrorAction Stop
                                                }
                                                
                                                Write-Host "  Successfully deleted!" -ForegroundColor Green
                                                $successCount++
                                            }
                                            catch {
                                                Write-Host "  Failed to delete`:" -ForegroundColor Red
                                                Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
                                                $failCount++
                                            }
                                        }
                                        
                                        Write-Host "`nDeletion Summary:" -ForegroundColor Magenta
                                        Write-Host "Successfully deleted: $successCount" -ForegroundColor Green
                                        if ($failCount -gt 0) {
                                            Write-Host "Failed to delete: $failCount" -ForegroundColor Red
                                        }
                                        
                                        Read-Host "Press Enter to continue..."
                                        
                                        # Refresh policies after deletion
                                        try {
                                            # Use a more reliable approach to get policies
                                            try {
                                                # First try with standard cmdlet
                                                $allPolicies = @(Get-MgDeviceManagementDeviceCompliancePolicy -All -ErrorAction Stop)
                                            }
                                            catch {
                                                # Alternative approach using REST API directly
                                                $uri = "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies"
                                                $response = Invoke-MgGraphRequest -Uri $uri -Method GET -ErrorAction Stop
                                                $allPolicies = @($response.value)
                                                
                                                # If we have more pages, get them
                                                while ($response.'@odata.nextLink') {
                                                    $response = Invoke-MgGraphRequest -Uri $response.'@odata.nextLink' -Method GET -ErrorAction Stop
                                                    $allPolicies += $response.value
                                                }
                                            }
                                            
                                            # Apply device type filter if not "All"
                                            if ($DeviceTypeFilter -ne "All") {
                                                $filteredPolicies = @()
                                                
                                                foreach ($policy in $allPolicies) {
                                                    $includePolicy = $false
                                                    
                                                    # Check policy name and properties for device type indicators
                                                    if ($policy.DisplayName -match $DeviceTypeFilter -or 
                                                        ($policy.Description -and $policy.Description -match $DeviceTypeFilter)) {
                                                        $includePolicy = $true
                                                    }
                                                    
                                                    # Check platform-specific properties
                                                    switch ($DeviceTypeFilter) {
                                                        "Windows" {
                                                            if (($policy.AdditionalProperties -and 
                                                                 ($policy.AdditionalProperties.ContainsKey("windows10CompliancePolicy") -or 
                                                                  $policy.AdditionalProperties.ContainsKey("windows81CompliancePolicy"))) -or
                                                                ($policy.'@odata.type' -and $policy.'@odata.type' -match "windows") -or
                                                                ($policy.ODataType -and $policy.ODataType -match "windows")) {
                                                                $includePolicy = $true
                                                            }
                                                        }
                                                        "macOS" {
                                                            if (($policy.AdditionalProperties -and 
                                                                 $policy.AdditionalProperties.ContainsKey("macOSCompliancePolicy")) -or
                                                                ($policy.'@odata.type' -and $policy.'@odata.type' -match "macOS") -or
                                                                ($policy.ODataType -and $policy.ODataType -match "macOS")) {
                                                                $includePolicy = $true
                                                            }
                                                        }
                                                        "iOS" {
                                                            if (($policy.AdditionalProperties -and 
                                                                 $policy.AdditionalProperties.ContainsKey("iosCompliancePolicy")) -or
                                                                ($policy.'@odata.type' -and $policy.'@odata.type' -match "ios") -or
                                                                ($policy.ODataType -and $policy.ODataType -match "ios")) {
                                                                $includePolicy = $true
                                                            }
                                                        }
                                                        "Android" {
                                                            if (($policy.AdditionalProperties -and 
                                                                 ($policy.AdditionalProperties.ContainsKey("androidCompliancePolicy") -or 
                                                                  $policy.AdditionalProperties.ContainsKey("androidWorkProfileCompliancePolicy"))) -or
                                                                ($policy.'@odata.type' -and $policy.'@odata.type' -match "android") -or
                                                                ($policy.ODataType -and $policy.ODataType -match "android")) {
                                                                $includePolicy = $true
                                                            }
                                                        }
                                                    }
                                                    
                                                    if ($includePolicy) {
                                                        $filteredPolicies += $policy
                                                    }
                                                }
                                                
                                                $policies = $filteredPolicies
                                            }
                                            else {
                                                $policies = $allPolicies
                                            }
                                            
                                            $totalPolicies = $policies.Count
                                            
                                            if ($totalPolicies -eq 0) {
                                                Write-Host "No policies left matching the current filter." -ForegroundColor Green
                                                Read-Host "Press Enter to continue..."
                                                $processingBatches = $false
                                            }
                                        }
                                        catch {
                                            Write-Host "Error refreshing policies`:" -ForegroundColor Red
                                            Write-Host $_.Exception.Message -ForegroundColor Red
                                        }
                                    }
                                }
                            }
                            'N' { 
                                $currentIndex += $BatchSize 
                                if ($currentIndex -ge $totalPolicies) {
                                    $currentIndex = 0
                                }
                            }
                            'B' { 
                                $processingBatches = $false 
                            }
                            default { 
                                Write-Host "Invalid choice. Please try again." -ForegroundColor Yellow 
                            }
                        }
                    }
                }
                catch {
                    Write-Host "Error retrieving policies`:" -ForegroundColor Red
                    Write-Host $_.Exception.Message -ForegroundColor Red
                    Read-Host "Press Enter to continue..."
                }
            }
            '3' { 
                # Change batch size
                Write-Host "`n===== BATCH PROCESSING SETTINGS =====" -ForegroundColor Magenta
                Write-Host "1. Process individually (1 policy per batch)" -ForegroundColor Cyan
                Write-Host "2. Small batches (10 policies)" -ForegroundColor Cyan
                Write-Host "3. Medium batches (20 policies)" -ForegroundColor Cyan
                Write-Host "4. Large batches (50 policies)" -ForegroundColor Cyan
                Write-Host "5. Process ALL policies at once (Use with caution!)" -ForegroundColor Yellow
                
                $batchChoice = Read-Host "`nSelect batch size (1-5)"
                
                switch ($batchChoice) {
                    '1' { $BatchSize = 1 }
                    '2' { $BatchSize = 10 }
                    '3' { $BatchSize = 20 }
                    '4' { $BatchSize = 50 }
                    '5' {
                        $confirm = Read-Host "WARNING: This will process ALL policies at once. Are you sure? (Y/N)"
                        if ($confirm -eq 'Y') {
                            $BatchSize = -1
                        }
                        else {
                            $BatchSize = 10
                            Write-Host "Defaulting to small batches (10 policies)." -ForegroundColor Cyan
                        }
                    }
                    default {
                        $BatchSize = 10
                        Write-Host "Invalid choice. Defaulting to small batches (10 policies)." -ForegroundColor Yellow
                    }
                }
                
                Write-Host "Batch size set to: $(if($BatchSize -eq -1){"ALL"}else{$BatchSize})" -ForegroundColor Green
            }
            '4' { 
                # Change device type filter
                Write-Host "`n===== DEVICE TYPE FILTER =====" -ForegroundColor Magenta
                Write-Host "1. All Device Types" -ForegroundColor Cyan
                Write-Host "2. Windows Only" -ForegroundColor Cyan
                Write-Host "3. macOS Only" -ForegroundColor Cyan
                Write-Host "4. iOS Only" -ForegroundColor Cyan
                Write-Host "5. Android Only" -ForegroundColor Cyan
                
                $filterChoice = Read-Host "`nSelect device type filter (1-5)"
                
                switch ($filterChoice) {
                    '1' { $DeviceTypeFilter = "All" }
                    '2' { $DeviceTypeFilter = "Windows" }
                    '3' { $DeviceTypeFilter = "macOS" }
                    '4' { $DeviceTypeFilter = "iOS" }
                    '5' { $DeviceTypeFilter = "Android" }
                    default {
                        $DeviceTypeFilter = "All"
                        Write-Host "Invalid choice. Defaulting to All Device Types." -ForegroundColor Yellow
                    }
                }
                
                Write-Host "Device type filter set to: $DeviceTypeFilter" -ForegroundColor Green
            }
            '5' { 
                # Re-authenticate
                Write-Host "`n===== AUTHENTICATION OPTIONS =====" -ForegroundColor Magenta
                Write-Host "1. Interactive Browser Authentication" -ForegroundColor Cyan
                Write-Host "2. Device Code Authentication" -ForegroundColor Cyan
                Write-Host "3. Cancel" -ForegroundColor Yellow
                
                $authChoice = Read-Host "`nSelect authentication method (1-3)"
                
                if ($authChoice -eq '3') {
                    Write-Host "Authentication cancelled." -ForegroundColor Yellow
                    continue
                }
                
                # Clear any existing connections
                Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
                
                try {
                    switch ($authChoice) {
                        '1' {
                            Write-Host "Initiating interactive browser authentication..." -ForegroundColor Cyan
                            Write-Host "A browser window will open. Please sign in with your credentials." -ForegroundColor Cyan
                            
                            # Use Connect-MgGraph with explicit scopes
                            Connect-MgGraph -Scopes $scopes -UseDeviceAuthentication:$false -ErrorAction Stop
                            
                            # Update stored auth method
                            $authMethod = '1'
                        }
                        '2' {
                            Write-Host "Initiating device code authentication..." -ForegroundColor Cyan
                            Write-Host "You will be provided with a code to enter in a browser." -ForegroundColor Cyan
                            
                            # Use device code flow with explicit scopes
                            Connect-MgGraph -Scopes $scopes -UseDeviceAuthentication -ErrorAction Stop
                            
                            # Update stored auth method
                            $authMethod = '2'
                        }
                        default {
                            Write-Host "Invalid choice. Defaulting to interactive browser authentication." -ForegroundColor Yellow
                            Connect-MgGraph -Scopes $scopes -UseDeviceAuthentication:$false -ErrorAction Stop
                            
                            # Update stored auth method
                            $authMethod = '1'
                        }
                    }
                    
                    # Verify connection and token
                    $context = Get-MgContext
                    if (-not $context) {
                        throw "Failed to get Microsoft Graph context after authentication."
                    }
                    
                    Write-Host "Authentication successful!" -ForegroundColor Green
                    Write-Host "Connected as: $($context.Account)" -ForegroundColor Green
                    Write-Host "Scopes: $($context.Scopes -join ', ')" -ForegroundColor Cyan
                    
                    # Verify required permissions
                    $requiredPermissions = @(
                        "DeviceManagementConfiguration.ReadWrite.All",
                        "DeviceManagementApps.ReadWrite.All"
                    )
                    
                    $missingPermissions = @()
                    foreach ($permission in $requiredPermissions) {
                        if ($context.Scopes -notcontains $permission) {
                            $missingPermissions += $permission
                        }
                    }
                    
                    if ($missingPermissions.Count -gt 0) {
                        Write-Host "Warning: Missing required permissions:" -ForegroundColor Yellow
                        foreach ($permission in $missingPermissions) {
                            Write-Host " - $permission" -ForegroundColor Yellow
                        }
                        Write-Host "Some functionality may not work correctly." -ForegroundColor Yellow
                    }
                }
                catch {
                    Write-Host "Authentication failed`:" -ForegroundColor Red
                    Write-Host $_.Exception.Message -ForegroundColor Red
                }
            }
            '6' { $exit = $true }
            default { Write-Host "Invalid choice. Please try again." -ForegroundColor Yellow }
        }
    }
}
catch {
    Write-Host "An unexpected error occurred`:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.Exception.StackTrace) {
        Write-Host "Stack trace`:" -ForegroundColor Red
        Write-Host $_.Exception.StackTrace -ForegroundColor Red
    }
}
finally {
    # Clean up
    Write-Host "Disconnecting from Microsoft Graph..." -ForegroundColor Cyan
    try {
        Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
    }
    catch {
        # Ignore errors during disconnect
    }
    Write-Host "Script completed. Thank you for using the Intune Policy Management Tool!" -ForegroundColor Green
}
