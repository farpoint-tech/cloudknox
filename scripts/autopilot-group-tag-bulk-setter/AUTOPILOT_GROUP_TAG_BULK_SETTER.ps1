<#
.SYNOPSIS
    Sets Group Tags for Windows Autopilot devices without existing tags.

.DESCRIPTION
    This script connects to the Microsoft Graph API and sets Group Tags
    for all Autopilot devices that do not yet have a tag.

    Group Tags are used in Intune for automatic assignment of
    deployment profiles.

    Supports environments with more than 1000 devices through full
    pagination (processing all pages via @odata.nextLink).
    Writes a persistent log file and exports results as CSV.

.PARAMETER GroupTag
    The Group Tag to set (e.g. "userdriven", "selfenrollment").

.PARAMETER Test
    Performs a dry run without making real changes.

.PARAMETER LogPath
    Path for the log file (default: .\Logs\AutopilotGroupTag_<date>.log).

.PARAMETER ExportCsv
    Path for the CSV export of results (default: .\Logs\AutopilotGroupTag_<date>.csv).

.EXAMPLE
    .\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1 -Test
    Shows which devices would receive a tag.

.EXAMPLE
    .\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1 -GroupTag "userdriven"
    Sets the tag "userdriven" for all devices without a tag.

.EXAMPLE
    .\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1 -GroupTag "selfenrollment" -LogPath "C:\Logs\autopilot.log"
    Sets the tag and writes the log to the specified path.

.NOTES
    Requires:
    - Microsoft.Graph.Authentication PowerShell module
    - Intune Administrator or Global Administrator permission
    - Internet connection for Graph API

    Changes become visible in Intune after 5-15 minutes.

    Version: 2.0
    Created: 2024
    Updated: 2026-04-17 - Full English translation
#>

param(
    [Parameter(HelpMessage="Group Tag to set")]
    [string]$GroupTag,

    [Parameter(HelpMessage="Test mode without real changes")]
    [switch]$Test,

    [Parameter(HelpMessage="Path for the log file")]
    [string]$LogPath,

    [Parameter(HelpMessage="Path for the CSV export")]
    [string]$ExportCsv
)

#Requires -Modules Microsoft.Graph.Authentication

# ===== PREPARE LOG DIRECTORY =====
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logDir = Join-Path $PSScriptRoot "Logs"

if (-not (Test-Path $logDir)) {
    New-Item -Path $logDir -ItemType Directory -Force | Out-Null
}

if (-not $LogPath) {
    $LogPath = Join-Path $logDir "AutopilotGroupTag_$timestamp.log"
}
if (-not $ExportCsv) {
    $ExportCsv = Join-Path $logDir "AutopilotGroupTag_$timestamp.csv"
}

# ===== LOGGING FUNCTION =====
function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("INFO", "WARN", "ERROR", "SUCCESS")]
        [string]$Level = "INFO"
    )
    $entry = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Message"
    Add-Content -Path $LogPath -Value $entry -Encoding UTF8

    $color = switch ($Level) {
        "SUCCESS" { "Green" }
        "WARN"    { "Yellow" }
        "ERROR"   { "Red" }
        default   { "Cyan" }
    }
    Write-Host $entry -ForegroundColor $color
}

# ===== SCRIPT START =====
Write-Host "=== AUTOPILOT GROUP TAG SETTER ===" -ForegroundColor White -BackgroundColor Blue
Write-Host "Sets Group Tags for Autopilot devices without existing tags`n" -ForegroundColor Cyan
Write-Log "Script started | Test mode: $($Test.IsPresent) | LogFile: $LogPath"

# Connect to Graph API
Write-Log "Connecting to Microsoft Graph..."
try {
    Import-Module Microsoft.Graph.Authentication -Force

    $requiredScopes = @(
        "DeviceManagementServiceConfig.ReadWrite.All"
    )

    Connect-MgGraph -Scopes $requiredScopes -NoWelcome

    $context = Get-MgContext
    Write-Log "Connected as: $($context.Account) | Tenant: $($context.TenantId)" "SUCCESS"
}
catch {
    Write-Log "ERROR connecting to Graph: $($_.Exception.Message)" "ERROR"
    Write-Host "Make sure you have Intune Administrator rights." -ForegroundColor Yellow
    exit 1
}

# Determine Group Tag parameter
if (-not $GroupTag) {
    Write-Host "`n=== GROUP TAG SELECTION ===" -ForegroundColor White -BackgroundColor DarkGreen
    Write-Host "Available standard tags:"
    Write-Host "1 = userdriven    (For User-Driven Autopilot)"
    Write-Host "2 = selfenrollment (For Self-Deployment)"
    Write-Host "3 = Enter custom tag"

    do {
        $wahl = Read-Host "`nYour choice (1, 2 or 3)"
    } while ($wahl -notin @("1", "2", "3"))

    switch ($wahl) {
        "1" { $GroupTag = "userdriven" }
        "2" { $GroupTag = "selfenrollment" }
        "3" {
            do {
                $GroupTag = Read-Host "Enter your Group Tag"
            } while ([string]::IsNullOrWhiteSpace($GroupTag))
        }
    }

    Write-Log "Selected Group Tag: '$GroupTag'" "SUCCESS"
} else {
    Write-Log "Group Tag via parameter: '$GroupTag'"
}

# ===== LOAD ALL DEVICES WITH PAGINATION =====
Write-Host "`n=== LOADING DEVICES ===" -ForegroundColor White -BackgroundColor DarkGreen
Write-Log "Loading all Windows Autopilot devices (with pagination)..."

$allDevices = [System.Collections.Generic.List[object]]::new()

try {
    $nextUri = "https://graph.microsoft.com/v1.0/deviceManagement/windowsAutopilotDeviceIdentities"
    $pageNumber = 0

    while ($nextUri) {
        $pageNumber++
        Write-Log "Loading page $pageNumber ($($allDevices.Count) devices so far)..."

        $response = Invoke-MgGraphRequest -Method GET -Uri $nextUri

        if ($response.value) {
            foreach ($device in $response.value) {
                $allDevices.Add($device)
            }
        }

        # Check for next page
        $nextUri = if ($response.'@odata.nextLink') { $response.'@odata.nextLink' } else { $null }
    }

    if ($allDevices.Count -eq 0) {
        Write-Log "No Autopilot devices found." "WARN"
        Write-Host "Are any devices registered in Autopilot?" -ForegroundColor Yellow
        exit 1
    }

    Write-Log "$($allDevices.Count) Autopilot device(s) found across $pageNumber page(s)." "SUCCESS"
}
catch {
    Write-Log "ERROR loading devices: $($_.Exception.Message)" "ERROR"
    exit 1
}

# Filter devices without Group Tag
$devicesWithoutTag = $allDevices | Where-Object { [string]::IsNullOrEmpty($_.groupTag) }
$devicesWithTag    = $allDevices | Where-Object { -not [string]::IsNullOrEmpty($_.groupTag) }

# Display overview
Write-Host "`n=== DEVICE OVERVIEW ===" -ForegroundColor White -BackgroundColor DarkGreen
Write-Log "Total: $($allDevices.Count) | With tag: $($devicesWithTag.Count) | Without tag: $($devicesWithoutTag.Count)"
Write-Host "Total devices:    $($allDevices.Count)"
Write-Host "With Group Tag:   $($devicesWithTag.Count)" -ForegroundColor Green
Write-Host "Without Group Tag:$($devicesWithoutTag.Count)" -ForegroundColor $(if ($devicesWithoutTag.Count -gt 0) { "Yellow" } else { "Green" })

if ($devicesWithoutTag.Count -eq 0) {
    Write-Log "All devices already have Group Tags. No action required." "SUCCESS"
    Write-Host "`n✓ All devices already have Group Tags!" -ForegroundColor Green
    exit 0
}

# List devices without tag
Write-Host "`nDevices WITHOUT Group Tag:" -ForegroundColor Yellow
foreach ($device in $devicesWithoutTag) {
    Write-Host "  • $($device.serialNumber) - $($device.model)" -ForegroundColor Gray
}

# Confirmation for real changes
if (-not $Test) {
    Write-Host "`n=== CONFIRMATION REQUIRED ===" -ForegroundColor White -BackgroundColor Red
    Write-Host "⚠️  WARNING: Real changes will be made!" -ForegroundColor Red
    Write-Host "Group Tag '$GroupTag' will be set for $($devicesWithoutTag.Count) device(s)." -ForegroundColor Yellow

    do {
        $confirmation = Read-Host "`nProceed? Type 'YES' to confirm or 'NO' to cancel"
        $confirmation = $confirmation.ToUpper()
    } while ($confirmation -notin @("YES", "NO"))

    if ($confirmation -eq "NO") {
        Write-Log "Operation cancelled by user." "WARN"
        Write-Host "✓ Operation cancelled." -ForegroundColor Cyan
        exit 0
    }
    Write-Log "User confirmed changes."
}

# ===== SET GROUP TAGS =====
Write-Host "`n=== SETTING GROUP TAGS ===" -ForegroundColor White -BackgroundColor DarkGreen
if ($Test) {
    Write-Log "TEST MODE active: no real changes." "WARN"
    Write-Host "🧪 TEST MODE: No real changes!" -ForegroundColor Magenta
} else {
    Write-Log "Starting assignment of Group Tag '$GroupTag'..."
    Write-Host "⚙️  Setting Group Tags..." -ForegroundColor Yellow
}

$successCount = 0
$errorCount   = 0
$csvResults   = [System.Collections.Generic.List[object]]::new()

foreach ($device in $devicesWithoutTag) {
    $serialNumber = $device.serialNumber
    $model        = $device.model

    if ($Test) {
        Write-Log "TEST: $serialNumber ($model) → '$GroupTag'"
        Write-Host "TEST: $serialNumber → '$GroupTag'" -ForegroundColor Magenta
        $successCount++
        $csvResults.Add([PSCustomObject]@{
            SerialNumber = $serialNumber
            Model        = $model
            GroupTag     = $GroupTag
            Status       = "TEST"
            Timestamp    = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            ErrorMessage = ""
        })
        continue
    }

    try {
        $updateUri   = "https://graph.microsoft.com/beta/deviceManagement/windowsAutopilotDeviceIdentities/$($device.id)/updateDeviceProperties"
        $requestBody = @{ groupTag = $GroupTag } | ConvertTo-Json

        Invoke-MgGraphRequest -Method POST -Uri $updateUri -Body $requestBody -ContentType "application/json"

        Write-Log "OK: $serialNumber ($model) → '$GroupTag'" "SUCCESS"
        Write-Host "✓ $serialNumber → '$GroupTag'" -ForegroundColor Green
        $successCount++

        $csvResults.Add([PSCustomObject]@{
            SerialNumber = $serialNumber
            Model        = $model
            GroupTag     = $GroupTag
            Status       = "Success"
            Timestamp    = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            ErrorMessage = ""
        })

        Start-Sleep -Milliseconds 500
    }
    catch {
        $errMsg = $_.Exception.Message
        Write-Log "ERROR: $serialNumber - $errMsg" "ERROR"
        Write-Host "✗ ERROR: $serialNumber" -ForegroundColor Red
        Write-Host "  Reason: $errMsg" -ForegroundColor Yellow
        $errorCount++

        $csvResults.Add([PSCustomObject]@{
            SerialNumber = $serialNumber
            Model        = $model
            GroupTag     = $GroupTag
            Status       = "Error"
            Timestamp    = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            ErrorMessage = $errMsg
        })
    }
}

# ===== CSV EXPORT =====
try {
    $csvResults | Export-Csv -Path $ExportCsv -NoTypeInformation -Encoding UTF8
    Write-Log "CSV results exported: $ExportCsv" "SUCCESS"
    Write-Host "`n📄 Results exported to: $ExportCsv" -ForegroundColor Cyan
} catch {
    Write-Log "Error during CSV export: $($_.Exception.Message)" "WARN"
}

# ===== RESULT SUMMARY =====
Write-Host "`n=== RESULT ===" -ForegroundColor White -BackgroundColor Blue
Write-Log "Summary: Successful=$successCount | Errors=$errorCount | Tag='$GroupTag'"
Write-Host "✓ Successful: $successCount device(s)" -ForegroundColor Green
if ($errorCount -gt 0) {
    Write-Host "✗ Errors: $errorCount device(s)" -ForegroundColor Red
}
Write-Host "📋 Group Tag: '$GroupTag'" -ForegroundColor Cyan
Write-Host "📁 Log file:  $LogPath" -ForegroundColor Gray
Write-Host "📄 CSV export: $ExportCsv" -ForegroundColor Gray

if ($Test) {
    Write-Host "`n🧪 This was a TEST only!" -ForegroundColor Magenta
    Write-Host "Run the script without -Test to make real changes." -ForegroundColor Yellow
} elseif ($successCount -gt 0) {
    Write-Host "`n⏰ Important note:" -ForegroundColor Yellow
    Write-Host "Group Tags become visible in Intune after 5-15 minutes." -ForegroundColor Cyan
    Write-Host "Check later in the Intune portal under:" -ForegroundColor Gray
    Write-Host "Devices → Windows → Windows enrollment → Devices" -ForegroundColor Gray
}

Write-Host "`n🎉 Script completed!" -ForegroundColor Green
Write-Log "Script finished."

# ===== SCRIPT END =====
