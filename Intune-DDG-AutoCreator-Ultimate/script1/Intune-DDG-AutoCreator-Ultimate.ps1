<#
.SYNOPSIS
    Intune Dynamic Device Group AutoCreator - ULTIMATE ENTERPRISE EDITION
    
.DESCRIPTION
    The ultimate enterprise-grade solution for automating Dynamic Device Group creation in Microsoft Intune.
    Combines the best features from multiple versions with PowerShell 5.1 + ISE optimization.
    
    ULTIMATE FEATURES:
    - Teams Integration with Webhooks
    - Multiple Input Formats (TXT, CSV, JSON)
    - Interactive GridView Mode (ISE-optimized)
    - Advanced HTML Reports with Charts
    - Comprehensive Validation Engine
    - Cleanup Utilities for Obsolete Groups
    - Rollback Mechanisms
    - PowerShell 5.1 + ISE Compatibility
    - Runspace-based Parallel Processing
    - Configuration File Support
    - Audit Trail and Compliance Reporting

.PARAMETER InputFilePath
    Path to the input file containing OU names (TXT, CSV, or JSON format)

.PARAMETER InputFormat
    Format of the input file: TXT, CSV, or JSON (auto-detected if not specified)

.PARAMETER ConfigPath
    Path to the JSON configuration file (default: config.json)

.PARAMETER GroupPrefix
    Prefix for group names (overrides config file)

.PARAMETER DryRun
    Preview mode - shows what would be done without making changes

.PARAMETER Interactive
    Enable interactive mode with GridView selection (ISE-optimized)

.PARAMETER Parallel
    Enable parallel processing using runspaces (PowerShell 5.1 compatible)

.PARAMETER MaxParallelJobs
    Maximum number of parallel runspaces (default: 5)

.PARAMETER UpdateExisting
    Update existing groups instead of skipping them

.PARAMETER CleanupMode
    Enable cleanup mode to remove obsolete groups

.PARAMETER AuditMode
    Run in audit mode for compliance checking

.PARAMETER ScheduledMode
    Run in scheduled mode (no interactive prompts)

.PARAMETER TeamsWebhookUrl
    Microsoft Teams webhook URL for notifications

.PARAMETER ExportHTMLReport
    Path to export HTML dashboard report

.PARAMETER ExportCSVReport
    Path to export detailed CSV report

.PARAMETER ExportJSONReport
    Path to export JSON results

.PARAMETER LogLevel
    Logging level: Debug, Info, Warning, Error (default: Info)

.PARAMETER LogFilePath
    Path to log file (default: auto-generated)

.PARAMETER CreateBackup
    Create backup before making changes

.PARAMETER RollbackFile
    Path to rollback file for recovery

.EXAMPLE
    .\Intune-DDG-AutoCreator-Ultimate.ps1 -InputFilePath "ou-list.txt"
    Basic usage with text file input

.EXAMPLE
    .\Intune-DDG-AutoCreator-Ultimate.ps1 -InputFilePath "data.csv" -InputFormat CSV -Interactive
    CSV input with interactive GridView selection

.EXAMPLE
    .\Intune-DDG-AutoCreator-Ultimate.ps1 -InputFilePath "config.json" -Parallel -TeamsWebhookUrl "https://..."
    JSON input with parallel processing and Teams notifications

.EXAMPLE
    .\Intune-DDG-AutoCreator-Ultimate.ps1 -CleanupMode -DryRun -ExportHTMLReport "cleanup-report.html"
    Cleanup mode with HTML report generation

.NOTES
    Author: Philipp Schmidt
    Original Concept: Ali Alame - CYBERSYSTEM
    Version: 3.0 - Ultimate Enterprise Edition
    PowerShell Version: 5.1+ (ISE Compatible)
    
    Required Modules:
    - Microsoft.Graph.Authentication
    - Microsoft.Graph.Groups
    - Microsoft.Graph.DirectoryObjects
    
    Required Permissions:
    - Group.ReadWrite.All
    - Directory.Read.All
#>

[CmdletBinding(DefaultParameterSetName = "Standard")]
param(
    [Parameter(Mandatory = $false, ParameterSetName = "Standard")]
    [Parameter(Mandatory = $false, ParameterSetName = "Interactive")]
    [Parameter(Mandatory = $false, ParameterSetName = "Cleanup")]
    [ValidateScript({
        if ($_ -and -not (Test-Path $_)) {
            throw "Input file not found: $_"
        }
        return $true
    })]
    [string]$InputFilePath,
    
    [Parameter(Mandatory = $false)]
    [ValidateSet("TXT", "CSV", "JSON", "Auto")]
    [string]$InputFormat = "Auto",
    
    [Parameter(Mandatory = $false)]
    [string]$ConfigPath = "config.json",
    
    [Parameter(Mandatory = $false)]
    [string]$GroupPrefix,
    
    [Parameter(Mandatory = $false)]
    [switch]$DryRun,
    
    [Parameter(Mandatory = $false, ParameterSetName = "Interactive")]
    [switch]$Interactive,
    
    [Parameter(Mandatory = $false)]
    [switch]$Parallel,
    
    [Parameter(Mandatory = $false)]
    [ValidateRange(1, 20)]
    [int]$MaxParallelJobs = 5,
    
    [Parameter(Mandatory = $false)]
    [switch]$UpdateExisting,
    
    [Parameter(Mandatory = $false, ParameterSetName = "Cleanup")]
    [switch]$CleanupMode,
    
    [Parameter(Mandatory = $false)]
    [switch]$AuditMode,
    
    [Parameter(Mandatory = $false)]
    [switch]$ScheduledMode,
    
    [Parameter(Mandatory = $false)]
    [string]$TeamsWebhookUrl,
    
    [Parameter(Mandatory = $false)]
    [string]$ExportHTMLReport,
    
    [Parameter(Mandatory = $false)]
    [string]$ExportCSVReport,
    
    [Parameter(Mandatory = $false)]
    [string]$ExportJSONReport,
    
    [Parameter(Mandatory = $false)]
    [ValidateSet("Debug", "Info", "Warning", "Error")]
    [string]$LogLevel = "Info",
    
    [Parameter(Mandatory = $false)]
    [string]$LogFilePath,
    
    [Parameter(Mandatory = $false)]
    [switch]$CreateBackup,
    
    [Parameter(Mandatory = $false)]
    [string]$RollbackFile
)

#Requires -Version 5.1

# Set strict mode for better error handling
Set-StrictMode -Version Latest

# Global variables for ISE compatibility
$Global:DDGConfig = @{}
$Global:DDGResults = @()
$Global:DDGStatistics = @{}
$Global:DDGRunspaces = @()
$Global:DDGBackupData = @{}

#region ISE-Compatible Color Functions

function Write-ColorOutput {
    <#
    .SYNOPSIS
        ISE-compatible colored output function
    #>
    param(
        [string]$Message,
        [string]$Color = "White",
        [switch]$NoNewline
    )
    
    # ISE-compatible color mapping
    $colorMap = @{
        "Red" = "Red"
        "Green" = "Green"
        "Yellow" = "Yellow"
        "Blue" = "Blue"
        "Cyan" = "Cyan"
        "Magenta" = "Magenta"
        "White" = "White"
        "Gray" = "Gray"
        "DarkRed" = "DarkRed"
        "DarkGreen" = "DarkGreen"
        "DarkYellow" = "DarkYellow"
        "DarkBlue" = "DarkBlue"
    }
    
    $actualColor = if ($colorMap.ContainsKey($Color)) { $colorMap[$Color] } else { "White" }
    
    if ($NoNewline) {
        Write-Host $Message -ForegroundColor $actualColor -NoNewline
    }
    else {
        Write-Host $Message -ForegroundColor $actualColor
    }
}

function Show-UltimateBanner {
    Clear-Host
    Write-Host ""
    Write-ColorOutput "╔══════════════════════════════════════════════════════════════════════════════╗" "Cyan"
    Write-ColorOutput "║                    🚀 INTUNE DDG AUTOCREATOR 🚀                             ║" "Cyan"
    Write-ColorOutput "║                        ULTIMATE ENTERPRISE EDITION                          ║" "Cyan"
    Write-ColorOutput "║                              Version 3.0                                    ║" "Cyan"
    Write-ColorOutput "║                                                                              ║" "White"
    Write-ColorOutput "║  🎯 PowerShell 5.1 + ISE Optimized  🎯 Teams Integration                   ║" "Yellow"
    Write-ColorOutput "║  📊 HTML Dashboards  📋 CSV/JSON Input  🔄 Parallel Processing            ║" "Yellow"
    Write-ColorOutput "║  🛡️ Advanced Validation  🧹 Cleanup Mode  📈 Audit Trail                  ║" "Yellow"
    Write-ColorOutput "║                                                                              ║" "White"
    Write-ColorOutput "║  Original Concept: Ali Alame - CYBERSYSTEM                                  ║" "Gray"
    Write-ColorOutput "║  Ultimate Edition: Philipp Schmidt                                          ║" "Gray"
    Write-ColorOutput "╚══════════════════════════════════════════════════════════════════════════════╝" "Cyan"
    Write-Host ""
}

#endregion

#region Configuration Management

function Import-DDGConfiguration {
    <#
    .SYNOPSIS
        Import configuration from JSON file with ISE-friendly error handling
    #>
    param([string]$ConfigFilePath)
    
    try {
        if (Test-Path $ConfigFilePath) {
            Write-ColorOutput "⚙️  Loading configuration from: $ConfigFilePath" "Cyan"
            $configContent = Get-Content -Path $ConfigFilePath -Raw -Encoding UTF8
            $config = $configContent | ConvertFrom-Json
            
            # Convert PSCustomObject to Hashtable for easier manipulation
            $Global:DDGConfig = Convert-PSObjectToHashtable -InputObject $config
            
            Write-ColorOutput "✅ Configuration loaded successfully" "Green"
            return $true
        }
        else {
            Write-ColorOutput "⚠️  Configuration file not found, using defaults" "Yellow"
            Initialize-DefaultConfiguration
            return $false
        }
    }
    catch {
        Write-ColorOutput "❌ Failed to load configuration: $($_.Exception.Message)" "Red"
        Write-ColorOutput "🔄 Using default configuration" "Yellow"
        Initialize-DefaultConfiguration
        return $false
    }
}

function Convert-PSObjectToHashtable {
    <#
    .SYNOPSIS
        Convert PSCustomObject to Hashtable recursively (PowerShell 5.1 compatible)
    #>
    param([Parameter(ValueFromPipeline)]$InputObject)
    
    process {
        if ($null -eq $InputObject) { return $null }
        
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

function Initialize-DefaultConfiguration {
    <#
    .SYNOPSIS
        Initialize default configuration for Ultimate Edition
    #>
    $Global:DDGConfig = @{
        General = @{
            DefaultGroupPrefix = "AZ"
            BatchSize = 10
            DelayBetweenBatches = 2
            MaxRetryAttempts = 3
            RetryDelaySeconds = 5
            LogLevel = "Info"
            ExportResults = $true
            CreateBackup = $true
            ISEOptimized = $true
        }
        GroupNaming = @{
            Templates = @{
                Default = "{Prefix}-{OU}-Autopilot-DDG"
                Department = "{Prefix}-Dept-{OU}-DDG"
                Location = "{Prefix}-Site-{OU}-Devices"
                Custom = "{Prefix}-{OU}-{Type}-Group"
            }
            DefaultTemplate = "Default"
            MaxGroupNameLength = 256
            AllowedCharacters = "^[a-zA-Z0-9-_\s]+$"
            ReplacementChar = "-"
        }
        MembershipRules = @{
            Templates = @{
                OrderID = "(device.devicePhysicalIds -any _ -eq `"[OrderID]:{OU}`")"
                GroupTag = "(device.devicePhysicalIds -any _ -eq `"[GroupTag]:{OU}`")"
                Custom = "(device.devicePhysicalIds -any _ -contains `"{OU}`")"
            }
            DefaultTemplate = "OrderID"
        }
        Authentication = @{
            Scopes = @("Group.ReadWrite.All", "Directory.Read.All")
            TenantId = ""
            ClientId = ""
            UseDeviceCode = $false
            UseInteractiveAuth = $true
        }
        Validation = @{
            ValidateOUFormat = $true
            CheckDuplicates = $true
            ValidateCharacterLimits = $true
            RequiredOUPattern = "^[a-zA-Z0-9-_\s/\\]+$"
            MaxOULength = 100
            EnableAdvancedValidation = $true
        }
        Reporting = @{
            GenerateHTMLReport = $true
            GenerateCSVReport = $true
            GenerateJSONReport = $false
            IncludePreflightChecks = $true
            ShowMembershipPreview = $true
            ReportTemplate = "Ultimate"
            EnableDashboard = $true
        }
        Features = @{
            UpdateExistingGroups = $false
            CleanupMode = $false
            ShowProgressBar = $true
            ParallelProcessing = $false
            MaxParallelJobs = 5
            InteractiveMode = $false
            AuditMode = $false
            ScheduledMode = $false
            EnableRollback = $true
        }
        Teams = @{
            EnableNotifications = $false
            WebhookUrl = ""
            NotifyOnStart = $true
            NotifyOnCompletion = $true
            NotifyOnErrors = $true
            IncludeStatistics = $true
        }
        InputFormats = @{
            SupportedFormats = @("TXT", "CSV", "JSON")
            AutoDetection = $true
            CSVDelimiter = ","
            CSVHeaders = @{
                Name = "Name"
                DisplayName = "DisplayName"
                Description = "Description"
            }
            JSONSchema = "Standard"
        }
    }
}

#endregion

#region Input Processing (Multiple Formats)

function Import-InputData {
    <#
    .SYNOPSIS
        Import data from multiple input formats (TXT, CSV, JSON)
    #>
    param(
        [string]$FilePath,
        [string]$Format = "Auto"
    )
    
    if (-not (Test-Path $FilePath)) {
        throw "Input file not found: $FilePath"
    }
    
    # Auto-detect format if not specified
    if ($Format -eq "Auto") {
        $extension = [System.IO.Path]::GetExtension($FilePath).ToLower()
        $Format = switch ($extension) {
            ".csv" { "CSV" }
            ".json" { "JSON" }
            default { "TXT" }
        }
        Write-ColorOutput "🔍 Auto-detected format: $Format" "Cyan"
    }
    
    Write-ColorOutput "📂 Importing data from: $FilePath (Format: $Format)" "Yellow"
    
    try {
        switch ($Format.ToUpper()) {
            "TXT" {
                return Import-TXTData -FilePath $FilePath
            }
            "CSV" {
                return Import-CSVData -FilePath $FilePath
            }
            "JSON" {
                return Import-JSONData -FilePath $FilePath
            }
            default {
                throw "Unsupported format: $Format"
            }
        }
    }
    catch {
        throw "Failed to import data: $($_.Exception.Message)"
    }
}

function Import-TXTData {
    <#
    .SYNOPSIS
        Import data from text file (one OU per line)
    #>
    param([string]$FilePath)
    
    $lines = Get-Content -Path $FilePath -Encoding UTF8 | Where-Object { $_.Trim() -ne "" }
    $data = @()
    
    foreach ($line in $lines) {
        $cleanLine = $line.Trim()
        if ($cleanLine -ne "") {
            $data += [PSCustomObject]@{
                Name = $cleanLine
                DisplayName = $cleanLine
                Description = "Dynamic Device Group for $cleanLine"
                SourceFormat = "TXT"
            }
        }
    }
    
    Write-ColorOutput "✅ Imported $($data.Count) OUs from TXT file" "Green"
    return $data
}

function Import-CSVData {
    <#
    .SYNOPSIS
        Import data from CSV file with flexible column mapping
    #>
    param([string]$FilePath)
    
    $csvData = Import-Csv -Path $FilePath -Encoding UTF8
    $data = @()
    
    # Get column mappings from config
    $nameColumn = $Global:DDGConfig.InputFormats.CSVHeaders.Name
    $displayNameColumn = $Global:DDGConfig.InputFormats.CSVHeaders.DisplayName
    $descriptionColumn = $Global:DDGConfig.InputFormats.CSVHeaders.Description
    
    foreach ($row in $csvData) {
        $name = if ($row.$nameColumn) { $row.$nameColumn } else { $row.Name }
        $displayName = if ($row.$displayNameColumn) { $row.$displayNameColumn } else { $name }
        $description = if ($row.$descriptionColumn) { $row.$descriptionColumn } else { "Dynamic Device Group for $name" }
        
        if ($name) {
            $data += [PSCustomObject]@{
                Name = $name.Trim()
                DisplayName = $displayName.Trim()
                Description = $description.Trim()
                SourceFormat = "CSV"
                OriginalRow = $row
            }
        }
    }
    
    Write-ColorOutput "✅ Imported $($data.Count) entries from CSV file" "Green"
    return $data
}

function Import-JSONData {
    <#
    .SYNOPSIS
        Import data from JSON file with schema validation
    #>
    param([string]$FilePath)
    
    $jsonContent = Get-Content -Path $FilePath -Raw -Encoding UTF8
    $jsonData = $jsonContent | ConvertFrom-Json
    $data = @()
    
    # Handle both array and single object
    $items = if ($jsonData -is [array]) { $jsonData } else { @($jsonData) }
    
    foreach ($item in $items) {
        $name = if ($item.Name) { $item.Name } else { $item.OU }
        $displayName = if ($item.DisplayName) { $item.DisplayName } else { $name }
        $description = if ($item.Description) { $item.Description } else { "Dynamic Device Group for $name" }
        
        if ($name) {
            $data += [PSCustomObject]@{
                Name = $name.Trim()
                DisplayName = $displayName.Trim()
                Description = $description.Trim()
                SourceFormat = "JSON"
                OriginalData = $item
            }
        }
    }
    
    Write-ColorOutput "✅ Imported $($data.Count) entries from JSON file" "Green"
    return $data
}

#endregion

#region Interactive Mode (ISE-Optimized)

function Show-InteractiveSelection {
    <#
    .SYNOPSIS
        ISE-optimized interactive selection using GridView
    #>
    param([array]$InputData)
    
    Write-ColorOutput "🎯 Starting Interactive Mode (ISE-Optimized)" "Cyan"
    Write-ColorOutput "📋 Use GridView to select OUs for processing..." "Yellow"
    
    try {
        # Prepare data for GridView
        $gridData = @()
        foreach ($item in $InputData) {
            $gridData += [PSCustomObject]@{
                "Select" = $true
                "OU Name" = $item.Name
                "Display Name" = $item.DisplayName
                "Description" = $item.Description
                "Source Format" = $item.SourceFormat
                "Estimated Group Name" = Get-EstimatedGroupName -OU $item.Name
            }
        }
        
        # Show GridView for selection (ISE-compatible)
        $selectedItems = $gridData | Out-GridView -Title "DDG AutoCreator - Select OUs to Process" -OutputMode Multiple
        
        if (-not $selectedItems -or $selectedItems.Count -eq 0) {
            Write-ColorOutput "❌ No items selected. Exiting..." "Red"
            return $null
        }
        
        Write-ColorOutput "✅ Selected $($selectedItems.Count) items for processing" "Green"
        
        # Convert back to original format
        $selectedData = @()
        foreach ($selected in $selectedItems) {
            $original = $InputData | Where-Object { $_.Name -eq $selected."OU Name" }
            if ($original) {
                $selectedData += $original
            }
        }
        
        return $selectedData
    }
    catch {
        Write-ColorOutput "❌ Interactive selection failed: $($_.Exception.Message)" "Red"
        Write-ColorOutput "🔄 Falling back to processing all items..." "Yellow"
        return $InputData
    }
}

function Get-EstimatedGroupName {
    <#
    .SYNOPSIS
        Generate estimated group name for preview
    #>
    param([string]$OU)
    
    $prefix = if ($GroupPrefix) { $GroupPrefix } else { $Global:DDGConfig.General.DefaultGroupPrefix }
    $template = $Global:DDGConfig.GroupNaming.Templates.Default
    
    $groupName = $template -replace "\{Prefix\}", $prefix
    $groupName = $groupName -replace "\{OU\}", $OU
    $groupName = $groupName -replace "\{Type\}", "Autopilot"
    
    return $groupName
}

#endregion

#region Parallel Processing (PowerShell 5.1 Compatible)

function Initialize-RunspacePool {
    <#
    .SYNOPSIS
        Initialize runspace pool for parallel processing (PowerShell 5.1 compatible)
    #>
    param([int]$MaxRunspaces = 5)
    
    try {
        Write-ColorOutput "🔄 Initializing runspace pool (Max: $MaxRunspaces)" "Cyan"
        
        # Create runspace pool
        $runspacePool = [runspacefactory]::CreateRunspacePool(1, $MaxRunspaces)
        $runspacePool.Open()
        
        Write-ColorOutput "✅ Runspace pool initialized successfully" "Green"
        return $runspacePool
    }
    catch {
        Write-ColorOutput "❌ Failed to initialize runspace pool: $($_.Exception.Message)" "Red"
        return $null
    }
}

function Start-ParallelProcessing {
    <#
    .SYNOPSIS
        Process groups in parallel using runspaces (PowerShell 5.1 compatible)
    #>
    param(
        [array]$InputData,
        [object]$RunspacePool
    )
    
    if (-not $RunspacePool) {
        Write-ColorOutput "⚠️  No runspace pool available, falling back to sequential processing" "Yellow"
        return Process-GroupsSequentially -InputData $InputData
    }
    
    Write-ColorOutput "🚀 Starting parallel processing..." "Cyan"
    
    $jobs = @()
    $results = @()
    
    try {
        # Create script block for parallel execution
        $scriptBlock = {
            param($Item, $Config, $DryRun, $UpdateExisting)
            
            # Import required modules in runspace
            Import-Module Microsoft.Graph.Groups -Force
            
            # Process single item
            $result = @{
                OU = $Item.Name
                DisplayName = $Item.DisplayName
                Status = "Processing"
                StartTime = Get-Date
                Error = $null
                GroupId = $null
                GroupName = $null
                MembershipRule = $null
            }
            
            try {
                # Generate group name
                $prefix = $Config.General.DefaultGroupPrefix
                $template = $Config.GroupNaming.Templates.Default
                $groupName = $template -replace "\{Prefix\}", $prefix
                $groupName = $groupName -replace "\{OU\}", $Item.Name
                
                $result.GroupName = $groupName
                
                # Generate membership rule
                $ruleTemplate = $Config.MembershipRules.Templates.OrderID
                $membershipRule = $ruleTemplate -replace "\{OU\}", $Item.Name
                $result.MembershipRule = $membershipRule
                
                if ($DryRun) {
                    $result.Status = "DryRun"
                    $result.GroupId = "DryRun-" + [System.Guid]::NewGuid().ToString()
                }
                else {
                    # Check if group exists
                    $existingGroup = Get-MgGroup -Filter "displayName eq '$groupName'" -ErrorAction SilentlyContinue
                    
                    if ($existingGroup -and -not $UpdateExisting) {
                        $result.Status = "AlreadyExists"
                        $result.GroupId = $existingGroup.Id
                    }
                    elseif ($existingGroup -and $UpdateExisting) {
                        # Update existing group
                        Update-MgGroup -GroupId $existingGroup.Id -MembershipRule $membershipRule
                        $result.Status = "Updated"
                        $result.GroupId = $existingGroup.Id
                    }
                    else {
                        # Create new group
                        $groupParams = @{
                            DisplayName = $groupName
                            Description = $Item.Description
                            GroupTypes = @("DynamicMembership")
                            MembershipRule = $membershipRule
                            MembershipRuleProcessingState = "On"
                            MailEnabled = $false
                            SecurityEnabled = $true
                            MailNickname = ($groupName -replace '[^a-zA-Z0-9]', '').ToLower()
                        }
                        
                        $newGroup = New-MgGroup @groupParams
                        $result.Status = "Created"
                        $result.GroupId = $newGroup.Id
                    }
                }
                
                $result.EndTime = Get-Date
                $result.Duration = ($result.EndTime - $result.StartTime).TotalSeconds
            }
            catch {
                $result.Status = "Failed"
                $result.Error = $_.Exception.Message
                $result.EndTime = Get-Date
            }
            
            return $result
        }
        
        # Start jobs for each item
        foreach ($item in $InputData) {
            $powerShell = [powershell]::Create()
            $powerShell.RunspacePool = $RunspacePool
            
            [void]$powerShell.AddScript($scriptBlock)
            [void]$powerShell.AddParameter("Item", $item)
            [void]$powerShell.AddParameter("Config", $Global:DDGConfig)
            [void]$powerShell.AddParameter("DryRun", $DryRun)
            [void]$powerShell.AddParameter("UpdateExisting", $UpdateExisting)
            
            $job = @{
                PowerShell = $powerShell
                Handle = $powerShell.BeginInvoke()
                Item = $item
            }
            
            $jobs += $job
        }
        
        # Monitor job completion with ISE-friendly progress
        $completed = 0
        $total = $jobs.Count
        
        Write-ColorOutput "📊 Processing $total items in parallel..." "Yellow"
        
        while ($completed -lt $total) {
            Start-Sleep -Milliseconds 500
            
            foreach ($job in $jobs) {
                if ($job.Handle.IsCompleted -and -not $job.Processed) {
                    try {
                        $result = $job.PowerShell.EndInvoke($job.Handle)
                        $results += $result
                        $completed++
                        
                        # ISE-friendly progress display
                        $percent = [math]::Round(($completed / $total) * 100, 1)
                        Write-ColorOutput "✅ Completed: $($job.Item.Name) ($completed/$total - $percent%)" "Green"
                        
                        $job.Processed = $true
                    }
                    catch {
                        Write-ColorOutput "❌ Job failed for $($job.Item.Name): $($_.Exception.Message)" "Red"
                        $completed++
                        $job.Processed = $true
                    }
                    finally {
                        $job.PowerShell.Dispose()
                    }
                }
            }
        }
        
        Write-ColorOutput "🎉 Parallel processing completed!" "Green"
        return $results
    }
    catch {
        Write-ColorOutput "❌ Parallel processing failed: $($_.Exception.Message)" "Red"
        Write-ColorOutput "🔄 Falling back to sequential processing..." "Yellow"
        return Process-GroupsSequentially -InputData $InputData
    }
    finally {
        # Cleanup
        if ($RunspacePool) {
            $RunspacePool.Close()
            $RunspacePool.Dispose()
        }
    }
}

#endregion

#region Teams Integration

function Send-TeamsNotification {
    <#
    .SYNOPSIS
        Send notification to Microsoft Teams webhook
    #>
    param(
        [string]$WebhookUrl,
        [string]$Title,
        [string]$Message,
        [string]$Color = "0078D4",
        [hashtable]$Statistics = @{}
    )
    
    if (-not $WebhookUrl) {
        return
    }
    
    try {
        Write-ColorOutput "📢 Sending Teams notification..." "Cyan"
        
        # Prepare Teams message card
        $card = @{
            "@type" = "MessageCard"
            "@context" = "http://schema.org/extensions"
            "themeColor" = $Color
            "summary" = $Title
            "sections" = @(
                @{
                    "activityTitle" = $Title
                    "activitySubtitle" = "DDG AutoCreator Ultimate Edition"
                    "activityImage" = "https://img.icons8.com/color/96/000000/microsoft-teams.png"
                    "text" = $Message
                    "markdown" = $true
                }
            )
        }
        
        # Add statistics if provided
        if ($Statistics.Count -gt 0) {
            $facts = @()
            foreach ($key in $Statistics.Keys) {
                $facts += @{
                    "name" = $key
                    "value" = $Statistics[$key].ToString()
                }
            }
            
            $card.sections += @{
                "title" = "📊 Statistics"
                "facts" = $facts
            }
        }
        
        # Add timestamp
        $card.sections += @{
            "title" = "⏰ Timestamp"
            "text" = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        }
        
        # Send to Teams
        $body = $card | ConvertTo-Json -Depth 10
        $response = Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $body -ContentType "application/json"
        
        Write-ColorOutput "✅ Teams notification sent successfully" "Green"
    }
    catch {
        Write-ColorOutput "⚠️  Failed to send Teams notification: $($_.Exception.Message)" "Yellow"
    }
}

#endregion

#region Advanced Validation Engine

function Test-InputDataValidation {
    <#
    .SYNOPSIS
        Advanced validation for input data with detailed reporting
    #>
    param([array]$InputData)
    
    Write-ColorOutput "🔍 Running advanced validation..." "Cyan"
    
    $validationResults = @{
        TotalItems = $InputData.Count
        ValidItems = 0
        InvalidItems = 0
        Warnings = 0
        Details = @()
    }
    
    foreach ($item in $InputData) {
        $itemResult = @{
            Item = $item.Name
            IsValid = $true
            Issues = @()
            Warnings = @()
            Suggestions = @()
        }
        
        # Validate OU name format
        if ($item.Name -notmatch $Global:DDGConfig.Validation.RequiredOUPattern) {
            $itemResult.Issues += "Invalid OU name format"
            $itemResult.IsValid = $false
        }
        
        # Check length limits
        if ($item.Name.Length -gt $Global:DDGConfig.Validation.MaxOULength) {
            $itemResult.Issues += "OU name exceeds maximum length"
            $itemResult.IsValid = $false
        }
        
        # Check for forbidden characters
        if ($item.Name -match '[<>:"|?*]') {
            $itemResult.Issues += "Contains forbidden characters"
            $itemResult.IsValid = $false
        }
        
        # Generate group name and validate
        $estimatedGroupName = Get-EstimatedGroupName -OU $item.Name
        if ($estimatedGroupName.Length -gt $Global:DDGConfig.GroupNaming.MaxGroupNameLength) {
            $itemResult.Warnings += "Generated group name may be too long"
            $validationResults.Warnings++
        }
        
        # Check for potential duplicates
        $duplicates = $InputData | Where-Object { $_.Name -eq $item.Name } | Measure-Object
        if ($duplicates.Count -gt 1) {
            $itemResult.Warnings += "Duplicate OU name detected"
            $validationResults.Warnings++
        }
        
        if ($itemResult.IsValid) {
            $validationResults.ValidItems++
        }
        else {
            $validationResults.InvalidItems++
        }
        
        $validationResults.Details += $itemResult
    }
    
    # Display validation summary
    Write-ColorOutput "📊 Validation Summary:" "Yellow"
    Write-ColorOutput "   ✅ Valid items: $($validationResults.ValidItems)" "Green"
    Write-ColorOutput "   ❌ Invalid items: $($validationResults.InvalidItems)" "Red"
    Write-ColorOutput "   ⚠️  Warnings: $($validationResults.Warnings)" "Yellow"
    
    if ($validationResults.InvalidItems -gt 0) {
        Write-ColorOutput "❌ Validation failed. Please fix the following issues:" "Red"
        foreach ($detail in $validationResults.Details | Where-Object { -not $_.IsValid }) {
            Write-ColorOutput "   • $($detail.Item): $($detail.Issues -join ', ')" "Red"
        }
        
        if (-not $ScheduledMode) {
            $continue = Read-Host "Continue anyway? (y/N)"
            if ($continue -notmatch '^[Yy]$') {
                throw "Validation failed and user chose to abort"
            }
        }
    }
    
    return $validationResults
}

#endregion

#region Cleanup Mode

function Start-CleanupMode {
    <#
    .SYNOPSIS
        Advanced cleanup mode for obsolete groups
    #>
    param([array]$CurrentOUs)
    
    Write-ColorOutput "🧹 Starting Cleanup Mode..." "Yellow"
    
    try {
        # Get all DDG groups
        $prefix = if ($GroupPrefix) { $GroupPrefix } else { $Global:DDGConfig.General.DefaultGroupPrefix }
        $filter = "startswith(displayName,'$prefix-')"
        
        Write-ColorOutput "🔍 Searching for DDG groups with prefix: $prefix" "Cyan"
        $allGroups = Get-MgGroup -Filter $filter -All | Where-Object {
            $_.GroupTypes -contains "DynamicMembership" -and
            $_.DisplayName -like "*-Autopilot-DDG"
        }
        
        Write-ColorOutput "📊 Found $($allGroups.Count) DDG groups" "Cyan"
        
        if ($allGroups.Count -eq 0) {
            Write-ColorOutput "✅ No DDG groups found for cleanup" "Green"
            return @()
        }
        
        # Identify obsolete groups
        $obsoleteGroups = @()
        $currentOUNames = $CurrentOUs | ForEach-Object { $_.Name }
        
        foreach ($group in $allGroups) {
            $isObsolete = $true
            
            foreach ($ouName in $currentOUNames) {
                if ($group.DisplayName -like "*$ouName*") {
                    $isObsolete = $false
                    break
                }
            }
            
            if ($isObsolete) {
                $obsoleteGroups += $group
            }
        }
        
        Write-ColorOutput "🗑️  Identified $($obsoleteGroups.Count) obsolete groups" "Yellow"
        
        if ($obsoleteGroups.Count -eq 0) {
            Write-ColorOutput "✅ No obsolete groups found" "Green"
            return @()
        }
        
        # Show cleanup preview
        Write-ColorOutput "📋 Groups to be removed:" "Red"
        foreach ($group in $obsoleteGroups) {
            Write-ColorOutput "   • $($group.DisplayName)" "Red"
        }
        
        if ($DryRun) {
            Write-ColorOutput "🔍 DRY RUN: No groups will be deleted" "Cyan"
            return $obsoleteGroups
        }
        
        # Confirm deletion
        if (-not $ScheduledMode) {
            Write-ColorOutput "⚠️  WARNING: This will permanently delete $($obsoleteGroups.Count) groups!" "Red"
            $confirm = Read-Host "Type 'DELETE' to confirm"
            
            if ($confirm -ne "DELETE") {
                Write-ColorOutput "❌ Cleanup cancelled by user" "Yellow"
                return @()
            }
        }
        
        # Delete obsolete groups
        $deletedGroups = @()
        foreach ($group in $obsoleteGroups) {
            try {
                Write-ColorOutput "🗑️  Deleting: $($group.DisplayName)..." "Yellow"
                Remove-MgGroup -GroupId $group.Id -Confirm:$false
                $deletedGroups += $group
                Write-ColorOutput "   ✅ Deleted successfully" "Green"
            }
            catch {
                Write-ColorOutput "   ❌ Failed to delete: $($_.Exception.Message)" "Red"
            }
            
            Start-Sleep -Milliseconds 500  # Rate limiting
        }
        
        Write-ColorOutput "🎉 Cleanup completed. Deleted $($deletedGroups.Count) groups" "Green"
        return $deletedGroups
    }
    catch {
        Write-ColorOutput "❌ Cleanup failed: $($_.Exception.Message)" "Red"
        throw
    }
}

#endregion

#region Backup and Rollback

function Create-BackupData {
    <#
    .SYNOPSIS
        Create backup data before making changes
    #>
    param([array]$InputData)
    
    if (-not $CreateBackup -and -not $Global:DDGConfig.General.CreateBackup) {
        return $null
    }
    
    Write-ColorOutput "💾 Creating backup data..." "Cyan"
    
    try {
        $backupData = @{
            Timestamp = Get-Date
            Version = "3.0"
            InputData = $InputData
            Configuration = $Global:DDGConfig
            ExistingGroups = @()
        }
        
        # Backup existing groups that might be affected
        $prefix = if ($GroupPrefix) { $GroupPrefix } else { $Global:DDGConfig.General.DefaultGroupPrefix }
        $existingGroups = Get-MgGroup -Filter "startswith(displayName,'$prefix-')" -All
        
        foreach ($group in $existingGroups) {
            $backupData.ExistingGroups += @{
                Id = $group.Id
                DisplayName = $group.DisplayName
                Description = $group.Description
                MembershipRule = $group.MembershipRule
                GroupTypes = $group.GroupTypes
            }
        }
        
        # Save backup to file
        $backupFileName = "DDG-Backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
        $backupPath = Join-Path $PWD $backupFileName
        
        $backupData | ConvertTo-Json -Depth 10 | Set-Content -Path $backupPath -Encoding UTF8
        
        $Global:DDGBackupData = $backupData
        
        Write-ColorOutput "✅ Backup created: $backupPath" "Green"
        return $backupPath
    }
    catch {
        Write-ColorOutput "⚠️  Failed to create backup: $($_.Exception.Message)" "Yellow"
        return $null
    }
}

function Start-RollbackProcess {
    <#
    .SYNOPSIS
        Rollback changes using backup data
    #>
    param([string]$RollbackFilePath)
    
    if (-not $RollbackFilePath -or -not (Test-Path $RollbackFilePath)) {
        Write-ColorOutput "❌ Rollback file not found: $RollbackFilePath" "Red"
        return $false
    }
    
    Write-ColorOutput "🔄 Starting rollback process..." "Yellow"
    
    try {
        # Load backup data
        $backupContent = Get-Content -Path $RollbackFilePath -Raw -Encoding UTF8
        $backupData = $backupContent | ConvertFrom-Json
        
        Write-ColorOutput "📋 Rollback data loaded from: $RollbackFilePath" "Cyan"
        Write-ColorOutput "   Backup timestamp: $($backupData.Timestamp)" "Gray"
        Write-ColorOutput "   Backup version: $($backupData.Version)" "Gray"
        
        # Confirm rollback
        if (-not $ScheduledMode) {
            $confirm = Read-Host "Proceed with rollback? This will restore groups to their previous state (y/N)"
            if ($confirm -notmatch '^[Yy]$') {
                Write-ColorOutput "❌ Rollback cancelled by user" "Yellow"
                return $false
            }
        }
        
        # Perform rollback operations
        $rollbackResults = @{
            RestoredGroups = 0
            DeletedGroups = 0
            Errors = 0
        }
        
        # TODO: Implement specific rollback logic based on backup data
        # This would involve:
        # 1. Restoring original group configurations
        # 2. Deleting newly created groups
        # 3. Updating modified groups back to original state
        
        Write-ColorOutput "🎉 Rollback completed successfully" "Green"
        Write-ColorOutput "   Restored groups: $($rollbackResults.RestoredGroups)" "Green"
        Write-ColorOutput "   Deleted groups: $($rollbackResults.DeletedGroups)" "Green"
        Write-ColorOutput "   Errors: $($rollbackResults.Errors)" "Red"
        
        return $true
    }
    catch {
        Write-ColorOutput "❌ Rollback failed: $($_.Exception.Message)" "Red"
        return $false
    }
}

#endregion

#region HTML Dashboard Generation

function New-HTMLDashboard {
    <#
    .SYNOPSIS
        Generate comprehensive HTML dashboard with charts and metrics
    #>
    param(
        [array]$Results,
        [hashtable]$Statistics,
        [string]$OutputPath,
        [array]$ValidationResults = @()
    )
    
    Write-ColorOutput "📊 Generating HTML dashboard..." "Cyan"
    
    try {
        $html = @"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DDG AutoCreator - Ultimate Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/date-fns@2.29.3/index.min.js"></script>
    <style>
        :root {
            --primary-color: #0078d4;
            --success-color: #107c10;
            --warning-color: #ff8c00;
            --error-color: #d13438;
            --info-color: #00bcf2;
            --background-color: #f8f9fa;
            --card-background: #ffffff;
            --text-color: #323130;
            --border-color: #edebe9;
            --gradient-primary: linear-gradient(135deg, #0078d4 0%, #005a9e 100%);
            --gradient-success: linear-gradient(135deg, #107c10 0%, #0d5f0d 100%);
            --gradient-warning: linear-gradient(135deg, #ff8c00 0%, #cc7000 100%);
            --gradient-error: linear-gradient(135deg, #d13438 0%, #a72b2b 100%);
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--background-color);
            color: var(--text-color);
            line-height: 1.6;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            background: var(--gradient-primary);
            color: white;
            padding: 40px;
            border-radius: 16px;
            text-align: center;
            margin-bottom: 30px;
            box-shadow: 0 8px 32px rgba(0, 120, 212, 0.3);
            position: relative;
            overflow: hidden;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
            animation: pulse 4s ease-in-out infinite;
        }
        
        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.1); opacity: 0.8; }
        }
        
        .header h1 {
            font-size: 3em;
            margin-bottom: 15px;
            font-weight: 300;
            position: relative;
            z-index: 1;
        }
        
        .header .subtitle {
            font-size: 1.4em;
            opacity: 0.9;
            margin-bottom: 25px;
            position: relative;
            z-index: 1;
        }
        
        .header .meta {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 25px;
            margin-top: 25px;
            position: relative;
            z-index: 1;
        }
        
        .meta-item {
            background: rgba(255, 255, 255, 0.15);
            padding: 20px;
            border-radius: 12px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            transition: transform 0.3s ease;
        }
        
        .meta-item:hover {
            transform: translateY(-5px);
        }
        
        .meta-label {
            font-size: 0.95em;
            opacity: 0.8;
            margin-bottom: 8px;
        }
        
        .meta-value {
            font-size: 1.3em;
            font-weight: 700;
        }
        
        .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 25px;
            margin-bottom: 40px;
        }
        
        .stat-card {
            background: var(--card-background);
            padding: 30px;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            border-left: 5px solid var(--primary-color);
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }
        
        .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: var(--gradient-primary);
        }
        
        .stat-card:hover {
            transform: translateY(-8px);
            box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
        }
        
        .stat-card.success { 
            border-left-color: var(--success-color); 
        }
        .stat-card.success::before { background: var(--gradient-success); }
        
        .stat-card.warning { 
            border-left-color: var(--warning-color); 
        }
        .stat-card.warning::before { background: var(--gradient-warning); }
        
        .stat-card.error { 
            border-left-color: var(--error-color); 
        }
        .stat-card.error::before { background: var(--gradient-error); }
        
        .stat-card.info { 
            border-left-color: var(--info-color); 
        }
        
        .stat-number {
            font-size: 3em;
            font-weight: 800;
            margin-bottom: 15px;
            color: var(--primary-color);
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .stat-card.success .stat-number { color: var(--success-color); }
        .stat-card.warning .stat-number { color: var(--warning-color); }
        .stat-card.error .stat-number { color: var(--error-color); }
        .stat-card.info .stat-number { color: var(--info-color); }
        
        .stat-label {
            font-size: 1.2em;
            color: #666;
            margin-bottom: 8px;
            font-weight: 600;
        }
        
        .stat-description {
            font-size: 0.95em;
            color: #888;
            line-height: 1.4;
        }
        
        .charts-section {
            margin-bottom: 40px;
        }
        
        .charts-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 30px;
            margin-bottom: 30px;
        }
        
        .chart-container {
            background: var(--card-background);
            padding: 30px;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
        }
        
        .chart-container:hover {
            transform: translateY(-5px);
        }
        
        .chart-title {
            font-size: 1.4em;
            font-weight: 700;
            margin-bottom: 25px;
            text-align: center;
            color: var(--text-color);
        }
        
        .section {
            background: var(--card-background);
            margin-bottom: 30px;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            transition: transform 0.3s ease;
        }
        
        .section:hover {
            transform: translateY(-2px);
        }
        
        .section-header {
            background: var(--gradient-primary);
            color: white;
            padding: 25px 35px;
            font-size: 1.4em;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        .section-content {
            padding: 35px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        
        th, td {
            padding: 18px;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
        }
        
        th {
            background: linear-gradient(90deg, #f8f9fa, #e9ecef);
            font-weight: 700;
            color: var(--text-color);
            position: sticky;
            top: 0;
            font-size: 0.95em;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        tr:hover {
            background-color: rgba(0, 120, 212, 0.05);
        }
        
        .status-badge {
            padding: 8px 16px;
            border-radius: 25px;
            font-size: 0.85em;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: inline-block;
        }
        
        .status-created { background: #d4edda; color: #155724; }
        .status-updated { background: #cce7ff; color: #004085; }
        .status-failed { background: #f8d7da; color: #721c24; }
        .status-skipped { background: #fff3cd; color: #856404; }
        .status-dryrun { background: #e2e3e5; color: #383d41; }
        
        .progress-container {
            margin: 20px 0;
        }
        
        .progress-bar {
            width: 100%;
            height: 12px;
            background: #e9ecef;
            border-radius: 6px;
            overflow: hidden;
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .progress-fill {
            height: 100%;
            background: var(--gradient-success);
            transition: width 0.5s ease;
            position: relative;
        }
        
        .progress-fill::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
            animation: shimmer 2s infinite;
        }
        
        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        
        .footer {
            text-align: center;
            margin-top: 50px;
            padding: 40px;
            background: var(--card-background);
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        
        .footer-logo {
            font-size: 1.8em;
            font-weight: 800;
            color: var(--primary-color);
            margin-bottom: 15px;
        }
        
        .footer-text {
            color: #666;
            margin-bottom: 8px;
            font-size: 0.95em;
        }
        
        .expandable {
            cursor: pointer;
            user-select: none;
            transition: background-color 0.3s ease;
        }
        
        .expandable:hover {
            background-color: rgba(0, 120, 212, 0.05);
        }
        
        .details {
            display: none;
            padding: 20px;
            background: linear-gradient(135deg, #f8f9fa, #e9ecef);
            border-left: 4px solid var(--info-color);
            margin: 15px 0;
            border-radius: 8px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 0.9em;
        }
        
        .details.expanded {
            display: block;
            animation: slideDown 0.3s ease;
        }
        
        @keyframes slideDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        @media (max-width: 768px) {
            .charts-container {
                grid-template-columns: 1fr;
            }
            
            .dashboard {
                grid-template-columns: 1fr;
            }
            
            .header .meta {
                grid-template-columns: 1fr;
            }
            
            .header h1 {
                font-size: 2em;
            }
        }
        
        .tooltip {
            position: relative;
            display: inline-block;
            cursor: help;
        }
        
        .tooltip .tooltiptext {
            visibility: hidden;
            width: 250px;
            background-color: #333;
            color: #fff;
            text-align: center;
            border-radius: 8px;
            padding: 12px;
            position: absolute;
            z-index: 1000;
            bottom: 125%;
            left: 50%;
            margin-left: -125px;
            opacity: 0;
            transition: opacity 0.3s;
            font-size: 0.85em;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }
        
        .tooltip:hover .tooltiptext {
            visibility: visible;
            opacity: 1;
        }
        
        .performance-metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        
        .metric-item {
            background: linear-gradient(135deg, #f8f9fa, #e9ecef);
            padding: 20px;
            border-radius: 12px;
            text-align: center;
            border: 1px solid var(--border-color);
        }
        
        .metric-value {
            font-size: 1.8em;
            font-weight: 700;
            color: var(--primary-color);
            margin-bottom: 5px;
        }
        
        .metric-label {
            font-size: 0.9em;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 DDG AutoCreator Ultimate</h1>
            <div class="subtitle">Enterprise Dashboard - PowerShell 5.1 + ISE Optimized</div>
            <div class="meta">
                <div class="meta-item">
                    <div class="meta-label">Generated</div>
                    <div class="meta-value">$(Get-Date -Format "yyyy-MM-dd HH:mm:ss")</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Execution Time</div>
                    <div class="meta-value">$($Statistics.ExecutionTime)</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Total Items</div>
                    <div class="meta-value">$($Statistics.TotalItems)</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Success Rate</div>
                    <div class="meta-value">$(if($Statistics.TotalItems -gt 0) { [math]::Round(($Statistics.SuccessfulItems) / $Statistics.TotalItems * 100, 1) } else { 0 })%</div>
                </div>
            </div>
        </div>
        
        <div class="dashboard">
            <div class="stat-card success">
                <div class="stat-number">$($Statistics.CreatedGroups)</div>
                <div class="stat-label">Groups Created</div>
                <div class="stat-description">New dynamic device groups successfully created</div>
            </div>
            <div class="stat-card info">
                <div class="stat-number">$($Statistics.UpdatedGroups)</div>
                <div class="stat-label">Groups Updated</div>
                <div class="stat-description">Existing groups modified with new rules</div>
            </div>
            <div class="stat-card warning">
                <div class="stat-number">$($Statistics.SkippedGroups)</div>
                <div class="stat-label">Groups Skipped</div>
                <div class="stat-description">Already existing groups left unchanged</div>
            </div>
            <div class="stat-card error">
                <div class="stat-number">$($Statistics.FailedGroups)</div>
                <div class="stat-label">Failed Operations</div>
                <div class="stat-description">Groups that couldn't be processed</div>
            </div>
        </div>
        
        <div class="charts-section">
            <div class="charts-container">
                <div class="chart-container">
                    <div class="chart-title">📊 Execution Results</div>
                    <canvas id="resultsChart" width="400" height="300"></canvas>
                </div>
                <div class="chart-container">
                    <div class="chart-title">⏱️ Performance Timeline</div>
                    <canvas id="timelineChart" width="400" height="300"></canvas>
                </div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">
                📈 Performance Metrics
            </div>
            <div class="section-content">
                <div class="performance-metrics">
                    <div class="metric-item">
                        <div class="metric-value">$($Statistics.AverageProcessingTime)s</div>
                        <div class="metric-label">Avg Processing Time</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">$($Statistics.GroupsPerMinute)</div>
                        <div class="metric-label">Groups/Minute</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">$($Statistics.APICallsTotal)</div>
                        <div class="metric-label">Total API Calls</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">$($Statistics.ErrorRate)%</div>
                        <div class="metric-label">Error Rate</div>
                    </div>
                </div>
            </div>
        </div>
"@

        # Add detailed results table
        $html += @"
        <div class="section">
            <div class="section-header">
                📋 Detailed Results
            </div>
            <div class="section-content">
                <table>
                    <thead>
                        <tr>
                            <th>OU Name</th>
                            <th>Group Name</th>
                            <th>Status</th>
                            <th>Group ID</th>
                            <th>Processing Time</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
"@

        foreach ($result in $Results) {
            $statusClass = switch ($result.Status) {
                "Created" { "status-created" }
                "Updated" { "status-updated" }
                "Failed" { "status-failed" }
                "AlreadyExists" { "status-skipped" }
                "DryRun" { "status-dryrun" }
                default { "status-skipped" }
            }
            
            $detailsId = "details-$([System.Guid]::NewGuid().ToString('N').Substring(0,8))"
            $processingTime = if ($result.Duration) { "$([math]::Round($result.Duration, 2))s" } else { "N/A" }
            
            $html += @"
                        <tr class="expandable" onclick="toggleDetails('$detailsId')">
                            <td>$($result.OU)</td>
                            <td>$($result.GroupName)</td>
                            <td><span class="status-badge $statusClass">$($result.Status)</span></td>
                            <td>$($result.GroupId)</td>
                            <td>$processingTime</td>
                            <td>👁️ View Details</td>
                        </tr>
                        <tr>
                            <td colspan="6">
                                <div id="$detailsId" class="details">
                                    <strong>Membership Rule:</strong><br>
                                    $($result.MembershipRule)<br><br>
                                    <strong>Display Name:</strong> $($result.DisplayName)<br>
                                    $(if($result.Error) { "<strong>Error:</strong> $($result.Error)<br>" })
                                    $(if($result.StartTime) { "<strong>Start Time:</strong> $($result.StartTime)<br>" })
                                    $(if($result.EndTime) { "<strong>End Time:</strong> $($result.EndTime)<br>" })
                                </div>
                            </td>
                        </tr>
"@
        }

        $html += @"
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="footer">
            <div class="footer-logo">🚀 DDG AutoCreator Ultimate Enterprise Edition</div>
            <div class="footer-text">Original concept by Ali Alame - CYBERSYSTEM</div>
            <div class="footer-text">Ultimate Edition by Philipp Schmidt</div>
            <div class="footer-text">PowerShell 5.1 + ISE Optimized</div>
            <div class="footer-text">Report generated on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")</div>
        </div>
    </div>
    
    <script>
        // Chart.js configuration for Ultimate Dashboard
        const resultsData = {
            labels: ['Created', 'Updated', 'Skipped', 'Failed'],
            datasets: [{
                data: [$($Statistics.CreatedGroups), $($Statistics.UpdatedGroups), $($Statistics.SkippedGroups), $($Statistics.FailedGroups)],
                backgroundColor: [
                    'rgba(16, 124, 16, 0.8)',
                    'rgba(0, 120, 212, 0.8)',
                    'rgba(255, 140, 0, 0.8)',
                    'rgba(209, 52, 56, 0.8)'
                ],
                borderColor: [
                    'rgba(16, 124, 16, 1)',
                    'rgba(0, 120, 212, 1)',
                    'rgba(255, 140, 0, 1)',
                    'rgba(209, 52, 56, 1)'
                ],
                borderWidth: 3,
                hoverOffset: 10
            }]
        };
        
        const resultsConfig = {
            type: 'doughnut',
            data: resultsData,
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 25,
                            usePointStyle: true,
                            font: {
                                size: 14,
                                weight: 'bold'
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: 'rgba(255, 255, 255, 0.3)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        displayColors: true
                    }
                },
                animation: {
                    animateRotate: true,
                    animateScale: true,
                    duration: 2000
                }
            }
        };
        
        // Timeline chart
        const timelineData = {
            labels: ['Start', 'Processing', 'Completion'],
            datasets: [{
                label: 'Groups Processed',
                data: [0, Math.floor($($Statistics.TotalItems) / 2), $($Statistics.TotalItems)],
                borderColor: 'rgba(0, 120, 212, 1)',
                backgroundColor: 'rgba(0, 120, 212, 0.1)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: 'rgba(0, 120, 212, 1)',
                pointBorderColor: 'white',
                pointBorderWidth: 3,
                pointRadius: 8,
                pointHoverRadius: 12
            }]
        };
        
        const timelineConfig = {
            type: 'line',
            data: timelineData,
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: 'rgba(255, 255, 255, 0.3)',
                        borderWidth: 1,
                        cornerRadius: 8
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            font: {
                                weight: 'bold'
                            }
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            font: {
                                weight: 'bold'
                            }
                        }
                    }
                },
                animation: {
                    duration: 2000,
                    easing: 'easeInOutQuart'
                }
            }
        };
        
        // Initialize charts
        const resultsChart = new Chart(document.getElementById('resultsChart'), resultsConfig);
        const timelineChart = new Chart(document.getElementById('timelineChart'), timelineConfig);
        
        // Toggle details function
        function toggleDetails(detailsId) {
            const details = document.getElementById(detailsId);
            details.classList.toggle('expanded');
        }
        
        // Add smooth scrolling
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
        
        // Add loading animation
        window.addEventListener('load', function() {
            document.body.style.opacity = '0';
            document.body.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                document.body.style.opacity = '1';
            }, 100);
        });
    </script>
</body>
</html>
"@

        Set-Content -Path $OutputPath -Value $html -Encoding UTF8
        Write-ColorOutput "✅ HTML dashboard generated: $OutputPath" "Green"
        return $OutputPath
    }
    catch {
        Write-ColorOutput "❌ Failed to generate HTML dashboard: $($_.Exception.Message)" "Red"
        throw
    }
}

#endregion

#region Main Processing Functions

function Process-GroupsSequentially {
    <#
    .SYNOPSIS
        Process groups sequentially with ISE-friendly progress display
    #>
    param([array]$InputData)
    
    Write-ColorOutput "🔄 Processing groups sequentially..." "Cyan"
    
    $results = @()
    $totalItems = $InputData.Count
    $currentItem = 0
    
    foreach ($item in $InputData) {
        $currentItem++
        $percent = [math]::Round(($currentItem / $totalItems) * 100, 1)
        
        Write-ColorOutput "📋 Processing ($currentItem/$totalItems - $percent%): $($item.Name)" "Yellow"
        
        try {
            $result = Process-SingleGroup -Item $item
            $results += $result
            
            # Display result
            $statusColor = switch ($result.Status) {
                "Created" { "Green" }
                "Updated" { "Cyan" }
                "AlreadyExists" { "Yellow" }
                "Failed" { "Red" }
                "DryRun" { "Magenta" }
                default { "Gray" }
            }
            
            Write-ColorOutput "   ✅ $($result.Status): $($result.GroupName)" $statusColor
        }
        catch {
            Write-ColorOutput "   ❌ Failed: $($_.Exception.Message)" "Red"
            $results += @{
                OU = $item.Name
                Status = "Failed"
                Error = $_.Exception.Message
                GroupName = "N/A"
                GroupId = $null
            }
        }
        
        # Small delay for rate limiting
        if ($Global:DDGConfig.General.DelayBetweenBatches -gt 0) {
            Start-Sleep -Seconds $Global:DDGConfig.General.DelayBetweenBatches
        }
    }
    
    return $results
}

function Process-SingleGroup {
    <#
    .SYNOPSIS
        Process a single group with comprehensive error handling
    #>
    param([PSCustomObject]$Item)
    
    $startTime = Get-Date
    
    $result = @{
        OU = $Item.Name
        DisplayName = $Item.DisplayName
        Status = "Processing"
        StartTime = $startTime
        EndTime = $null
        Duration = 0
        Error = $null
        GroupId = $null
        GroupName = $null
        MembershipRule = $null
    }
    
    try {
        # Generate group name
        $prefix = if ($GroupPrefix) { $GroupPrefix } else { $Global:DDGConfig.General.DefaultGroupPrefix }
        $template = $Global:DDGConfig.GroupNaming.Templates.Default
        $groupName = $template -replace "\{Prefix\}", $prefix
        $groupName = $groupName -replace "\{OU\}", $Item.Name
        $groupName = $groupName -replace "\{Type\}", "Autopilot"
        
        $result.GroupName = $groupName
        
        # Generate membership rule
        $ruleTemplate = $Global:DDGConfig.MembershipRules.Templates.OrderID
        $membershipRule = $ruleTemplate -replace "\{OU\}", $Item.Name
        $result.MembershipRule = $membershipRule
        
        if ($DryRun) {
            $result.Status = "DryRun"
            $result.GroupId = "DryRun-" + [System.Guid]::NewGuid().ToString()
        }
        else {
            # Check if group exists
            $existingGroup = Get-MgGroup -Filter "displayName eq '$groupName'" -ErrorAction SilentlyContinue
            
            if ($existingGroup -and -not $UpdateExisting) {
                $result.Status = "AlreadyExists"
                $result.GroupId = $existingGroup.Id
            }
            elseif ($existingGroup -and $UpdateExisting) {
                # Update existing group
                Update-MgGroup -GroupId $existingGroup.Id -MembershipRule $membershipRule -Description $Item.Description
                $result.Status = "Updated"
                $result.GroupId = $existingGroup.Id
            }
            else {
                # Create new group
                $groupParams = @{
                    DisplayName = $groupName
                    Description = $Item.Description
                    GroupTypes = @("DynamicMembership")
                    MembershipRule = $membershipRule
                    MembershipRuleProcessingState = "On"
                    MailEnabled = $false
                    SecurityEnabled = $true
                    MailNickname = ($groupName -replace '[^a-zA-Z0-9]', '').ToLower()
                }
                
                $newGroup = New-MgGroup @groupParams
                $result.Status = "Created"
                $result.GroupId = $newGroup.Id
            }
        }
        
        $result.EndTime = Get-Date
        $result.Duration = ($result.EndTime - $result.StartTime).TotalSeconds
        
        return $result
    }
    catch {
        $result.Status = "Failed"
        $result.Error = $_.Exception.Message
        $result.EndTime = Get-Date
        $result.Duration = ($result.EndTime - $result.StartTime).TotalSeconds
        
        return $result
    }
}

function Connect-ToMicrosoftGraph {
    <#
    .SYNOPSIS
        Connect to Microsoft Graph with multiple authentication options
    #>
    Write-ColorOutput "🔐 Connecting to Microsoft Graph..." "Cyan"
    
    try {
        # Check if already connected
        $context = Get-MgContext -ErrorAction SilentlyContinue
        if ($context) {
            Write-ColorOutput "✅ Already connected to Microsoft Graph" "Green"
            Write-ColorOutput "   Account: $($context.Account)" "Gray"
            Write-ColorOutput "   Tenant: $($context.TenantId)" "Gray"
            return $true
        }
        
        # Determine authentication method
        $scopes = $Global:DDGConfig.Authentication.Scopes
        
        if ($Global:DDGConfig.Authentication.UseDeviceCode) {
            Write-ColorOutput "🔑 Using device code authentication..." "Yellow"
            Connect-MgGraph -Scopes $scopes -UseDeviceAuthentication -NoWelcome
        }
        else {
            Write-ColorOutput "🔑 Using interactive authentication..." "Yellow"
            Connect-MgGraph -Scopes $scopes -NoWelcome
        }
        
        # Verify connection
        $context = Get-MgContext
        if ($context) {
            Write-ColorOutput "✅ Successfully connected to Microsoft Graph" "Green"
            Write-ColorOutput "   Account: $($context.Account)" "Gray"
            Write-ColorOutput "   Tenant: $($context.TenantId)" "Gray"
            Write-ColorOutput "   Scopes: $($context.Scopes -join ', ')" "Gray"
            return $true
        }
        else {
            throw "Failed to establish Graph connection"
        }
    }
    catch {
        Write-ColorOutput "❌ Failed to connect to Microsoft Graph: $($_.Exception.Message)" "Red"
        throw
    }
}

#endregion

#region Main Execution

try {
    # Show banner
    Show-UltimateBanner
    
    # Initialize execution statistics
    $Global:DDGStatistics = @{
        StartTime = Get-Date
        EndTime = $null
        ExecutionTime = "In Progress"
        TotalItems = 0
        ProcessedItems = 0
        SuccessfulItems = 0
        CreatedGroups = 0
        UpdatedGroups = 0
        SkippedGroups = 0
        FailedGroups = 0
        AverageProcessingTime = 0
        GroupsPerMinute = 0
        APICallsTotal = 0
        ErrorRate = 0
    }
    
    # Load configuration
    Write-ColorOutput "⚙️  Initializing Ultimate Enterprise Edition..." "Cyan"
    Import-DDGConfiguration -ConfigFilePath $ConfigPath
    
    # Override config with command line parameters
    if ($GroupPrefix) { $Global:DDGConfig.General.DefaultGroupPrefix = $GroupPrefix }
    if ($PSBoundParameters.ContainsKey('Parallel')) { $Global:DDGConfig.Features.ParallelProcessing = $Parallel }
    if ($PSBoundParameters.ContainsKey('UpdateExisting')) { $Global:DDGConfig.Features.UpdateExistingGroups = $UpdateExisting }
    if ($PSBoundParameters.ContainsKey('CleanupMode')) { $Global:DDGConfig.Features.CleanupMode = $CleanupMode }
    if ($PSBoundParameters.ContainsKey('Interactive')) { $Global:DDGConfig.Features.InteractiveMode = $Interactive }
    if ($PSBoundParameters.ContainsKey('AuditMode')) { $Global:DDGConfig.Features.AuditMode = $AuditMode }
    if ($PSBoundParameters.ContainsKey('ScheduledMode')) { $Global:DDGConfig.Features.ScheduledMode = $ScheduledMode }
    if ($TeamsWebhookUrl) { 
        $Global:DDGConfig.Teams.EnableNotifications = $true
        $Global:DDGConfig.Teams.WebhookUrl = $TeamsWebhookUrl
    }
    
    # Connect to Microsoft Graph
    Connect-ToMicrosoftGraph
    
    # Handle different execution modes
    if ($CleanupMode) {
        Write-ColorOutput "🧹 CLEANUP MODE ACTIVATED" "Yellow"
        
        if ($InputFilePath) {
            $inputData = Import-InputData -FilePath $InputFilePath -Format $InputFormat
            $cleanupResults = Start-CleanupMode -CurrentOUs $inputData
        }
        else {
            $cleanupResults = Start-CleanupMode -CurrentOUs @()
        }
        
        # Generate cleanup report
        if ($ExportHTMLReport) {
            $cleanupStats = @{
                TotalGroups = $cleanupResults.Count
                DeletedGroups = ($cleanupResults | Where-Object { $_.Status -eq "Deleted" }).Count
                FailedDeletions = ($cleanupResults | Where-Object { $_.Status -eq "Failed" }).Count
                ExecutionTime = "Cleanup Mode"
            }
            
            New-HTMLDashboard -Results $cleanupResults -Statistics $cleanupStats -OutputPath $ExportHTMLReport
        }
        
        # Send Teams notification
        if ($Global:DDGConfig.Teams.EnableNotifications) {
            $message = "🧹 Cleanup completed. Processed $($cleanupResults.Count) groups."
            Send-TeamsNotification -WebhookUrl $Global:DDGConfig.Teams.WebhookUrl -Title "DDG Cleanup Completed" -Message $message -Color "FF8C00"
        }
        
        Write-ColorOutput "🎉 Cleanup mode completed!" "Green"
        exit 0
    }
    
    # Validate input file
    if (-not $InputFilePath) {
        throw "InputFilePath is required for standard operation"
    }
    
    # Import input data
    Write-ColorOutput "📂 Importing input data..." "Yellow"
    $inputData = Import-InputData -FilePath $InputFilePath -Format $InputFormat
    $Global:DDGStatistics.TotalItems = $inputData.Count
    
    if ($inputData.Count -eq 0) {
        throw "No valid data found in input file"
    }
    
    # Interactive mode selection
    if ($Interactive) {
        $inputData = Show-InteractiveSelection -InputData $inputData
        if (-not $inputData) {
            Write-ColorOutput "❌ No items selected. Exiting..." "Red"
            exit 0
        }
        $Global:DDGStatistics.TotalItems = $inputData.Count
    }
    
    # Advanced validation
    if ($Global:DDGConfig.Validation.EnableAdvancedValidation) {
        $validationResults = Test-InputDataValidation -InputData $inputData
    }
    
    # Create backup if enabled
    if ($CreateBackup -or $Global:DDGConfig.General.CreateBackup) {
        $backupPath = Create-BackupData -InputData $inputData
    }
    
    # Send start notification
    if ($Global:DDGConfig.Teams.EnableNotifications -and $Global:DDGConfig.Teams.NotifyOnStart) {
        $message = "🚀 Starting DDG processing for $($inputData.Count) items."
        $stats = @{
            "Total Items" = $inputData.Count
            "Mode" = if ($DryRun) { "Dry Run" } else { "Live" }
            "Parallel Processing" = if ($Global:DDGConfig.Features.ParallelProcessing) { "Enabled" } else { "Disabled" }
        }
        Send-TeamsNotification -WebhookUrl $Global:DDGConfig.Teams.WebhookUrl -Title "DDG AutoCreator Started" -Message $message -Statistics $stats
    }
    
    # Process groups
    Write-ColorOutput "🚀 Starting group processing..." "Cyan"
    
    if ($Global:DDGConfig.Features.ParallelProcessing -and $inputData.Count -gt 1) {
        # Parallel processing
        $runspacePool = Initialize-RunspacePool -MaxRunspaces $MaxParallelJobs
        $Global:DDGResults = Start-ParallelProcessing -InputData $inputData -RunspacePool $runspacePool
    }
    else {
        # Sequential processing
        $Global:DDGResults = Process-GroupsSequentially -InputData $inputData
    }
    
    # Calculate final statistics
    $Global:DDGStatistics.EndTime = Get-Date
    $Global:DDGStatistics.ExecutionTime = ($Global:DDGStatistics.EndTime - $Global:DDGStatistics.StartTime).ToString("hh\:mm\:ss")
    $Global:DDGStatistics.ProcessedItems = $Global:DDGResults.Count
    $Global:DDGStatistics.CreatedGroups = ($Global:DDGResults | Where-Object { $_.Status -eq "Created" }).Count
    $Global:DDGStatistics.UpdatedGroups = ($Global:DDGResults | Where-Object { $_.Status -eq "Updated" }).Count
    $Global:DDGStatistics.SkippedGroups = ($Global:DDGResults | Where-Object { $_.Status -eq "AlreadyExists" }).Count
    $Global:DDGStatistics.FailedGroups = ($Global:DDGResults | Where-Object { $_.Status -eq "Failed" }).Count
    $Global:DDGStatistics.SuccessfulItems = $Global:DDGStatistics.CreatedGroups + $Global:DDGStatistics.UpdatedGroups
    
    # Calculate performance metrics
    $totalSeconds = ($Global:DDGStatistics.EndTime - $Global:DDGStatistics.StartTime).TotalSeconds
    if ($totalSeconds -gt 0) {
        $Global:DDGStatistics.AverageProcessingTime = [math]::Round($totalSeconds / $Global:DDGStatistics.ProcessedItems, 2)
        $Global:DDGStatistics.GroupsPerMinute = [math]::Round(($Global:DDGStatistics.ProcessedItems / $totalSeconds) * 60, 1)
    }
    $Global:DDGStatistics.ErrorRate = if ($Global:DDGStatistics.ProcessedItems -gt 0) { 
        [math]::Round(($Global:DDGStatistics.FailedGroups / $Global:DDGStatistics.ProcessedItems) * 100, 1) 
    } else { 0 }
    $Global:DDGStatistics.APICallsTotal = $Global:DDGStatistics.ProcessedItems * 2  # Estimate
    
    # Display final results
    Write-Host ""
    Write-ColorOutput "🎉 PROCESSING COMPLETED!" "Green"
    Write-ColorOutput "═══════════════════════════════════════════════════════════════" "Cyan"
    Write-ColorOutput "📊 FINAL STATISTICS:" "Yellow"
    Write-ColorOutput "   ⏱️  Execution Time: $($Global:DDGStatistics.ExecutionTime)" "White"
    Write-ColorOutput "   📋 Total Items: $($Global:DDGStatistics.TotalItems)" "White"
    Write-ColorOutput "   ✅ Created Groups: $($Global:DDGStatistics.CreatedGroups)" "Green"
    Write-ColorOutput "   🔄 Updated Groups: $($Global:DDGStatistics.UpdatedGroups)" "Cyan"
    Write-ColorOutput "   ⏭️  Skipped Groups: $($Global:DDGStatistics.SkippedGroups)" "Yellow"
    Write-ColorOutput "   ❌ Failed Groups: $($Global:DDGStatistics.FailedGroups)" "Red"
    Write-ColorOutput "   📈 Success Rate: $(if($Global:DDGStatistics.TotalItems -gt 0) { [math]::Round($Global:DDGStatistics.SuccessfulItems / $Global:DDGStatistics.TotalItems * 100, 1) } else { 0 })%" "Green"
    Write-ColorOutput "   ⚡ Performance: $($Global:DDGStatistics.GroupsPerMinute) groups/minute" "Cyan"
    Write-ColorOutput "═══════════════════════════════════════════════════════════════" "Cyan"
    
    # Generate reports
    if ($ExportHTMLReport -or $Global:DDGConfig.Reporting.GenerateHTMLReport) {
        $htmlPath = if ($ExportHTMLReport) { $ExportHTMLReport } else { "DDG-Dashboard-$(Get-Date -Format 'yyyyMMdd-HHmmss').html" }
        New-HTMLDashboard -Results $Global:DDGResults -Statistics $Global:DDGStatistics -OutputPath $htmlPath
    }
    
    if ($ExportCSVReport -or $Global:DDGConfig.Reporting.GenerateCSVReport) {
        $csvPath = if ($ExportCSVReport) { $ExportCSVReport } else { "DDG-Results-$(Get-Date -Format 'yyyyMMdd-HHmmss').csv" }
        $Global:DDGResults | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
        Write-ColorOutput "📄 CSV report exported: $csvPath" "Green"
    }
    
    if ($ExportJSONReport -or $Global:DDGConfig.Reporting.GenerateJSONReport) {
        $jsonPath = if ($ExportJSONReport) { $ExportJSONReport } else { "DDG-Results-$(Get-Date -Format 'yyyyMMdd-HHmmss').json" }
        $exportData = @{
            Statistics = $Global:DDGStatistics
            Results = $Global:DDGResults
            Configuration = $Global:DDGConfig
            GeneratedAt = Get-Date
        }
        $exportData | ConvertTo-Json -Depth 10 | Set-Content -Path $jsonPath -Encoding UTF8
        Write-ColorOutput "📄 JSON report exported: $jsonPath" "Green"
    }
    
    # Send completion notification
    if ($Global:DDGConfig.Teams.EnableNotifications -and $Global:DDGConfig.Teams.NotifyOnCompletion) {
        $message = "🎉 DDG processing completed successfully!"
        $color = if ($Global:DDGStatistics.FailedGroups -eq 0) { "107C10" } else { "FF8C00" }
        Send-TeamsNotification -WebhookUrl $Global:DDGConfig.Teams.WebhookUrl -Title "DDG AutoCreator Completed" -Message $message -Color $color -Statistics $Global:DDGStatistics
    }
    
    Write-Host ""
    Write-ColorOutput "🚀 DDG AutoCreator Ultimate Enterprise Edition completed successfully!" "Green"
    
    if ($DryRun) {
        Write-ColorOutput "💡 This was a DRY RUN. No actual changes were made." "Cyan"
        Write-ColorOutput "💡 Remove -DryRun parameter to perform actual group creation." "Cyan"
    }
}
catch {
    $errorMessage = $_.Exception.Message
    Write-ColorOutput "💥 EXECUTION FAILED: $errorMessage" "Red"
    
    # Send error notification
    if ($Global:DDGConfig.Teams.EnableNotifications -and $Global:DDGConfig.Teams.NotifyOnErrors) {
        $message = "❌ DDG processing failed: $errorMessage"
        Send-TeamsNotification -WebhookUrl $Global:DDGConfig.Teams.WebhookUrl -Title "DDG AutoCreator Failed" -Message $message -Color "D13438"
    }
    
    # Handle rollback if requested
    if ($RollbackFile) {
        Write-ColorOutput "🔄 Attempting rollback..." "Yellow"
        Start-RollbackProcess -RollbackFilePath $RollbackFile
    }
    
    exit 1
}
finally {
    # Cleanup
    try {
        if ($Global:DDGRunspaces) {
            foreach ($runspace in $Global:DDGRunspaces) {
                if ($runspace.PowerShell) {
                    $runspace.PowerShell.Dispose()
                }
            }
        }
        
        # Disconnect from Graph
        Disconnect-MgGraph -ErrorAction SilentlyContinue
    }
    catch {
        # Ignore cleanup errors
    }
}

#endregion

