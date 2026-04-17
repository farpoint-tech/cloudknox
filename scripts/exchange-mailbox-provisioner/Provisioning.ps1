#requires -Version 5.1

<#
.SYNOPSIS
    Provisioning-Script für Shared Mailboxes und Distribution Groups aus Excel.

.DESCRIPTION
    Liest eine Excel-Datei mit zwei benannten Tabellen:
    - SharedMailboxes    (Shared Mailbox-Erstellung inkl. Berechtigungen)
    - DistributionGroups (Verteilergruppen inkl. Mitglieder und Besitzer)

    Konfiguration (Domain, Präfixe, Auth-Modus) wird aus einer config.json gelesen.
    Authentifizierung wahlweise interaktiv oder per App-Registrierung.

.PARAMETER ConfigFileName
    Name der JSON-Konfigurationsdatei. Standard: config.json

.PARAMETER ExcelFileName
    Überschreibt den in der config.json hinterlegten Excel-Dateinamen.

.EXAMPLE
    .\Provisioning.ps1
    Standardlauf mit config.json und interaktivem Login.

.EXAMPLE
    .\Provisioning.ps1 -WhatIf
    Testlauf ohne echte Erstellung.

.EXAMPLE
    .\Provisioning.ps1 -ExcelFileName "Test.xlsx"
    Verwendet eine andere Excel-Datei.
#>

[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [string]$ConfigFileName = "config.json",
    [string]$ExcelFileName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ============================================================
# PFADE
# ============================================================
$ScriptPath = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$TimeStamp  = Get-Date -Format "yyyyMMdd_HHmmss"

$ConfigFile         = Join-Path $ScriptPath $ConfigFileName
$script:LogFile     = Join-Path $ScriptPath "Provisioning_$TimeStamp.log"
$script:ResultsFile = Join-Path $ScriptPath "Provisioning_Results_$TimeStamp.csv"

# ============================================================
# HILFSFUNKTIONEN
# ============================================================

# -- Logging --
function Write-Log {
    param(
        [Parameter(Mandatory)]
        [string]$Message,

        [ValidateSet('INFO', 'WARN', 'ERROR', 'SUCCESS')]
        [string]$Level = 'INFO'
    )

    $ts   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "$ts [$Level] $Message"
    Add-Content -LiteralPath $script:LogFile -Value $line -Encoding UTF8

    switch ($Level) {
        'INFO'    { Write-Host $line -ForegroundColor Gray }
        'WARN'    { Write-Host $line -ForegroundColor Yellow }
        'ERROR'   { Write-Host $line -ForegroundColor Red }
        'SUCCESS' { Write-Host $line -ForegroundColor Green }
    }
}

# -- Benutzerbestätigung --
function Confirm-Action {
    param(
        [Parameter(Mandatory)]
        [string]$Message
    )

    do {
        $answer = Read-Host "$Message [J/N]"
    } until ($answer -match '^(J|N|j|n|Y|y)$')

    return ($answer -match '^(J|j|Y|y)$')
}

# -- Modulprüfung mit optionaler Installation --
function Ensure-Module {
    param(
        [Parameter(Mandatory)]
        [string]$ModuleName
    )

    $installed = Get-Module -ListAvailable -Name $ModuleName |
                 Sort-Object Version -Descending |
                 Select-Object -First 1

    if ($installed) {
        Write-Log "Modul vorhanden: $ModuleName (Version $($installed.Version))" "SUCCESS"
        return
    }

    Write-Log "Modul fehlt: $ModuleName" "WARN"

    if (-not (Confirm-Action -Message "Das Modul '$ModuleName' ist nicht installiert. Jetzt installieren?")) {
        throw "Benötigtes Modul '$ModuleName' wurde nicht installiert. Script wird beendet."
    }

    Write-Log "Installiere Modul: $ModuleName"
    Install-Module -Name $ModuleName -Scope CurrentUser -Force -AllowClobber -ErrorAction Stop
    Write-Log "Modul erfolgreich installiert: $ModuleName" "SUCCESS"
}

# -- Sichere Stringverarbeitung --
function Get-SafeTrim {
    param([AllowNull()][object]$Value)

    if ($null -eq $Value) { return "" }
    return ([string]$Value).Trim()
}

function Get-SafeBool {
    param(
        [AllowNull()][object]$Value,
        [bool]$Default = $false
    )

    $text = Get-SafeTrim $Value
    if ([string]::IsNullOrWhiteSpace($text)) { return $Default }

    switch -Regex ($text.ToLowerInvariant()) {
        '^(1|true|yes|ja|j)$'   { return $true }
        '^(0|false|no|nein|n)$' { return $false }
        default                 { return $Default }
    }
}

function Split-MultiValue {
    param(
        [AllowNull()][object]$Value,
        [string]$Delimiter = ';'
    )

    $text = Get-SafeTrim $Value
    if ([string]::IsNullOrWhiteSpace($text)) { return @() }

    return @(
        $text -split [regex]::Escape($Delimiter) |
        ForEach-Object { $_.Trim() } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Select-Object -Unique
    )
}

# -- E-Mail-Validierung --
function Test-EmailAddress {
    param([string]$EmailAddress)

    if ([string]::IsNullOrWhiteSpace($EmailAddress)) { return $true }

    try {
        $mail = [System.Net.Mail.MailAddress]::new($EmailAddress)
        return ($mail.Address -eq $EmailAddress)
    }
    catch { return $false }
}

# -- Alias-Normalisierung --
function Convert-ToMailboxAlias {
    param(
        [Parameter(Mandatory)]
        [string]$Value,
        [int]$MaxLength = 64
    )

    $n = $Value `
        -replace 'Ä', 'Ae' -replace 'Ö', 'Oe' -replace 'Ü', 'Ue' `
        -replace 'ä', 'ae' -replace 'ö', 'oe' -replace 'ü', 'ue' `
        -replace 'ß', 'ss'

    $n = $n.Normalize([Text.NormalizationForm]::FormD)

    $sb = New-Object System.Text.StringBuilder
    foreach ($char in $n.ToCharArray()) {
        $cat = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($char)
        if ($cat -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$sb.Append($char)
        }
    }

    $alias = $sb.ToString().ToLowerInvariant()
    $alias = $alias -replace '\s+', '.'
    $alias = $alias -replace '[^a-z0-9\.-]', ''
    $alias = $alias -replace '\.{2,}', '.'
    $alias = $alias -replace '-{2,}', '-'
    $alias = $alias.Trim('.').Trim('-')

    if ([string]::IsNullOrWhiteSpace($alias)) {
        throw "Kein gültiger Alias erzeugbar aus: $Value"
    }

    if ($alias.Length -gt $MaxLength) {
        $alias = $alias.Substring(0, $MaxLength).Trim('.').Trim('-')
    }

    return $alias
}

# -- Empfänger-Existenzprüfung --
function Get-ExistingRecipient {
    param([Parameter(Mandatory)][string]$Identity)

    return (Get-Recipient -Identity $Identity -ErrorAction SilentlyContinue)
}

# -- Adresse + Alias --
function Get-EffectivePrimaryAddress {
    param(
        [string]$ExplicitAddress,
        [string]$GeneratedAlias,
        [string]$DefaultDomain
    )

    $addr = Get-SafeTrim $ExplicitAddress
    if (-not [string]::IsNullOrWhiteSpace($addr)) {
        if (-not (Test-EmailAddress -EmailAddress $addr)) {
            throw "Primäre Adresse ungültig: $addr"
        }
        return $addr.ToLowerInvariant()
    }

    return "$GeneratedAlias@$DefaultDomain"
}

function Get-AliasFromAddress {
    param([Parameter(Mandatory)][string]$Address)
    return ($Address.Split('@')[0]).ToLowerInvariant()
}

# -- Existenzprüfung für mehrere Identitäten --
function Assert-RecipientDoesNotExist {
    param(
        [Parameter(Mandatory)][string]$PrimaryAddress,
        [Parameter(Mandatory)][string]$Alias
    )

    if (Get-ExistingRecipient -Identity $PrimaryAddress) {
        throw "Empfänger existiert bereits: $PrimaryAddress"
    }
    if (Get-ExistingRecipient -Identity $Alias) {
        throw "Empfänger mit Alias existiert bereits: $Alias"
    }
}

# -- Berechtigungsprüfung vor dem Setzen --
function Add-MailboxPermissionSafe {
    param(
        [Parameter(Mandatory)][string]$Identity,
        [Parameter(Mandatory)][string]$User,
        [Parameter(Mandatory)][ValidateSet('FullAccess','SendAs')][string]$Right
    )

    if ($Right -eq 'FullAccess') {
        $existing = Get-MailboxPermission -Identity $Identity -User $User -ErrorAction SilentlyContinue
        if ($existing -and ($existing.AccessRights -contains 'FullAccess')) {
            Write-Log "  FullAccess für '$User' auf '$Identity' existiert bereits - übersprungen" "WARN"
            return
        }

        Add-MailboxPermission `
            -Identity $Identity `
            -User $User `
            -AccessRights FullAccess `
            -InheritanceType All `
            -AutoMapping $true `
            -ErrorAction Stop | Out-Null

        Write-Log "  FullAccess gesetzt: $User"
    }
    elseif ($Right -eq 'SendAs') {
        $existing = Get-RecipientPermission -Identity $Identity -Trustee $User -ErrorAction SilentlyContinue
        if ($existing -and ($existing.AccessRights -contains 'SendAs')) {
            Write-Log "  SendAs für '$User' auf '$Identity' existiert bereits - übersprungen" "WARN"
            return
        }

        Add-RecipientPermission `
            -Identity $Identity `
            -Trustee $User `
            -AccessRights SendAs `
            -Confirm:$false `
            -ErrorAction Stop | Out-Null

        Write-Log "  SendAs gesetzt: $User"
    }
}

# -- Verbindung --
function Connect-ExchangeCustom {
    param([Parameter(Mandatory)][pscustomobject]$Config)

    $mode = (Get-SafeTrim $Config.authentication.mode).ToLowerInvariant()

    if ($mode -eq 'app') {
        $appId    = Get-SafeTrim $Config.authentication.appId
        $org      = Get-SafeTrim $Config.authentication.organization
        $certHash = Get-SafeTrim $Config.authentication.certificateThumbprint

        if ([string]::IsNullOrWhiteSpace($appId) -or
            [string]::IsNullOrWhiteSpace($org) -or
            [string]::IsNullOrWhiteSpace($certHash)) {
            throw "Auth-Modus 'App' gesetzt, aber appId, organization oder certificateThumbprint fehlen in config.json."
        }

        Write-Log "Authentifizierungsmodus: App-Registrierung"
        Connect-ExchangeOnline `
            -AppId $appId `
            -CertificateThumbprint $certHash `
            -Organization $org `
            -ShowBanner:$false `
            -ErrorAction Stop
    }
    else {
        Write-Log "Authentifizierungsmodus: Interaktiver Web-Login"
        Connect-ExchangeOnline -ShowBanner:$false -ErrorAction Stop
    }
}

# ============================================================
# VORAB-VALIDIERUNG
# ============================================================
function Test-RowsBeforeProvisioning {
    param(
        [string]$Type,
        [object[]]$Rows,
        [pscustomobject]$Config,
        [System.Collections.Generic.HashSet[string]]$GlobalAliases
    )

    $delimiter     = if ((Get-SafeTrim $Config.general.delimiter)) { Get-SafeTrim $Config.general.delimiter } else { ';' }
    $defaultDomain = Get-SafeTrim $Config.general.domain
    $issues        = @()
    $validRows     = @()

    for ($i = 0; $i -lt $Rows.Count; $i++) {
        $Row           = $Rows[$i]
        $rowLabel      = "$Type Zeile $($i + 1)"
        $rowHasIssue   = $false

        $vorname  = Get-SafeTrim $Row.Vorname
        $nachname = Get-SafeTrim $Row.Nachname
        $zusatz   = Get-SafeTrim $Row.Zusatz

        # Leere Zeile überspringen
        if ([string]::IsNullOrWhiteSpace($vorname) -and
            [string]::IsNullOrWhiteSpace($nachname) -and
            [string]::IsNullOrWhiteSpace($zusatz)) {
            continue
        }

        # Pflichtfelder
        if ([string]::IsNullOrWhiteSpace($vorname) -or
            [string]::IsNullOrWhiteSpace($nachname) -or
            [string]::IsNullOrWhiteSpace($zusatz)) {
            $issues += "$rowLabel : Pflichtfelder Vorname, Nachname oder Zusatz fehlen."
            $rowHasIssue = $true
        }

        if (-not $rowHasIssue) {
            try {
                $generatedAlias = Convert-ToMailboxAlias -Value "$vorname.$nachname.$zusatz"
                $primaryAddress = Get-EffectivePrimaryAddress `
                    -ExplicitAddress (Get-SafeTrim $Row.PrimaereAdresse) `
                    -GeneratedAlias $generatedAlias `
                    -DefaultDomain $defaultDomain
                $alias = Get-AliasFromAddress -Address $primaryAddress

                # Doppelter Alias
                if (-not $GlobalAliases.Add($alias)) {
                    $issues += "$rowLabel : Alias '$alias' ist doppelt in der Excel-Datei."
                    $rowHasIssue = $true
                }

                # E-Mail-Validierung für Multivalue-Felder
                $fieldsToValidate = @()
                if ($Type -eq 'SharedMailbox') {
                    $fieldsToValidate += @(
                        @{ Name = 'Weiterleitung'; Values = @(Get-SafeTrim $Row.Weiterleitung) | Where-Object { $_ } },
                        @{ Name = 'FullAccess';    Values = Split-MultiValue -Value $Row.FullAccess -Delimiter $delimiter },
                        @{ Name = 'SendAs';        Values = Split-MultiValue -Value $Row.SendAs -Delimiter $delimiter }
                    )
                }
                elseif ($Type -eq 'DistributionGroup') {
                    $fieldsToValidate += @(
                        @{ Name = 'Mitglieder'; Values = Split-MultiValue -Value $Row.Mitglieder -Delimiter $delimiter },
                        @{ Name = 'Besitzer';   Values = Split-MultiValue -Value $Row.Besitzer -Delimiter $delimiter }
                    )
                }

                foreach ($field in $fieldsToValidate) {
                    foreach ($email in $field.Values) {
                        if (-not (Test-EmailAddress -EmailAddress $email)) {
                            $issues += "$rowLabel : Ungültige E-Mail in Spalte '$($field.Name)': $email"
                            $rowHasIssue = $true
                        }
                    }
                }
            }
            catch {
                $issues += "$rowLabel : $($_.Exception.Message)"
                $rowHasIssue = $true
            }
        }

        if (-not $rowHasIssue) {
            $validRows += $Row
        }
    }

    return [PSCustomObject]@{
        Issues    = $issues
        ValidRows = $validRows
    }
}

# ============================================================
# PROVISIONING-FUNKTIONEN
# ============================================================
function New-SharedMailboxFromRow {
    param(
        [Parameter(Mandatory)][object]$Row,
        [Parameter(Mandatory)][pscustomobject]$Config
    )

    $delimiter          = if ((Get-SafeTrim $Config.general.delimiter)) { Get-SafeTrim $Config.general.delimiter } else { ';' }
    $defaultDomain      = Get-SafeTrim $Config.general.domain
    $displayNamePrefix  = Get-SafeTrim $Config.general.displayNamePrefixSharedMailbox
    $defaultHiddenGAL   = Get-SafeBool $Config.general.defaultHiddenFromGAL $false

    $vorname      = Get-SafeTrim $Row.Vorname
    $nachname     = Get-SafeTrim $Row.Nachname
    $zusatz       = Get-SafeTrim $Row.Zusatz
    $anzeigename  = Get-SafeTrim $Row.Anzeigename
    $weiterleitung = Get-SafeTrim $Row.Weiterleitung
    $hiddenGAL    = Get-SafeBool $Row.HiddenFromGAL $defaultHiddenGAL

    $generatedAlias = Convert-ToMailboxAlias -Value "$vorname.$nachname.$zusatz"
    $primaryAddress = Get-EffectivePrimaryAddress -ExplicitAddress $Row.PrimaereAdresse -GeneratedAlias $generatedAlias -DefaultDomain $defaultDomain
    $alias          = Get-AliasFromAddress -Address $primaryAddress

    if ([string]::IsNullOrWhiteSpace($anzeigename)) {
        $anzeigename = "$displayNamePrefix$vorname.$nachname.$zusatz"
    }

    $fullAccessUsers = Split-MultiValue -Value $Row.FullAccess -Delimiter $delimiter
    $sendAsUsers     = Split-MultiValue -Value $Row.SendAs -Delimiter $delimiter

    Assert-RecipientDoesNotExist -PrimaryAddress $primaryAddress -Alias $alias

    if ($PSCmdlet.ShouldProcess($primaryAddress, "Shared Mailbox erstellen")) {
        Write-Log "Erstelle Shared Mailbox: $primaryAddress"

        New-Mailbox -Shared `
            -Name $anzeigename `
            -DisplayName $anzeigename `
            -Alias $alias `
            -PrimarySmtpAddress $primaryAddress `
            -ErrorAction Stop | Out-Null

        if (-not [string]::IsNullOrWhiteSpace($weiterleitung)) {
            Set-Mailbox -Identity $alias `
                -ForwardingSmtpAddress $weiterleitung `
                -DeliverToMailboxAndForward $true `
                -ErrorAction Stop
            Write-Log "  Weiterleitung gesetzt: $weiterleitung"
        }

        Set-Mailbox -Identity $alias `
            -HiddenFromAddressListsEnabled:$hiddenGAL `
            -ErrorAction Stop

        foreach ($user in $fullAccessUsers) {
            Add-MailboxPermissionSafe -Identity $alias -User $user -Right 'FullAccess'
        }

        foreach ($user in $sendAsUsers) {
            Add-MailboxPermissionSafe -Identity $alias -User $user -Right 'SendAs'
        }

        Write-Log "Shared Mailbox erfolgreich erstellt: $primaryAddress" "SUCCESS"

        return [PSCustomObject]@{
            Type        = "SharedMailbox"
            Alias       = $alias
            PrimarySmtp = $primaryAddress
            DisplayName = $anzeigename
            Action      = "Created"
            Error       = ""
        }
    }

    return [PSCustomObject]@{
        Type        = "SharedMailbox"
        Alias       = $alias
        PrimarySmtp = $primaryAddress
        DisplayName = $anzeigename
        Action      = "WhatIf"
        Error       = ""
    }
}

function New-DistributionGroupFromRow {
    param(
        [Parameter(Mandatory)][object]$Row,
        [Parameter(Mandatory)][pscustomobject]$Config
    )

    $delimiter         = if ((Get-SafeTrim $Config.general.delimiter)) { Get-SafeTrim $Config.general.delimiter } else { ';' }
    $defaultDomain     = Get-SafeTrim $Config.general.domain
    $displayNamePrefix = Get-SafeTrim $Config.general.displayNamePrefixDistributionGroup
    $defaultHiddenGAL  = Get-SafeBool $Config.general.defaultHiddenFromGAL $false

    $vorname     = Get-SafeTrim $Row.Vorname
    $nachname    = Get-SafeTrim $Row.Nachname
    $zusatz      = Get-SafeTrim $Row.Zusatz
    $anzeigename = Get-SafeTrim $Row.Anzeigename
    $hiddenGAL   = Get-SafeBool $Row.HiddenFromGAL $defaultHiddenGAL

    $generatedAlias = Convert-ToMailboxAlias -Value "$vorname.$nachname.$zusatz"
    $primaryAddress = Get-EffectivePrimaryAddress -ExplicitAddress $Row.PrimaereAdresse -GeneratedAlias $generatedAlias -DefaultDomain $defaultDomain
    $alias          = Get-AliasFromAddress -Address $primaryAddress

    if ([string]::IsNullOrWhiteSpace($anzeigename)) {
        $anzeigename = "$displayNamePrefix$vorname.$nachname.$zusatz"
    }

    $members = Split-MultiValue -Value $Row.Mitglieder -Delimiter $delimiter
    $owners  = Split-MultiValue -Value $Row.Besitzer -Delimiter $delimiter

    Assert-RecipientDoesNotExist -PrimaryAddress $primaryAddress -Alias $alias

    if ($PSCmdlet.ShouldProcess($primaryAddress, "Distribution Group erstellen")) {
        Write-Log "Erstelle Distribution Group: $primaryAddress"

        New-DistributionGroup `
            -Name $anzeigename `
            -DisplayName $anzeigename `
            -Alias $alias `
            -PrimarySmtpAddress $primaryAddress `
            -Type Distribution `
            -ErrorAction Stop | Out-Null

        if ($owners.Count -gt 0) {
            Set-DistributionGroup -Identity $alias `
                -ManagedBy $owners `
                -BypassSecurityGroupManagerCheck `
                -ErrorAction Stop
            Write-Log "  Besitzer gesetzt: $($owners -join ', ')"
        }

        foreach ($member in $members) {
            Add-DistributionGroupMember `
                -Identity $alias `
                -Member $member `
                -BypassSecurityGroupManagerCheck `
                -ErrorAction Stop
            Write-Log "  Mitglied hinzugefügt: $member"
        }

        Set-DistributionGroup -Identity $alias `
            -HiddenFromAddressListsEnabled:$hiddenGAL `
            -ErrorAction Stop

        Write-Log "Distribution Group erfolgreich erstellt: $primaryAddress" "SUCCESS"

        return [PSCustomObject]@{
            Type        = "DistributionGroup"
            Alias       = $alias
            PrimarySmtp = $primaryAddress
            DisplayName = $anzeigename
            Action      = "Created"
            Error       = ""
        }
    }

    return [PSCustomObject]@{
        Type        = "DistributionGroup"
        Alias       = $alias
        PrimarySmtp = $primaryAddress
        DisplayName = $anzeigename
        Action      = "WhatIf"
        Error       = ""
    }
}

# ============================================================
# HAUPTLOGIK
# ============================================================
$Results = New-Object System.Collections.Generic.List[object]
$GlobalAliases = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$ConnectedToExchange = $false

$TotalCount   = 0
$CreatedCount = 0
$SkippedCount = 0
$FailedCount  = 0

Write-Log "Scriptstart"
Write-Log "Config: $ConfigFile"

try {
    # -- Module --
    Ensure-Module -ModuleName "ExchangeOnlineManagement"
    Ensure-Module -ModuleName "ImportExcel"

    Import-Module ExchangeOnlineManagement -ErrorAction Stop
    Import-Module ImportExcel -ErrorAction Stop
    Write-Log "Module erfolgreich geladen" "SUCCESS"

    # -- Config --
    if (-not (Test-Path -LiteralPath $ConfigFile)) {
        throw "Config-Datei nicht gefunden: $ConfigFile"
    }
    $Config = Get-Content -LiteralPath $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json

    # -- Excel-Datei bestimmen --
    if ($PSBoundParameters.ContainsKey('ExcelFileName') -and -not [string]::IsNullOrWhiteSpace($ExcelFileName)) {
        $ExcelFile = Join-Path $ScriptPath $ExcelFileName
    }
    else {
        $excelFromConfig = Get-SafeTrim $Config.general.excelFile
        if ([string]::IsNullOrWhiteSpace($excelFromConfig)) {
            throw "general.excelFile fehlt in config.json und kein -ExcelFileName angegeben."
        }
        $ExcelFile = Join-Path $ScriptPath $excelFromConfig
    }

    Write-Log "Excel-Datei: $ExcelFile"

    if (-not (Test-Path -LiteralPath $ExcelFile)) {
        throw "Excel-Datei nicht gefunden: $ExcelFile"
    }

    # -- Tabellen aus Excel lesen --
    $smRows = @(Import-Excel -Path $ExcelFile -TableName "SharedMailboxes" -ErrorAction SilentlyContinue)
    $dgRows = @(Import-Excel -Path $ExcelFile -TableName "DistributionGroups" -ErrorAction SilentlyContinue)

    if ($smRows.Count -eq 0 -and $dgRows.Count -eq 0) {
        throw "Keine Daten gefunden. Stelle sicher, dass die Excel-Tabellen 'SharedMailboxes' und/oder 'DistributionGroups' existieren."
    }

    Write-Log "Shared Mailbox Zeilen: $($smRows.Count)" "INFO"
    Write-Log "Distribution Group Zeilen: $($dgRows.Count)" "INFO"

    # -- Vorab-Validierung --
    Write-Log "Starte Vorab-Validierung..."

    $smValidation = Test-RowsBeforeProvisioning -Type "SharedMailbox" -Rows $smRows -Config $Config -GlobalAliases $GlobalAliases
    $dgValidation = Test-RowsBeforeProvisioning -Type "DistributionGroup" -Rows $dgRows -Config $Config -GlobalAliases $GlobalAliases

    $allIssues = @()
    $allIssues += $smValidation.Issues
    $allIssues += $dgValidation.Issues

    $smValidCount = @($smValidation.ValidRows).Count
    $dgValidCount = @($dgValidation.ValidRows).Count
    $totalValid   = $smValidCount + $dgValidCount

    if ($allIssues.Count -gt 0) {
        Write-Log "Validierungsprobleme gefunden: $($allIssues.Count)" "WARN"
        foreach ($issue in $allIssues) {
            Write-Log $issue "ERROR"
        }

        $SkippedCount = $allIssues.Count

        if ($totalValid -eq 0) {
            throw "Keine gültigen Zeilen verfügbar. Abbruch."
        }

        if (-not (Confirm-Action -Message "Trotz $($allIssues.Count) Problem(en) mit $totalValid gültigen Zeile(n) fortfahren?")) {
            Write-Log "Vom Benutzer abgebrochen." "WARN"
            return
        }
    }
    else {
        Write-Log "Vorab-Validierung erfolgreich: $totalValid gültige Zeile(n)" "SUCCESS"
    }

    # -- Exchange-Verbindung --
    Connect-ExchangeCustom -Config $Config
    $ConnectedToExchange = $true
    Write-Log "Mit Exchange Online verbunden" "SUCCESS"

    # -- SharedMailbox-Provisioning --
    if ($smValidCount -gt 0) {
        Write-Log "Verarbeite $smValidCount Shared Mailbox(en)..."
        foreach ($row in $smValidation.ValidRows) {
            $TotalCount++
            try {
                $result = New-SharedMailboxFromRow -Row $row -Config $Config
                if ($null -ne $result) {
                    $Results.Add($result)
                    $CreatedCount++
                }
            }
            catch {
                $errMsg = $_.Exception.Message
                Write-Log "Fehler bei Shared Mailbox (Zeile $TotalCount): $errMsg" "ERROR"
                $FailedCount++
                $Results.Add([PSCustomObject]@{
                    Type        = "SharedMailbox"
                    Alias       = Get-SafeTrim $row.Vorname
                    PrimarySmtp = ""
                    DisplayName = Get-SafeTrim $row.Anzeigename
                    Action      = "Failed"
                    Error       = $errMsg
                })
            }
        }
    }

    # -- DistributionGroup-Provisioning --
    if ($dgValidCount -gt 0) {
        Write-Log "Verarbeite $dgValidCount Distribution Group(s)..."
        foreach ($row in $dgValidation.ValidRows) {
            $TotalCount++
            try {
                $result = New-DistributionGroupFromRow -Row $row -Config $Config
                if ($null -ne $result) {
                    $Results.Add($result)
                    $CreatedCount++
                }
            }
            catch {
                $errMsg = $_.Exception.Message
                Write-Log "Fehler bei Distribution Group (Zeile $TotalCount): $errMsg" "ERROR"
                $FailedCount++
                $Results.Add([PSCustomObject]@{
                    Type        = "DistributionGroup"
                    Alias       = Get-SafeTrim $row.Vorname
                    PrimarySmtp = ""
                    DisplayName = Get-SafeTrim $row.Anzeigename
                    Action      = "Failed"
                    Error       = $errMsg
                })
            }
        }
    }

    # -- Zusammenfassung --
    Write-Log "============================================================"
    Write-Log "Zusammenfassung"
    Write-Log "  Verarbeitet:  $TotalCount"
    Write-Log "  Erstellt:     $CreatedCount" "SUCCESS"
    Write-Log "  Übersprungen: $SkippedCount" "WARN"
    Write-Log "  Fehler:       $FailedCount" $(if ($FailedCount -gt 0) { "ERROR" } else { "INFO" })
    Write-Log "============================================================"

    if ($Results.Count -gt 0) {
        $Results | Export-Csv -LiteralPath $script:ResultsFile -NoTypeInformation -Encoding UTF8
        Write-Log "Ergebnis-CSV: $script:ResultsFile" "SUCCESS"
    }

    Write-Log "Logdatei: $script:LogFile"
}
catch {
    Write-Log "Unerwarteter Fehler: $($_.Exception.Message)" "ERROR"
    Write-Log $_.ScriptStackTrace "ERROR"
}
finally {
    if ($ConnectedToExchange) {
        try {
            Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue
            Write-Log "Exchange Online getrennt"
        }
        catch {
            Write-Log "Fehler beim Trennen der Exchange-Verbindung: $($_.Exception.Message)" "WARN"
        }
    }
    Write-Log "Scriptende"
}
