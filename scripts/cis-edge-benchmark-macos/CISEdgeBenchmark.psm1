# CISEdgeBenchmark.psm1 (macOS)
# Audit and enforce Microsoft Edge settings against CIS Benchmark v4.0.0
# Adapted for macOS / PowerShell Core 7+
#
# macOS policy storage (in precedence order):
#   /Library/Managed Preferences/com.microsoft.Edge   <- MDM-deployed (read-only)
#   /Library/Preferences/com.microsoft.Edge           <- System-level (requires root to write)
#
# Usage:
#   Import-Module ./CISEdgeBenchmark.psd1
#   Invoke-CISEdgeAudit           # audit + open dashboard
#   Invoke-CISEdgeEnforce         # enforce L1 settings (requires sudo)
#   Show-CISEdgeDashboard         # open dashboard without re-auditing

$script:ModuleRoot          = $PSScriptRoot
$script:ChecksFile          = Join-Path $script:ModuleRoot "cis_checks.json"
$script:OutputPath          = Join-Path $script:ModuleRoot "audit_results.json"
$script:JsPath              = Join-Path $script:ModuleRoot "audit_results.js"
$script:LogFile             = Join-Path $script:ModuleRoot "enforcement_log.txt"
$script:DashPath            = Join-Path $script:ModuleRoot "dashboard.html"
$script:BackupDir           = Join-Path $script:ModuleRoot "backups"
$script:ServerPort          = 18989

# CSRF capability token. Generated once per PowerShell session (on first use)
# and embedded into audit_results.js so only the locally-opened dashboard can
# read it. Re-audits in the same session reuse the same token.
# The /enforce endpoint rejects any request lacking this exact token,
# which prevents a malicious website (that the user happens to visit
# while the root-privileged server is running) from triggering
# enforcement via a cross-site fetch.
$script:EnforceToken        = $null
$script:MaxRequestBytes     = 65536   # reject oversized POST bodies

# macOS Edge policy domains (defaults command domains / plist paths)
$script:EdgeManagedDomain   = "/Library/Managed Preferences/com.microsoft.Edge"
$script:EdgeSystemDomain    = "/Library/Preferences/com.microsoft.Edge"

# ═══════════════════════════════════════════════════════════════════════════
# PRIVATE HELPERS
# ═══════════════════════════════════════════════════════════════════════════

# On macOS the registry path in cis_checks.json is irrelevant (Windows-only).
# All Edge policies live in the com.microsoft.Edge plist domain.
# This stub exists so the rest of the code compiles without modification.
function Convert-CISRegPath {
    param([string]$Path)
    return $Path   # not used on macOS – kept for structural compatibility
}

# Read an Edge policy value via the macOS `defaults` command.
# Checks the MDM-managed domain first, then the system-level domain.
# Returns $null when the policy is not configured in either location.
function Get-CISRegValue {
    param(
        [string]$PsPath,   # ignored on macOS (Windows registry path)
        [string]$Name      # Edge policy name, e.g. "SmartScreenEnabled"
    )

    $domains = @($script:EdgeManagedDomain, $script:EdgeSystemDomain)

    foreach ($domain in $domains) {
        # Run `defaults read <domain> <key>` and capture output + exit code
        $output = & /usr/bin/defaults read $domain $Name 2>&1
        if ($LASTEXITCODE -eq 0) {
            # Filter out any PowerShell ErrorRecord objects (from stderr)
            $value = ($output |
                        Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } |
                        Out-String).Trim()
            if ($value -ne '') { return $value }
        }
    }

    return $null
}

function Write-CISLog {
    param([string]$Message)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $script:LogFile -Value "[$ts] $Message" -Encoding UTF8
}

function Get-CISChecks {
    param([string]$Level = "All")
    if (-not (Test-Path $script:ChecksFile)) {
        throw "Cannot find checks file: $($script:ChecksFile)"
    }
    $all = Get-Content -Path $script:ChecksFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($Level -eq "All") { return $all }
    return @($all | Where-Object { $_.level -eq $Level })
}

# Returns $true when the current process is running as root (uid 0).
function Test-IsAdmin {
    return ((& /usr/bin/id -u 2>/dev/null).Trim() -eq "0")
}

# Returns the macOS computer/host name.
function Get-MacComputerName {
    $name = (& /usr/sbin/scutil --get ComputerName 2>/dev/null | Out-String).Trim()
    if (-not $name) { $name = [System.Net.Dns]::GetHostName() }
    return $name
}

# Returns the per-session CSRF capability token, generating a fresh
# cryptographically-random 256-bit value on first use. Embedded into
# audit_results.js and required by the /enforce endpoint.
function Get-CISEnforceToken {
    if ([string]::IsNullOrEmpty($script:EnforceToken)) {
        $bytes = [byte[]]::new(32)
        [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
        $script:EnforceToken = ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLower()
    }
    return $script:EnforceToken
}

# Writes audit JSON to disk and the JS data file consumed by the dashboard,
# embedding the current CSRF token alongside the audit data. Centralizes the
# two write sites so the token is always present. The JS file holds the
# capability token, so it is restricted to the owner (chmod 600) to keep
# other local users from reading it and forging enforcement requests.
function Write-CISResultFiles {
    param([Parameter(Mandatory)][string]$Json)
    $token = Get-CISEnforceToken
    $Json | Out-File -FilePath $script:OutputPath -Encoding UTF8 -Force
    "window.AUDIT_DATA = $Json;`r`nwindow.ENFORCE_TOKEN = `"$token`";" |
        Out-File -FilePath $script:JsPath -Encoding UTF8 -Force
    foreach ($p in @($script:OutputPath, $script:JsPath)) {
        try { & /bin/chmod 600 $p 2>$null } catch {}
    }
}

# Constant-time string comparison to avoid leaking the token via timing.
function Test-CISTokenEqual {
    param([string]$A, [string]$B)
    if ([string]::IsNullOrEmpty($A) -or [string]::IsNullOrEmpty($B)) { return $false }
    if ($A.Length -ne $B.Length) { return $false }
    $diff = 0
    for ($i = 0; $i -lt $A.Length; $i++) {
        $diff = $diff -bor ([int][char]$A[$i] -bxor [int][char]$B[$i])
    }
    return ($diff -eq 0)
}

# Numeric equality that tolerates non-numeric `defaults read` output. A
# misconfigured policy can return a string/dict where an integer is expected;
# a bare [int] cast would throw and abort the whole audit loop. Falls back to
# a trimmed string comparison when either side is not an integer.
function Test-CISNumericEqual {
    param($Current, $Expected)
    $c = 0; $e = 0
    if ([int]::TryParse("$Current", [ref]$c) -and [int]::TryParse("$Expected", [ref]$e)) {
        return ($c -eq $e)
    }
    return ("$Current".Trim() -eq "$Expected".Trim())
}

# Creates a timestamped backup of the Edge system-preferences plist before
# enforcement mutates it. Returns the backup file path, or $null when there is
# nothing to back up (the plist does not exist yet) or the copy failed. Backups
# are chmod 600 because they can contain the full Edge policy set. Callers must
# treat a $null return during a real (non-dry) run as "no safety net" and let
# the operator decide whether to continue.
function New-CISEdgeBackup {
    $plist = "$($script:EdgeSystemDomain).plist"
    if (-not (Test-Path $plist)) {
        Write-CISLog "Backup skipped: $plist does not exist yet (nothing to back up)."
        return $null
    }
    if (-not (Test-Path $script:BackupDir)) {
        New-Item -ItemType Directory -Path $script:BackupDir -Force | Out-Null
    }
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $dest  = Join-Path $script:BackupDir "com.microsoft.Edge.$stamp.plist"
    try {
        Copy-Item -Path $plist -Destination $dest -Force
        try { & /bin/chmod 600 $dest 2>$null } catch {}
        Write-CISLog "Backup created: $dest"
        return $dest
    } catch {
        Write-CISLog "Backup FAILED: $($_.Exception.Message)"
        return $null
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# PRIVATE: Silent re-audit (updates JSON/JS after enforcement)
# ═══════════════════════════════════════════════════════════════════════════

function Update-AuditResults {
    $checks = Get-CISChecks -Level "All"
    $results = @()
    $passCount = 0; $failCount = 0; $notConfCount = 0; $reviewCount = 0

    foreach ($check in $checks) {
        $currentVal = Get-CISRegValue -PsPath $check.regPath -Name $check.regValueName
        $expected   = if ($check.regType -eq "REG_SZ") { $check.stringValue } else { $check.numericValue }

        $status = ""; $detail = ""

        if ($null -eq $currentVal) {
            $status = "FAIL"; $detail = "Not configured (policy value does not exist)"
        }
        elseif ($null -eq $expected) {
            $status = "REVIEW"; $detail = "Current: $currentVal - no recommended value defined"
        }
        elseif ($check.regType -eq "REG_SZ") {
            if ([string]$currentVal.Trim() -eq [string]$expected.Trim()) {
                $status = "PASS"; $detail = "Matches recommendation"
            } else {
                $status = "FAIL"; $detail = "Current '$currentVal' != recommended '$expected'"
            }
        }
        else {
            if (Test-CISNumericEqual $currentVal $expected) {
                $status = "PASS"; $detail = "Matches recommendation"
            } else {
                $status = "FAIL"; $detail = "Current '$currentVal' != recommended '$expected'"
            }
        }

        $outputStatus = $status
        if ($status -eq "FAIL" -and $detail -match "Not configured") { $outputStatus = "NOT CONFIGURED" }

        switch ($status) {
            "PASS"   { $passCount++ }
            "REVIEW" { $reviewCount++ }
            "FAIL"   { if ($detail -match "Not configured") { $notConfCount++ } else { $failCount++ } }
        }

        $results += [PSCustomObject]@{
            id                 = $check.id
            level              = $check.level
            title              = $check.title
            regPath            = $check.regPath
            valueName          = $check.regValueName
            regType            = $check.regType
            currentValue       = $currentVal
            recommendedValue   = $expected
            recommendedDisplay = $check.recommendedValue
            status             = $outputStatus
            detail             = $detail
        }
    }

    $output = [PSCustomObject]@{
        timestamp     = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
        computer      = (Get-MacComputerName)
        totalChecks   = $checks.Count
        passed        = $passCount
        failed        = $failCount
        notConfigured = $notConfCount
        review        = $reviewCount
        results       = @($results)
    }

    $json = $output | ConvertTo-Json -Depth 5
    Write-CISResultFiles -Json $json

    return $json
}

# ═══════════════════════════════════════════════════════════════════════════
# PRIVATE: Foreground HTTP server for dashboard enforcement
# ═══════════════════════════════════════════════════════════════════════════

function Start-CISEnforceServer {
    $port   = $script:ServerPort
    $prefix = "http://localhost:${port}/"

    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($prefix)

    try { $listener.Start() } catch {
        Write-Host "  Could not start enforcement server on port ${port}: $_" -ForegroundColor Yellow
        Write-Host "  Dashboard enforce buttons will not work." -ForegroundColor DarkGray
        return
    }

    $isAdmin = Test-IsAdmin

    Write-Host ""
    Write-Host "  Enforcement server running on port $port" -ForegroundColor Green
    if ($isAdmin) {
        Write-Host "  Running as root - enforcement is enabled." -ForegroundColor Green
    } else {
        Write-Host "  NOT running as root - enforcement will fail." -ForegroundColor Yellow
        Write-Host "  Restart with: sudo pwsh -Command 'Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeAudit'" -ForegroundColor Yellow
    }
    Write-Host "  Use the dashboard Enforce buttons. Press Ctrl+C to stop." -ForegroundColor DarkGray
    Write-Host ""

    try {
        while ($listener.IsListening) {
            $async = $listener.BeginGetContext($null, $null)
            while (-not $async.AsyncWaitHandle.WaitOne(500)) { }
            $context = $listener.EndGetContext($async)

            $resp = $context.Response
            # CORS stays permissive so the file:// dashboard (Origin "null")
            # can call the API, but the X-Enforce-Token requirement below is
            # the actual access control: a cross-site attacker can pass the
            # preflight yet cannot read the token, so /enforce rejects it.
            $resp.Headers.Add("Access-Control-Allow-Origin", "*")
            $resp.Headers.Add("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            $resp.Headers.Add("Access-Control-Allow-Headers", "Content-Type, X-Enforce-Token")

            if ($context.Request.HttpMethod -eq "OPTIONS") {
                $resp.StatusCode = 204; $resp.Close(); continue
            }

            $path = $context.Request.Url.AbsolutePath

            # --- /ping ---
            # Liveness only. Deliberately does NOT report the admin/root status:
            # with CORS "*", any visited website could otherwise read it and
            # fingerprint that the root-privileged tool is running.
            if ($path -eq "/ping") {
                $body = "{`"status`":`"ok`"}"
                $buf  = [System.Text.Encoding]::UTF8.GetBytes($body)
                $resp.ContentType = "application/json"
                $resp.StatusCode  = 200
                $resp.OutputStream.Write($buf, 0, $buf.Length)
                $resp.Close()
                continue
            }

            # --- /enforce ---
            if ($path -eq "/enforce" -and $context.Request.HttpMethod -eq "POST") {

                # CSRF protection: require the capability token that was
                # embedded into audit_results.js for this run. A malicious
                # website cannot read that token, so it cannot forge a valid
                # enforcement request against this root-privileged server.
                $reqToken = $context.Request.Headers["X-Enforce-Token"]
                if (-not (Test-CISTokenEqual $reqToken $script:EnforceToken)) {
                    $jsonResp = '{"status":"error","message":"Forbidden: invalid or missing enforcement token. Reload the dashboard opened by Invoke-CISEdgeAudit."}'
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($jsonResp)
                    $resp.ContentType = "application/json"
                    $resp.StatusCode  = 403
                    $resp.OutputStream.Write($buf, 0, $buf.Length)
                    $resp.Close()
                    Write-CISLog "Rejected /enforce request with invalid token from $($context.Request.RemoteEndPoint)"
                    continue
                }

                # Reject oversized bodies before reading them into memory.
                # ContentLength64 is -1 for chunked/unknown-length requests,
                # which would otherwise bypass the size cap, so reject those too.
                $clen = $context.Request.ContentLength64
                if ($clen -lt 0 -or $clen -gt $script:MaxRequestBytes) {
                    $jsonResp = '{"status":"error","message":"Request body too large or missing Content-Length."}'
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($jsonResp)
                    $resp.ContentType = "application/json"
                    $resp.StatusCode  = 413
                    $resp.OutputStream.Write($buf, 0, $buf.Length)
                    $resp.Close()
                    continue
                }

                $reader  = New-Object System.IO.StreamReader($context.Request.InputStream)
                $reqBody = $reader.ReadToEnd()
                $reader.Close()

                $jsonResp = '{"status":"error","message":"Unknown error"}'

                if (-not $isAdmin) {
                    $jsonResp = '{"status":"error","message":"Not running as root. Close terminal, re-open with sudo pwsh, then run Invoke-CISEdgeAudit again."}'
                } else {
                    try {
                        $data = $reqBody | ConvertFrom-Json

                        Write-Host ""
                        Write-Host ("=" * 70) -ForegroundColor Cyan
                        Write-Host "  Enforcement request from dashboard" -ForegroundColor Cyan
                        Write-Host ("=" * 70) -ForegroundColor Cyan

                        if ($data.checkIds) {
                            Invoke-CISEdgeEnforce -CheckIds $data.checkIds -Level All -AutoConfirm
                        } else {
                            Invoke-CISEdgeEnforce -OnlyFailed -Level All -AutoConfirm
                        }

                        Write-Host "  Updating audit results..." -ForegroundColor DarkGray
                        $updatedJson = Update-AuditResults

                        $jsonResp = "{`"status`":`"ok`",`"message`":`"Enforcement completed.`",`"updatedData`":$updatedJson}"
                    } catch {
                        # Log full detail locally; return a generic message so
                        # internal paths/state are not leaked over HTTP.
                        Write-CISLog "Enforce handler error: $($_.Exception.Message)"
                        $jsonResp = '{"status":"error","message":"Enforcement failed. See the PowerShell window and enforcement_log.txt for details."}'
                    }
                }

                $buf = [System.Text.Encoding]::UTF8.GetBytes($jsonResp)
                $resp.ContentType = "application/json"
                $resp.StatusCode  = 200
                $resp.OutputStream.Write($buf, 0, $buf.Length)
                $resp.Close()
                continue
            }

            $resp.StatusCode = 404; $resp.Close()
        }
    } finally {
        try { $listener.Stop(); $listener.Close() } catch {}
        Write-Host "  Enforcement server stopped." -ForegroundColor DarkGray
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# PUBLIC: Invoke-CISEdgeAudit
# ═══════════════════════════════════════════════════════════════════════════

function Invoke-CISEdgeAudit {
    <#
    .SYNOPSIS
        Audits Microsoft Edge settings against CIS Benchmark v4.0.0 on macOS.

    .DESCRIPTION
        Reads Edge policy values from the macOS defaults system
        (/Library/Managed Preferences/com.microsoft.Edge and
        /Library/Preferences/com.microsoft.Edge), compares against CIS
        recommendations, produces colorized console output and JSON results,
        opens the interactive HTML dashboard, then starts an enforcement
        server so dashboard Enforce buttons work.

        The function stays active (serving enforcement requests) until you
        press Ctrl+C. Keep this terminal window open while using the dashboard.

    .PARAMETER Level
        Filter checks by CIS level: "L1", "L2", or "All" (default).

    .EXAMPLE
        Invoke-CISEdgeAudit
        Runs all 128 checks, opens dashboard, enables enforcement.

    .EXAMPLE
        Invoke-CISEdgeAudit -Level L1
        Audits only Level 1 checks.

    .NOTES
        Any user can run the audit.
        For enforcement, run with: sudo pwsh -Command '...; Invoke-CISEdgeAudit'
    #>
    [CmdletBinding()]
    param(
        [ValidateSet("L1", "L2", "All")]
        [string]$Level = "All"
    )

    $computerName = Get-MacComputerName

    Write-Host ""
    Write-Host ("=" * 78) -ForegroundColor Cyan
    Write-Host "  CIS Microsoft Edge Benchmark v4.0.0 - Audit (macOS)" -ForegroundColor Cyan
    Write-Host "  Date     : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
    Write-Host "  Host     : $computerName" -ForegroundColor Cyan
    Write-Host "  Level    : $Level" -ForegroundColor Cyan
    Write-Host ("=" * 78) -ForegroundColor Cyan
    Write-Host ""

    try {
        $checks = Get-CISChecks -Level $Level
    } catch {
        Write-Host "ERROR: $_" -ForegroundColor Red
        return
    }

    $totalChecks = @($checks).Count
    if ($totalChecks -eq 0) {
        Write-Host "No checks matched level $Level." -ForegroundColor Yellow
        return
    }

    Write-Host "  Running $totalChecks checks..." -ForegroundColor DarkGray
    Write-Host ("-" * 78) -ForegroundColor DarkGray

    $results = @()
    $passCount = 0; $failCount = 0; $notConfCount = 0; $reviewCount = 0; $idx = 0

    foreach ($check in $checks) {
        $idx++
        $currentVal = Get-CISRegValue -PsPath $check.regPath -Name $check.regValueName
        $expected   = if ($check.regType -eq "REG_SZ") { $check.stringValue } else { $check.numericValue }

        $status = ""; $detail = ""

        if ($null -eq $currentVal) {
            $status = "FAIL"; $detail = "Not configured (policy value does not exist)"
        }
        elseif ($null -eq $expected) {
            $status = "REVIEW"; $detail = "Current: $currentVal - no recommended value defined"
        }
        elseif ($check.regType -eq "REG_SZ") {
            if ([string]$currentVal.Trim() -eq [string]$expected.Trim()) {
                $status = "PASS"; $detail = "Matches recommendation"
            } else {
                $status = "FAIL"; $detail = "Current '$currentVal' != recommended '$expected'"
            }
        }
        else {
            if (Test-CISNumericEqual $currentVal $expected) {
                $status = "PASS"; $detail = "Matches recommendation"
            } else {
                $status = "FAIL"; $detail = "Current '$currentVal' != recommended '$expected'"
            }
        }

        $prefix = "[{0,3}/{1}]" -f $idx, $totalChecks
        switch ($status) {
            "PASS"   { Write-Host "$prefix [PASS] $($check.id)  $($check.title)" -ForegroundColor Green }
            "REVIEW" { Write-Host "$prefix [REV ] $($check.id)  $($check.title)" -ForegroundColor Yellow
                       Write-Host "               -> $detail" -ForegroundColor DarkGray }
            "FAIL"   {
                if ($detail -match "Not configured") {
                    Write-Host "$prefix [N/C ] $($check.id)  $($check.title)" -ForegroundColor Yellow
                } else {
                    Write-Host "$prefix [FAIL] $($check.id)  $($check.title)" -ForegroundColor Red
                }
                Write-Host "               -> $detail" -ForegroundColor DarkGray
            }
        }

        switch ($status) {
            "PASS"   { $passCount++ }
            "REVIEW" { $reviewCount++ }
            "FAIL"   { if ($detail -match "Not configured") { $notConfCount++ } else { $failCount++ } }
        }

        $outputStatus = $status
        if ($status -eq "FAIL" -and $detail -match "Not configured") { $outputStatus = "NOT CONFIGURED" }

        $results += [PSCustomObject]@{
            id                 = $check.id
            level              = $check.level
            title              = $check.title
            regPath            = $check.regPath
            valueName          = $check.regValueName
            regType            = $check.regType
            currentValue       = $currentVal
            recommendedValue   = $expected
            recommendedDisplay = $check.recommendedValue
            status             = $outputStatus
            detail             = $detail
        }
    }

    $output = [PSCustomObject]@{
        timestamp     = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
        computer      = $computerName
        totalChecks   = $totalChecks
        passed        = $passCount
        failed        = $failCount
        notConfigured = $notConfCount
        review        = $reviewCount
        results       = @($results)
    }

    try {
        $json = $output | ConvertTo-Json -Depth 5
        Write-CISResultFiles -Json $json
    } catch {
        Write-Host "ERROR: Failed to write results: $_" -ForegroundColor Red
        return
    }

    $pctPass = if ($totalChecks -gt 0) { [math]::Round(($passCount / $totalChecks) * 100, 1) } else { 0 }
    Write-Host ""
    Write-Host ("=" * 78) -ForegroundColor Cyan
    Write-Host "  AUDIT SUMMARY" -ForegroundColor Cyan
    Write-Host ("=" * 78) -ForegroundColor Cyan
    Write-Host ""
    Write-Host ("  Passed         : {0}  ({1}%)" -f $passCount, $pctPass) -ForegroundColor Green
    Write-Host ("  Failed         : {0}" -f $failCount) -ForegroundColor Red
    Write-Host ("  Not Configured : {0}" -f $notConfCount) -ForegroundColor Yellow
    Write-Host ("  Manual Review  : {0}" -f $reviewCount) -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Total Checks   : $totalChecks"
    Write-Host ""
    Write-Host "  Results: $($script:OutputPath)" -ForegroundColor Cyan
    Write-Host ("=" * 78) -ForegroundColor Cyan

    # Open dashboard using macOS `open` command
    if (Test-Path $script:DashPath) {
        Write-Host ""
        Write-Host "  Opening dashboard..." -ForegroundColor Cyan
        & /usr/bin/open $script:DashPath
    }

    Start-CISEnforceServer
}

# ═══════════════════════════════════════════════════════════════════════════
# PUBLIC: Invoke-CISEdgeEnforce
# ═══════════════════════════════════════════════════════════════════════════

function Invoke-CISEdgeEnforce {
    <#
    .SYNOPSIS
        Enforces CIS Microsoft Edge Benchmark v4.0.0 settings on macOS.

    .DESCRIPTION
        Writes CIS recommended policy values to the macOS Edge preferences
        via the `defaults` command (/Library/Preferences/com.microsoft.Edge).
        Requires root privileges (run with sudo).

    .PARAMETER Level
        Filter by CIS level: "L1", "L2", or "All". Default is "L1".

    .PARAMETER CheckIds
        Optional specific check IDs to enforce (e.g., "1.2.1","1.39").

    .PARAMETER OnlyFailed
        Only enforce checks that failed in the last audit.

    .PARAMETER DryRun
        Preview changes without writing any values.

    .PARAMETER AutoConfirm
        Skip the confirmation prompt.

    .EXAMPLE
        sudo pwsh -Command 'Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeEnforce'

    .EXAMPLE
        Invoke-CISEdgeEnforce -OnlyFailed
        Enforce only failed checks from the last audit.

    .EXAMPLE
        Invoke-CISEdgeEnforce -DryRun
        Preview what would be changed without writing anything.

    .NOTES
        Must be run as root (writes /Library/Preferences/com.microsoft.Edge).
        Use -DryRun to preview without root privileges.
    #>
    [CmdletBinding()]
    param(
        [ValidateSet("L1", "L2", "All")]
        [string]$Level = "L1",

        [string[]]$CheckIds,

        [switch]$OnlyFailed,

        [switch]$DryRun,

        [switch]$AutoConfirm,

        [switch]$NoBackup
    )

    $isAdmin = Test-IsAdmin

    if (-not $isAdmin -and -not $DryRun) {
        Write-Host "ERROR: Enforcement requires root. Run with:" -ForegroundColor Red
        Write-Host "  sudo pwsh -Command 'Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeEnforce'" -ForegroundColor Yellow
        Write-Host "Or use -DryRun to preview without root." -ForegroundColor DarkGray
        return
    }
    if (-not $isAdmin -and $DryRun) {
        Write-Host "WARNING: Not running as root. Dry-run only." -ForegroundColor Yellow
        Write-Host ""
    }

    try {
        $checks = Get-CISChecks -Level $Level
    } catch {
        Write-Host "ERROR: $_" -ForegroundColor Red
        return
    }

    if ($CheckIds -and $CheckIds.Count -gt 0) {
        $checks = @($checks | Where-Object { $CheckIds -contains $_.id })
    }

    if ($OnlyFailed) {
        if (-not (Test-Path $script:OutputPath)) {
            Write-Host "ERROR: -OnlyFailed specified but no audit results found. Run Invoke-CISEdgeAudit first." -ForegroundColor Red
            return
        }
        $audit = Get-Content $script:OutputPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $failStatuses = @("FAIL", "NOT CONFIGURED", "Not Configured")
        $failedIds = @($audit.results | Where-Object { $failStatuses -contains $_.status } | ForEach-Object { $_.id })
        $checks = @($checks | Where-Object { $failedIds -contains $_.id })
        Write-Host "  Audit results: $($failedIds.Count) failed check(s) found." -ForegroundColor Yellow
    }

    $enforceable = @($checks | Where-Object { $null -ne $_.numericValue -or $null -ne $_.stringValue })
    $skipped = $checks.Count - $enforceable.Count

    if ($enforceable.Count -eq 0) {
        Write-Host "No enforceable checks match the filters." -ForegroundColor Yellow
        return
    }

    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  CIS Microsoft Edge Benchmark - Enforcement (macOS)" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Level       : $Level"
    Write-Host "  Only failed : $OnlyFailed"
    Write-Host "  Dry run     : $DryRun"
    Write-Host "  Check IDs   : $(if ($CheckIds) { $CheckIds -join ', ' } else { '(all)' })"
    Write-Host "  Checks      : $($enforceable.Count)"
    Write-Host ""

    $planItems = @()
    foreach ($c in $enforceable) {
        $current = Get-CISRegValue -PsPath $c.regPath -Name $c.regValueName
        $desired = if ($c.regType -eq "REG_SZ") { $c.stringValue } else { $c.numericValue }
        # Normalize for comparison (defaults read returns strings for all types)
        $ok = ($null -ne $current -and "$current".Trim() -eq "$desired")
        $planItems += [PSCustomObject]@{ Check=$c; Current=$current; Desired=$desired; OK=$ok }
    }

    $toChange  = @($planItems | Where-Object { -not $_.OK })
    $alreadyOk = @($planItems | Where-Object { $_.OK })

    Write-Host "  Already compliant : $($alreadyOk.Count)" -ForegroundColor Green
    Write-Host "  Changes needed    : $($toChange.Count)" -ForegroundColor $(if ($toChange.Count -gt 0) { 'Yellow' } else { 'Green' })
    Write-Host ""

    if ($toChange.Count -eq 0) {
        Write-Host "All targeted checks are already compliant." -ForegroundColor Green
        return
    }

    Write-Host "Planned changes:" -ForegroundColor White
    Write-Host ("-" * 70) -ForegroundColor DarkGray
    foreach ($item in $toChange) {
        $curDisp = if ($null -ne $item.Current) { $item.Current } else { "(not set)" }
        Write-Host "  [$($item.Check.id)] $($item.Check.title)" -ForegroundColor White
        $typeFlag = if ($item.Check.regType -eq "REG_SZ") { "-string" } else { "-int" }
        Write-Host "    defaults write $($script:EdgeSystemDomain) $($item.Check.regValueName) $typeFlag $($item.Desired)" -ForegroundColor DarkGray
        Write-Host "    Current : $curDisp" -ForegroundColor Red
        Write-Host "    Desired : $($item.Desired)" -ForegroundColor Green
        Write-Host ""
    }

    if (-not $DryRun -and -not $AutoConfirm) {
        Write-Host "Apply these $($toChange.Count) change(s)? [Y/N] " -ForegroundColor Yellow -NoNewline
        $resp = Read-Host
        if ($resp -notmatch '^[Yy]') {
            Write-Host "Aborted." -ForegroundColor Yellow
            Write-CISLog "Enforcement aborted by user."
            return
        }
    }

    if ($DryRun) {
        Write-Host ("=" * 70) -ForegroundColor Cyan
        Write-Host "  DRY RUN - No changes made." -ForegroundColor Cyan
        Write-Host ("=" * 70) -ForegroundColor Cyan
        return
    }

    # Safety net: back up the current Edge system plist before mutating it, so
    # the operator can roll back with Invoke-CISEdgeRestore. Skipped with
    # -NoBackup. A failed/absent backup is surfaced but does not hard-stop
    # (there may simply be no plist yet on a fresh machine).
    if (-not $NoBackup) {
        $backupPath = New-CISEdgeBackup
        if ($backupPath) {
            Write-Host "  Backup created    : $backupPath" -ForegroundColor DarkGray
        } else {
            Write-Host "  Backup            : none (no existing plist or copy failed - see log)" -ForegroundColor DarkYellow
        }
        Write-Host ""
    }

    Write-Host ""
    Write-Host "Applying..." -ForegroundColor Cyan
    Write-Host ("-" * 70) -ForegroundColor DarkGray
    Write-CISLog "--- Enforcement started --- Level=$Level Checks=$($toChange.Count)"

    $okCount = 0; $errCount = 0

    foreach ($item in $toChange) {
        $c = $item.Check
        try {
            $typeFlag = if ($c.regType -eq "REG_SZ") { "-string" } else { "-int" }

            $result = & /usr/bin/defaults write $script:EdgeSystemDomain $c.regValueName $typeFlag "$($item.Desired)" 2>&1
            $exitCode = $LASTEXITCODE

            if ($exitCode -eq 0) {
                # Verify the write
                $verify = Get-CISRegValue -PsPath $c.regPath -Name $c.regValueName
                if ("$verify".Trim() -eq "$($item.Desired)") {
                    Write-Host "  [OK]   [$($c.id)] $($c.title)" -ForegroundColor Green
                    Write-CISLog "OK   [$($c.id)] $($c.regValueName) = $($item.Desired)"
                } else {
                    Write-Host "  [WARN] [$($c.id)] written but verify returned: $verify" -ForegroundColor Yellow
                    Write-CISLog "WARN [$($c.id)] verify=$verify expected=$($item.Desired)"
                }
                $okCount++
            } else {
                $errMsg = ($result | Out-String).Trim()
                Write-Host "  [FAIL] [$($c.id)] $($c.title) - $errMsg" -ForegroundColor Red
                Write-CISLog "FAIL [$($c.id)] $errMsg"
                $errCount++
            }
        } catch {
            Write-Host "  [FAIL] [$($c.id)] $($c.title) - $($_.Exception.Message)" -ForegroundColor Red
            Write-CISLog "FAIL [$($c.id)] $($_.Exception.Message)"
            $errCount++
        }
    }

    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  Enforcement Complete" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  Already compliant : $($alreadyOk.Count)" -ForegroundColor Green
    Write-Host "  Applied           : $okCount" -ForegroundColor Green
    Write-Host "  Failed            : $errCount" -ForegroundColor $(if ($errCount -gt 0) { 'Red' } else { 'Green' })
    if ($skipped -gt 0) {
        Write-Host "  Skipped (no value): $skipped" -ForegroundColor DarkYellow
    }
    Write-Host "  Log: $($script:LogFile)" -ForegroundColor DarkGray
    Write-Host ""
    Write-CISLog "--- Enforcement done --- OK=$okCount Failed=$errCount"
}

# ═══════════════════════════════════════════════════════════════════════════
# PUBLIC: Invoke-CISEdgeRestore
# ═══════════════════════════════════════════════════════════════════════════

function Invoke-CISEdgeRestore {
    <#
    .SYNOPSIS
        Restores the Edge system-preferences plist from a backup created by
        Invoke-CISEdgeEnforce.

    .DESCRIPTION
        Every enforcement run (unless started with -NoBackup) copies the current
        /Library/Preferences/com.microsoft.Edge.plist into the module's backups/
        folder with a timestamp. This cmdlet copies a chosen backup back over the
        live plist, undoing enforcement changes. Requires root (run with sudo).

        After restoring, macOS may keep the old values cached in cfprefsd; the
        cmdlet refreshes the cache and recommends restarting Edge.

    .PARAMETER BackupFile
        Path to a specific backup file. When omitted, the most recent backup is
        used. Accepts either a bare filename (resolved inside backups/) or a
        full path.

    .PARAMETER List
        List available backups (newest first) and exit without restoring.

    .PARAMETER AutoConfirm
        Skip the confirmation prompt.

    .EXAMPLE
        Invoke-CISEdgeRestore -List
        Show all available backups.

    .EXAMPLE
        sudo pwsh -Command 'Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeRestore'
        Restore the most recent backup.

    .EXAMPLE
        sudo pwsh -Command 'Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeRestore -BackupFile com.microsoft.Edge.20260721-120000.plist'
        Restore a specific backup.

    .NOTES
        Must be run as root to write /Library/Preferences (except -List).
    #>
    [CmdletBinding()]
    param(
        [string]$BackupFile,

        [switch]$List,

        [switch]$AutoConfirm
    )

    $backups = @()
    if (Test-Path $script:BackupDir) {
        $backups = @(Get-ChildItem -Path $script:BackupDir -Filter "com.microsoft.Edge.*.plist" -File |
                        Sort-Object LastWriteTime -Descending)
    }

    if ($List) {
        Write-Host ""
        Write-Host "  Available Edge plist backups:" -ForegroundColor Cyan
        Write-Host ("-" * 70) -ForegroundColor DarkGray
        if ($backups.Count -eq 0) {
            Write-Host "  (none) - no backups in $($script:BackupDir)" -ForegroundColor DarkGray
        } else {
            foreach ($b in $backups) {
                $when = $b.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
                $size = "{0:N0} bytes" -f $b.Length
                Write-Host ("  {0}   {1,-14}  {2}" -f $when, $size, $b.Name) -ForegroundColor White
            }
        }
        Write-Host ""
        return
    }

    if ($backups.Count -eq 0) {
        Write-Host "ERROR: No backups found in $($script:BackupDir)." -ForegroundColor Red
        Write-Host "Backups are created automatically by Invoke-CISEdgeEnforce (unless -NoBackup)." -ForegroundColor DarkGray
        return
    }

    # Resolve which backup to restore.
    if ($BackupFile) {
        $candidate = if (Test-Path $BackupFile) { $BackupFile } else { Join-Path $script:BackupDir $BackupFile }
        if (-not (Test-Path $candidate)) {
            Write-Host "ERROR: Backup not found: $BackupFile" -ForegroundColor Red
            Write-Host "Use -List to see available backups." -ForegroundColor DarkGray
            return
        }
        $target = Get-Item $candidate
    } else {
        $target = $backups[0]
    }

    if (-not (Test-IsAdmin)) {
        Write-Host "ERROR: Restore requires root. Run with:" -ForegroundColor Red
        Write-Host "  sudo pwsh -Command 'Import-Module ./CISEdgeBenchmark.psd1; Invoke-CISEdgeRestore'" -ForegroundColor Yellow
        return
    }

    $plist = "$($script:EdgeSystemDomain).plist"

    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  CIS Microsoft Edge Benchmark - Restore (macOS)" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Restore from : $($target.FullName)" -ForegroundColor White
    Write-Host "  Backup date  : $($target.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor White
    Write-Host "  Restore to   : $plist" -ForegroundColor White
    Write-Host ""

    if (-not $AutoConfirm) {
        Write-Host "This overwrites the current Edge policy plist. Continue? [Y/N] " -ForegroundColor Yellow -NoNewline
        $resp = Read-Host
        if ($resp -notmatch '^[Yy]') {
            Write-Host "Aborted." -ForegroundColor Yellow
            Write-CISLog "Restore aborted by user."
            return
        }
    }

    try {
        Copy-Item -Path $target.FullName -Destination $plist -Force
        try { & /bin/chmod 600 $plist 2>$null } catch {}
        # Drop the cached prefs so Edge reads the restored values on next launch.
        try { & /usr/bin/killall cfprefsd 2>$null } catch {}
        Write-Host "  [OK] Restored $plist from $($target.Name)" -ForegroundColor Green
        Write-Host "  Restart Microsoft Edge for the restored values to take effect." -ForegroundColor DarkGray
        Write-Host ""
        Write-CISLog "Restore OK: $plist <- $($target.FullName)"
    } catch {
        Write-Host "  [FAIL] Restore failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-CISLog "Restore FAILED: $($_.Exception.Message)"
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# PUBLIC: Show-CISEdgeDashboard
# ═══════════════════════════════════════════════════════════════════════════

function Show-CISEdgeDashboard {
    <#
    .SYNOPSIS
        Opens the CIS Edge Benchmark audit dashboard in the default browser.

    .EXAMPLE
        Show-CISEdgeDashboard
    #>
    [CmdletBinding()]
    param()

    if (Test-Path $script:DashPath) {
        & /usr/bin/open $script:DashPath
    } else {
        Write-Host "ERROR: Dashboard not found at $($script:DashPath)" -ForegroundColor Red
    }
}
