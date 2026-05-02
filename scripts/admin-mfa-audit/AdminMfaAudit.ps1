#Requires -Modules Microsoft.Graph.Authentication, Microsoft.Graph.Identity.DirectoryManagement, Microsoft.Graph.Users

<#
.SYNOPSIS
    Audits MFA methods for all privileged admin users in Microsoft Entra ID.

.DESCRIPTION
    Connects to Microsoft Graph, enumerates all admin role members, checks each
    user's registered authentication methods via the Beta endpoint, classifies
    their MFA strength (Phishing-Resistant / Standard / Weak / None), and writes
    a formatted text report to C:\Temp\AdminMfaAudit.txt.

.NOTES
    Required API permissions (Delegated):
        RoleManagement.Read.All
        UserAuthenticationMethod.Read.All
        User.Read.All
#>

$requiredScopes = @(
    "RoleManagement.Read.All",
    "UserAuthenticationMethod.Read.All",
    "User.Read.All"
)

Write-Host "`nVerbinde mit Microsoft Graph..." -ForegroundColor Cyan
Connect-MgGraph -Scopes $requiredScopes -NoWelcome -ErrorAction Stop
Write-Host "Verbunden als: $((Get-MgContext).Account)`n" -ForegroundColor Green

# ---------------------------------------------------------------------------
# Helper: classify a single user's MFA posture
# ---------------------------------------------------------------------------
function Get-MfaClassification {
    param([string]$UserId)

    $hasPhishingResistant = $false
    $hasWeak              = $false
    $hasStandard          = $false
    $details              = @()

    # FIDO2 Keys – YubiKeys, hardware security keys, passkeys
    try {
        $fido2 = (Invoke-MgGraphRequest -Method GET `
            -Uri "https://graph.microsoft.com/beta/users/$UserId/authentication/fido2Methods" `
            -ErrorAction Stop).value
        foreach ($key in $fido2) {
            $hasPhishingResistant = $true
            $model = if ($key.model) { $key.model } else { "Unknown" }
            $details += "FIDO2: $model"
        }
    } catch { }

    # Microsoft Authenticator – Push notifications and passkey-capable registrations
    try {
        $authApp = (Invoke-MgGraphRequest -Method GET `
            -Uri "https://graph.microsoft.com/beta/users/$UserId/authentication/microsoftAuthenticatorMethods" `
            -ErrorAction Stop).value
        foreach ($app in $authApp) {
            $deviceName = if ($app.displayName) { $app.displayName } else { "Device" }
            if ($app.clientAppName -eq "microsoftAuthenticator" -and
                $app.deviceTag -match "passkey|SupportPasskeyForSignIn") {
                $hasPhishingResistant = $true
                $details += "Authenticator Passkey: $deviceName"
            } elseif ($app.clientAppName -eq "microsoftAuthenticator") {
                $hasStandard = $true
                $details += "Authenticator Push: $deviceName"
            } else {
                $hasStandard = $true
                $details += "Authenticator: $deviceName"
            }
        }
    } catch { }

    # Windows Hello for Business
    try {
        $whfb = (Invoke-MgGraphRequest -Method GET `
            -Uri "https://graph.microsoft.com/beta/users/$UserId/authentication/windowsHelloForBusinessMethods" `
            -ErrorAction Stop).value
        foreach ($w in $whfb) {
            $hasPhishingResistant = $true
            $details += "Windows Hello: $($w.displayName)"
        }
    } catch { }

    # Platform Passkeys (separate beta endpoint)
    try {
        $passkeys = (Invoke-MgGraphRequest -Method GET `
            -Uri "https://graph.microsoft.com/beta/users/$UserId/authentication/platformCredentialMethods" `
            -ErrorAction Stop).value
        foreach ($pk in $passkeys) {
            $hasPhishingResistant = $true
            $details += "Platform Passkey: $($pk.displayName)"
        }
    } catch { }

    # Software TOTP (Authenticator app TOTP / third-party TOTP)
    try {
        $totp = (Invoke-MgGraphRequest -Method GET `
            -Uri "https://graph.microsoft.com/beta/users/$UserId/authentication/softwareOathMethods" `
            -ErrorAction Stop).value
        if ($totp.Count -gt 0) {
            $hasStandard = $true
            $details += "TOTP (Software Token)"
        }
    } catch { }

    # Phone / SMS – considered weak
    try {
        $phone = (Invoke-MgGraphRequest -Method GET `
            -Uri "https://graph.microsoft.com/beta/users/$UserId/authentication/phoneMethods" `
            -ErrorAction Stop).value
        foreach ($p in $phone) {
            $hasWeak = $true
            $details += "Phone ($($p.phoneType)): $($p.phoneNumber)"
        }
    } catch { }

    # Email OTP
    try {
        $email = (Invoke-MgGraphRequest -Method GET `
            -Uri "https://graph.microsoft.com/beta/users/$UserId/authentication/emailMethods" `
            -ErrorAction Stop).value
        foreach ($e in $email) {
            $details += "Email: $($e.emailAddress)"
        }
    } catch { }

    # Determine classification
    if ($hasPhishingResistant)      { $c = "Phishing-Resistant" }
    elseif ($hasStandard)           { $c = "Standard (Push/TOTP)" }
    elseif ($hasWeak)               { $c = "Schwach (SMS/Phone)" }
    else                            { $c = "KEIN MFA" }

    return @{
        Classification = $c
        Details        = ($details | Sort-Object -Unique) -join "; "
        IsPhishRes     = $hasPhishingResistant
        HasWeak        = $hasWeak
        HasStandard    = $hasStandard
    }
}

# ---------------------------------------------------------------------------
# Enumerate privileged roles and their members
# ---------------------------------------------------------------------------
Write-Host "Lade Admin-Rollen..." -ForegroundColor Cyan
$adminRoles = Get-MgDirectoryRole -All |
    Where-Object { $_.DisplayName -match "Admin|Administrator|Global Reader" }
Write-Host "Gefunden: $($adminRoles.Count) Rollen`n" -ForegroundColor Gray

$results        = [System.Collections.Generic.List[PSCustomObject]]::new()
$processedUsers = @{}

foreach ($role in $adminRoles) {
    Write-Host "  $($role.DisplayName)" -ForegroundColor Yellow
    $members = Get-MgDirectoryRoleMember -DirectoryRoleId $role.Id -All

    foreach ($member in $members) {
        if ($member.AdditionalProperties.'@odata.type' -ne '#microsoft.graph.user') { continue }

        $userId = $member.Id

        # If already processed, just append the role name
        if ($processedUsers.ContainsKey($userId)) {
            $existing = $results | Where-Object { $_.UserId -eq $userId }
            if ($existing -and $existing.AdminRoles -notmatch [regex]::Escape($role.DisplayName)) {
                $existing.AdminRoles += ", $($role.DisplayName)"
            }
            continue
        }

        try {
            $user = Get-MgUser -UserId $userId `
                -Property "displayName,userPrincipalName,accountEnabled" -ErrorAction Stop

            Write-Host "    Pruefe: $($user.DisplayName)..." -ForegroundColor Gray -NoNewline

            $mfa = Get-MfaClassification -UserId $userId

            $results.Add([PSCustomObject]@{
                DisplayName    = $user.DisplayName
                UPN            = $user.UserPrincipalName
                AccountEnabled = $user.AccountEnabled
                AdminRoles     = $role.DisplayName
                MfaStatus      = $mfa.Classification
                MfaMethods     = $mfa.Details
                PhishResistant = $mfa.IsPhishRes
                HasWeakMfa     = $mfa.HasWeak
                HasStandard    = $mfa.HasStandard
                UserId         = $userId
            })
            $processedUsers[$userId] = $true

            $icon = if ($mfa.IsPhishRes)      { " [PHISH-RES]" }
                    elseif ($mfa.HasStandard)  { " [STANDARD]"  }
                    elseif ($mfa.HasWeak)      { " [SCHWACH]"   }
                    else                       { " [KEIN MFA]"  }
            Write-Host $icon
        } catch {
            Write-Warning "Fehler bei $userId : $_"
        }
    }
}

# ---------------------------------------------------------------------------
# Build formatted text report
# ---------------------------------------------------------------------------
if (-not (Test-Path "C:\Temp")) {
    New-Item -Path "C:\Temp" -ItemType Directory -Force | Out-Null
}
$outFile  = "C:\Temp\AdminMfaAudit.txt"
$maxRollen = 60

$tableData = $results |
    Sort-Object @{Expression = "PhishResistant"; Descending = $false}, DisplayName |
    ForEach-Object {
        $rollen = $_.AdminRoles
        if ($rollen.Length -gt $maxRollen) { $rollen = $rollen.Substring(0, $maxRollen - 3) + "..." }
        [PSCustomObject]@{
            User    = $_.DisplayName
            UPN     = $_.UPN
            Aktiv   = if ($_.AccountEnabled) { "Ja" } else { "Nein" }
            Rollen  = $rollen
            MFA     = if ($_.MfaStatus -eq "KEIN MFA") { "NEIN" } else { "JA" }
            MFA_Typ = $_.MfaStatus
            Details = $_.MfaMethods
        }
    }

$colDefs = @(
    @{ Name = "User";    Label = "User";    Min = 20; Max = 30 }
    @{ Name = "UPN";     Label = "UPN";     Min = 25; Max = 45 }
    @{ Name = "Aktiv";   Label = "Aktiv";   Min =  5; Max =  5 }
    @{ Name = "Rollen";  Label = "Rollen";  Min = 20; Max = 60 }
    @{ Name = "MFA";     Label = "MFA";     Min =  4; Max =  4 }
    @{ Name = "MFA_Typ"; Label = "MFA Typ"; Min = 20; Max = 22 }
    @{ Name = "Details"; Label = "Details"; Min = 15; Max = 40 }
)

foreach ($col in $colDefs) {
    $maxData = 0
    if ($tableData) {
        $maxData = ($tableData |
            ForEach-Object { ($_.($col.Name)).ToString().Length } |
            Measure-Object -Maximum).Maximum
    }
    $col.Width = [Math]::Min($col.Max,
        [Math]::Max($col.Min, [Math]::Max($col.Label.Length, $maxData))) + 1
}

$headerLine = ($colDefs | ForEach-Object { $_.Label.PadRight($_.Width) }) -join "| "
$sepLine    = ($colDefs | ForEach-Object { "-" * $_.Width }) -join "+-"

$lines = @()
$lines += $headerLine
$lines += $sepLine
foreach ($row in $tableData) {
    $lines += ($colDefs | ForEach-Object {
        $val = $row.($_.Name)
        if (-not $val) { $val = "" }
        $s = $val.ToString()
        if ($s.Length -gt $_.Width) { $s = $s.Substring(0, $_.Width - 4) + "..." }
        $s.PadRight($_.Width)
    }) -join "| "
}

$total    = $results.Count
$phishRes = ($results | Where-Object PhishResistant).Count
$weak     = ($results | Where-Object HasWeakMfa).Count
$noMfa    = ($results | Where-Object { $_.MfaStatus -eq "KEIN MFA" }).Count
$standard = $total - $phishRes - $weak - $noMfa
$summary  = "Gesamt: $total | Phishing-Resistant: $phishRes | Standard: $standard | Schwach: $weak | Kein MFA: $noMfa"
$divider  = "=" * $headerLine.Length

$fileContent  = @()
$fileContent += "ADMIN MFA AUDIT - $(Get-Date -Format 'dd.MM.yyyy HH:mm')"
$fileContent += "Methode: Microsoft Graph BETA Endpoint"
$fileContent += $divider
$fileContent += $lines
$fileContent += $divider
$fileContent += ""
$fileContent += $summary
$fileContent += ""
$fileContent += "--- Vollstaendige Rollen pro User ---"
$fileContent += ""
foreach ($r in ($results | Sort-Object DisplayName)) {
    $fileContent += "$($r.DisplayName): $($r.AdminRoles)"
}
$fileContent += ""
$fileContent += "--- Alle MFA-Details pro User ---"
$fileContent += ""
foreach ($r in ($results | Sort-Object DisplayName)) {
    $fileContent += "$($r.DisplayName): [$($r.MfaStatus)] $($r.MfaMethods)"
}

$fileContent | Out-File -FilePath $outFile -Encoding UTF8
Write-Host "`nDatei gespeichert: $outFile" -ForegroundColor Green
notepad $outFile

Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
