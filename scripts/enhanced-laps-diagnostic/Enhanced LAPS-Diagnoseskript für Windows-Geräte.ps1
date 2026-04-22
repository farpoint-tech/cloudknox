<#
.SYNOPSIS
    Enhanced LAPS Diagnostic Script for Windows Devices
.DESCRIPTION
    This script checks whether Microsoft LAPS is functioning correctly. It performs the following diagnostic steps:
    1. Check administrator privileges
    2. Load and verify LAPS module
    3. Azure AD status (dsregcmd)
    4. Network connectivity
    5. PowerShell execution policy
    6. LAPS diagnostics (Get-LapsDiagnostics)
    7. Event log evaluation (LAPS Operational Log)
    8. Time synchronisation
    9. Write output to a text file
.AUTHOR
    Philipp Schmidt (Enhanced Version)
.NOTES
    Requires Administrator privileges and LAPS PowerShell module
#>

#Requires -RunAsAdministrator

# Set the path for the output file (with fallback options)
$PossiblePaths = @(
    "$env:USERPROFILE\Desktop\LAPS_DiagnosticReport_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt",
    "$env:USERPROFILE\Documents\LAPS_DiagnosticReport_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt",
    "$env:TEMP\LAPS_DiagnosticReport_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt",
    "C:\Temp\LAPS_DiagnosticReport_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
)

$OutputPath = $null
foreach ($Path in $PossiblePaths) {
    $Directory = Split-Path $Path -Parent
    if (Test-Path $Directory) {
        $OutputPath = $Path
        break
    } elseif ($Directory -eq "C:\Temp") {
        # Create C:\Temp if it does not exist
        try {
            New-Item -Path "C:\Temp" -ItemType Directory -Force -ErrorAction Stop | Out-Null
            $OutputPath = $Path
            break
        } catch {
            continue
        }
    }
}

if (-not $OutputPath) {
    # Last fallback: current directory
    $OutputPath = ".\LAPS_DiagnosticReport_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
}

# Function for formatted output with improved error handling
function Write-DiagnosticOutput {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $output = "[$timestamp] [$Level] $Message"
    Write-Host $output

    # Attempt to write to file, but do not fail if unavailable
    try {
        $output | Out-File -FilePath $OutputPath -Append -ErrorAction Stop
    } catch {
        # Fallback: output to console only if file is not writable
        Write-Host "[WARNING] Could not write to file: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Initialise the output file with improved error handling
try {
    "Microsoft LAPS Enhanced Diagnostic Report" | Out-File -FilePath $OutputPath -ErrorAction Stop
    "Created on: $(Get-Date)" | Out-File -FilePath $OutputPath -Append
    "Author: Philipp Schmidt (Enhanced Version)" | Out-File -FilePath $OutputPath -Append
    "Computer: $env:COMPUTERNAME" | Out-File -FilePath $OutputPath -Append
    "User: $env:USERNAME" | Out-File -FilePath $OutputPath -Append
    "Output path: $OutputPath" | Out-File -FilePath $OutputPath -Append
    "`n=============================`n" | Out-File -FilePath $OutputPath -Append
    Write-Host "Report will be saved to: $OutputPath" -ForegroundColor Green
} catch {
    Write-Host "WARNING: Could not create output file: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "Diagnostics will be output to console only." -ForegroundColor Yellow
    $OutputPath = $null
}

Write-DiagnosticOutput "LAPS diagnostics started..."

# 0. Check administrator privileges
Write-DiagnosticOutput "0. Checking administrator privileges"
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if ($isAdmin) {
    Write-DiagnosticOutput "✓ Script is running with administrator privileges" "SUCCESS"
} else {
    Write-DiagnosticOutput "✗ WARNING: Script is NOT running with administrator privileges" "WARNING"
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# 1. Check and load LAPS PowerShell module
Write-DiagnosticOutput "1. LAPS PowerShell Module Status"
try {
    # Check if LAPS module is available
    $lapsModule = Get-Module -ListAvailable -Name "LAPS" -ErrorAction SilentlyContinue
    if ($lapsModule) {
        Write-DiagnosticOutput "✓ LAPS PowerShell module found: Version $($lapsModule.Version)" "SUCCESS"

        # Load the module
        Import-Module LAPS -Force -ErrorAction Stop
        Write-DiagnosticOutput "✓ LAPS module loaded successfully" "SUCCESS"

        # Show available LAPS cmdlets
        $lapsCmdlets = Get-Command -Module LAPS
        Write-DiagnosticOutput "Available LAPS cmdlets: $($lapsCmdlets.Name -join ', ')"

        # Write to file safely
        if ($OutputPath) {
            "`n=============================`n" | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
        }
    } else {
        Write-DiagnosticOutput "✗ LAPS PowerShell module not found!" "ERROR"
        Write-DiagnosticOutput "Install the module with: Install-Module -Name LAPS" "ERROR"
    }
} catch {
    Write-DiagnosticOutput "✗ Error loading LAPS module: $($_.Exception.Message)" "ERROR"
}
if ($OutputPath) {
    "`n=============================`n" | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
}

# 2. PowerShell Execution Policy
Write-DiagnosticOutput "2. PowerShell Execution Policy"
try {
    $executionPolicy = Get-ExecutionPolicy
    Write-DiagnosticOutput "Current execution policy: $executionPolicy"

    if ($executionPolicy -eq "Restricted") {
        Write-DiagnosticOutput "✗ WARNING: Execution policy is set to 'Restricted'" "WARNING"
    } else {
        Write-DiagnosticOutput "✓ Execution policy allows script execution" "SUCCESS"
    }
} catch {
    Write-DiagnosticOutput "✗ Error retrieving execution policy: $($_.Exception.Message)" "ERROR"
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# 3. Network connectivity check
Write-DiagnosticOutput "3. Network Connectivity"
try {
    # Test connection to Azure AD
    $azureADTest = Test-NetConnection -ComputerName "login.microsoftonline.com" -Port 443 -WarningAction SilentlyContinue
    if ($azureADTest.TcpTestSucceeded) {
        Write-DiagnosticOutput "✓ Connection to Azure AD successful (login.microsoftonline.com:443)" "SUCCESS"
    } else {
        Write-DiagnosticOutput "✗ Connection to Azure AD failed" "ERROR"
    }

    # Test DNS resolution
    $dnsTest = Resolve-DnsName "login.microsoftonline.com" -ErrorAction SilentlyContinue
    if ($dnsTest) {
        Write-DiagnosticOutput "✓ DNS resolution working" "SUCCESS"
    } else {
        Write-DiagnosticOutput "✗ DNS resolution failed" "ERROR"
    }
} catch {
    Write-DiagnosticOutput "✗ Error during network tests: $($_.Exception.Message)" "ERROR"
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# 4. Azure AD Status
Write-DiagnosticOutput "4. Azure AD Status (dsregcmd /status)"
try {
    $dsregOutput = dsregcmd /status
    $dsregOutput | Out-File -FilePath $OutputPath -Append

    # Analyse key status values
    $azureAdJoined = ($dsregOutput | Select-String "AzureAdJoined.*YES")
    $domainJoined = ($dsregOutput | Select-String "DomainJoined.*YES")

    if ($azureAdJoined) {
        Write-DiagnosticOutput "✓ Device is Azure AD joined" "SUCCESS"
    } elseif ($domainJoined) {
        Write-DiagnosticOutput "✓ Device is domain joined (hybrid possible)" "SUCCESS"
    } else {
        Write-DiagnosticOutput "✗ Device is neither Azure AD nor domain joined" "WARNING"
    }
} catch {
    Write-DiagnosticOutput "✗ Error running dsregcmd: $($_.Exception.Message)" "ERROR"
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# 5. LAPS Diagnostics (with workaround for known bug)
Write-DiagnosticOutput "5. LAPS Diagnostics (Get-LapsDiagnostics + Alternative Methods)"
try {
    if (Get-Command Get-LapsDiagnostics -ErrorAction SilentlyContinue) {
        Write-DiagnosticOutput "Attempting Get-LapsDiagnostics..."

        # Try the normal route first
        try {
            $lapsDiagnostics = Get-LapsDiagnostics -ErrorAction Stop
            if ($OutputPath) {
                $lapsDiagnostics | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
            }
            Write-DiagnosticOutput "✓ LAPS diagnostics executed successfully" "SUCCESS"
        } catch {
            Write-DiagnosticOutput "✗ Get-LapsDiagnostics failed (known bug): $($_.Exception.Message)" "WARNING"
            Write-DiagnosticOutput "Using alternative diagnostic methods..." "INFO"

            # Alternative 1: Manual LAPS status check
            Write-DiagnosticOutput "--- Alternative LAPS Diagnostics ---"

            # Check LAPS service
            try {
                $lapsService = Get-Service -Name "LAPS" -ErrorAction SilentlyContinue
                if ($lapsService) {
                    Write-DiagnosticOutput "✓ LAPS service found: Status = $($lapsService.Status)" "SUCCESS"
                    if ($OutputPath) {
                        "LAPS Service Status: $($lapsService.Status)" | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
                    }
                } else {
                    Write-DiagnosticOutput "⚠ LAPS service not found" "WARNING"
                }
            } catch {
                Write-DiagnosticOutput "✗ Error during service check: $($_.Exception.Message)" "ERROR"
            }

            # Check LAPS registry configuration
            try {
                $lapsConfigPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\LAPS\Config"
                if (Test-Path $lapsConfigPath) {
                    Write-DiagnosticOutput "✓ LAPS configuration found in registry" "SUCCESS"
                    $lapsConfig = Get-ItemProperty -Path $lapsConfigPath -ErrorAction SilentlyContinue
                    if ($lapsConfig) {
                        Write-DiagnosticOutput "LAPS config properties: $($lapsConfig.PSObject.Properties.Name -join ', ')"
                        if ($OutputPath) {
                            "LAPS Registry Configuration:" | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
                            $lapsConfig | Format-List | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
                        }
                    }
                } else {
                    Write-DiagnosticOutput "⚠ LAPS registry configuration not found" "WARNING"
                }
            } catch {
                Write-DiagnosticOutput "✗ Error during registry check: $($_.Exception.Message)" "ERROR"
            }

            # Check alternative LAPS cmdlets
            try {
                if (Get-Command Get-LapsADPassword -ErrorAction SilentlyContinue) {
                    Write-DiagnosticOutput "✓ Get-LapsADPassword cmdlet available" "SUCCESS"
                }
                if (Get-Command Set-LapsADComputerSelfPermission -ErrorAction SilentlyContinue) {
                    Write-DiagnosticOutput "✓ Set-LapsADComputerSelfPermission cmdlet available" "SUCCESS"
                }
                if (Get-Command Invoke-LapsPolicyProcessing -ErrorAction SilentlyContinue) {
                    Write-DiagnosticOutput "✓ Invoke-LapsPolicyProcessing cmdlet available" "SUCCESS"
                }
            } catch {
                Write-DiagnosticOutput "✗ Error during cmdlet check: $($_.Exception.Message)" "ERROR"
            }
        }
    } else {
        Write-DiagnosticOutput "✗ Get-LapsDiagnostics cmdlet not available" "ERROR"
        Write-DiagnosticOutput "The LAPS PowerShell module may not be installed correctly" "ERROR"
    }
} catch {
    Write-DiagnosticOutput "✗ General error during LAPS diagnostics: $($_.Exception.Message)" "ERROR"
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# 6. LAPS Event Log Evaluation
Write-DiagnosticOutput "6. LAPS Event Log Evaluation (Microsoft-Windows-LAPS/Operational)"
try {
    $lapsEvents = Get-WinEvent -LogName "Microsoft-Windows-LAPS/Operational" -MaxEvents 50 -ErrorAction Stop
    Write-DiagnosticOutput "✓ $($lapsEvents.Count) LAPS event(s) found" "SUCCESS"

    # Analyse event types
    $errorEvents = $lapsEvents | Where-Object { $_.LevelDisplayName -eq "Error" }
    $warningEvents = $lapsEvents | Where-Object { $_.LevelDisplayName -eq "Warning" }

    if ($errorEvents) {
        Write-DiagnosticOutput "✗ $($errorEvents.Count) error event(s) found" "WARNING"
    }
    if ($warningEvents) {
        Write-DiagnosticOutput "⚠ $($warningEvents.Count) warning event(s) found" "WARNING"
    }

    $lapsEvents | Format-List | Out-File -FilePath $OutputPath -Append
} catch {
    Write-DiagnosticOutput "✗ LAPS event log could not be read: $($_.Exception.Message)" "ERROR"
    "Possible causes: LAPS not installed or operational log not enabled" | Out-File -FilePath $OutputPath -Append
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# 7. Time synchronisation
Write-DiagnosticOutput "7. Time Synchronisation (w32tm /query /status)"
try {
    $timeStatus = w32tm /query /status
    $timeStatus | Out-File -FilePath $OutputPath -Append

    # Check synchronisation
    $syncStatus = $timeStatus | Select-String "Last Successful Sync Time"
    if ($syncStatus) {
        Write-DiagnosticOutput "✓ Time synchronisation active" "SUCCESS"
    } else {
        Write-DiagnosticOutput "⚠ Time synchronisation may not be active" "WARNING"
    }
} catch {
    Write-DiagnosticOutput "✗ Error querying time synchronisation: $($_.Exception.Message)" "ERROR"
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# 8. Additional LAPS-specific checks
Write-DiagnosticOutput "8. Additional LAPS Checks"
try {
    # Check local administrator accounts
    $localAdmins = Get-LocalUser | Where-Object { $_.Enabled -eq $true -and $_.Name -like "*admin*" }
    if ($localAdmins) {
        Write-DiagnosticOutput "Local administrator accounts found: $($localAdmins.Name -join ', ')"
        $localAdmins | Format-List | Out-File -FilePath $OutputPath -Append
    }

    # Check LAPS registry settings (if present)
    $lapsRegPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\GPExtensions\{D76B9641-3288-4f75-942D-087DE603E3EA}"
    if (Test-Path $lapsRegPath) {
        Write-DiagnosticOutput "✓ LAPS registry path found" "SUCCESS"
        Get-ItemProperty -Path $lapsRegPath | Out-File -FilePath $OutputPath -Append
    } else {
        Write-DiagnosticOutput "⚠ LAPS registry path not found" "WARNING"
    }
} catch {
    Write-DiagnosticOutput "✗ Error during additional checks: $($_.Exception.Message)" "ERROR"
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# Completion and summary
Write-DiagnosticOutput "DIAGNOSTICS COMPLETED"
if ($OutputPath) {
    "Report saved to: $OutputPath" | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
    "For further support please contact IT support." | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
}

Write-Host "`n" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "LAPS diagnostics completed successfully!" -ForegroundColor Green
if ($OutputPath) {
    Write-Host "Report saved: $OutputPath" -ForegroundColor Yellow

    # Open the report automatically
    try {
        Start-Process notepad.exe -ArgumentList $OutputPath
    } catch {
        Write-Host "Report could not be opened automatically." -ForegroundColor Yellow
    }
} else {
    Write-Host "Diagnostics available in console only (file could not be created)" -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Green
