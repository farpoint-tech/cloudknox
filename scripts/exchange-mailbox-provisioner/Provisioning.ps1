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

.PARAMETER Force
    Unterdrückt alle interaktiven Rückfragen (Modulinstallation, Validierungsprobleme).
    Empfohlen für Scheduled Tasks und unbeaufsichtigte Ausführung.

.EXAMPLE
    .\Provisioning.ps1
    Standardlauf mit config.json und interaktivem Login.

.EXAMPLE
    .\Provisioning.ps1 -WhatIf
    Testlauf ohne echte Erstellung.

.EXAMPLE
    .\Provisioning.ps1 -ExcelFileName "Test.xlsx"
    Verwendet eine andere Excel-Datei.

.EXAMPLE
    .\Provisioning.ps1 -Force
    Unbeaufsichtigter Lauf ohne Rückfragen (Scheduled Task / CI-Pipeline).
#>

[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [string]$ConfigFileName = "config.json",
    [string]$ExcelFileName,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:SkipConfirmations = $Force.IsPresent

# ============================================================
# PFADE
# ============================================================
$ScriptPath = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$TimeStamp  = Get-Date -Format "yyyyMMdd_HHmmss"

$ConfigFile         = Join-Path $ScriptPath $ConfigFileName
$script:LogFile     = Join-Path $ScriptPath "Provisioning_$TimeStamp.log"
$script:ResultsFile = Join-Path $ScriptPath "Provisioning_Results_$TimeStamp.csv"
$script:AclProtectionFailed = $false

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

    # Logging darf nie von -WhatIf/-Confirm unterdrückt werden
    $WhatIfPreference  = $false
    $ConfirmPreference = 'None'

    # Log-Forging verhindern: Zeilenumbrüche und Steuerzeichen aus Fremddaten entfernen
    $Message = ($Message -replace "`r`n", ' | ' -replace "`n", ' | ' -replace "`r", ' | ') -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]', ''

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

# -- Zugriffsschutz für Ausgabedateien (Log/CSV enthalten Berechtigungsstruktur) --
function Protect-OutputFile {
    param([Parameter(Mandatory)][string]$Path)

    # Infrastruktur-Schreibvorgänge nie von -WhatIf/-Confirm unterdrücken lassen
    $WhatIfPreference  = $false
    $ConfirmPreference = 'None'

    # ACLs nur unter Windows; unter PS7/Linux keine NTFS-Rechte
    if ($env:OS -ne 'Windows_NT') { return }

    try {
        if (-not (Test-Path -LiteralPath $Path)) {
            New-Item -ItemType File -Path $Path -Force | Out-Null
        }

        $acl = Get-Acl -LiteralPath $Path
        # Vererbung kappen: nur explizite Berechtigungen gelten
        $acl.SetAccessRuleProtection($true, $false)

        # Sprachneutrale SIDs: aktueller Benutzer, SYSTEM, lokale Administratoren
        $identities = @(
            [System.Security.Principal.WindowsIdentity]::GetCurrent().User,
            [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'),
            [System.Security.Principal.SecurityIdentifier]::new(
                [System.Security.Principal.WellKnownSidType]::BuiltinAdministratorsSid, $null)
        )
        foreach ($id in $identities) {
            $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
                $id,
                [System.Security.AccessControl.FileSystemRights]::FullControl,
                [System.Security.AccessControl.AccessControlType]::Allow)
            $acl.AddAccessRule($rule)
        }

        Set-Acl -LiteralPath $Path -AclObject $acl
    }
    catch {
        $script:AclProtectionFailed = $true
        Write-Log "SICHERHEITSHINWEIS: Zugriffsschutz für '$Path' konnte nicht gesetzt werden - Datei erbt Standardberechtigungen: $($_.Exception.Message)" "ERROR"
    }
}

# -- Ergebnis-CSV schreiben (immer, auch im WhatIf-Lauf; mit CSV-Injection-Schutz) --
function Write-ResultsFile {
    param(
        [Parameter(Mandatory)][object[]]$Data,
        [Parameter(Mandatory)][string]$Path
    )

    # Reporting ist nicht Ziel der WhatIf-Simulation - immer schreiben
    $WhatIfPreference  = $false
    $ConfirmPreference = 'None'

    # Formel-Injection neutralisieren: führende = + - @ Tab/CR beim Öffnen in Excel entschärfen
    $safe = foreach ($item in $Data) {
        $clone = [ordered]@{}
        foreach ($p in $item.PSObject.Properties) {
            $v = $p.Value
            if ($v -is [string] -and $v -match '^[=+\-@\t\r]') { $v = "'" + $v }
            $clone[$p.Name] = $v
        }
        [PSCustomObject]$clone
    }

    Protect-OutputFile -Path $Path
    $safe | Export-Csv -LiteralPath $Path -NoTypeInformation -Encoding UTF8
}

# -- Benutzerbestätigung --
function Confirm-Action {
    param(
        [Parameter(Mandatory)]
        [string]$Message
    )

    if ($script:SkipConfirmations) {
        Write-Log "Automatische Bestätigung (Force-Modus): $Message" "WARN"
        return $true
    }

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

    if ($script:SkipConfirmations) {
        Write-Log "Installiere Modul ohne Rückfrage (Force-Modus): $ModuleName" "WARN"
    }
    elseif (-not (Confirm-Action -Message "Das Modul '$ModuleName' ist nicht installiert. Jetzt installieren?")) {
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
    # Unäres Komma: Array übersteht die Funktionsgrenze auch bei 0/1 Elementen
    if ([string]::IsNullOrWhiteSpace($text)) { return ,@() }

    return ,@(
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

# -- Sicherer Eigenschaftszugriff auf PSObjects (Strict-Mode-sicher) --
function Get-RowProp {
    param(
        [AllowNull()][object]$Row,
        [Parameter(Mandatory)][string]$Name,
        [object]$Default = $null
    )
    if ($null -eq $Row) { return $Default }
    $prop = $Row.PSObject.Properties[$Name]
    if ($null -eq $prop) { return $Default }
    return $prop.Value
}

# -- Benannte Excel-Tabelle (ListObject) über EPPlus lesen --
# Import-Excel kennt keinen -TableName Parameter; benannte Tabellen sind nur
# über das EPPlus-Objektmodell des ImportExcel-Moduls erreichbar.
function Get-ExcelTableData {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$TableName
    )

    $pkg = Open-ExcelPackage -Path $Path
    try {
        foreach ($ws in $pkg.Workbook.Worksheets) {
            $table = $ws.Tables | Where-Object { $_.Name -eq $TableName }
            if (-not $table) { continue }

            $startRow = $table.Address.Start.Row
            $endRow   = $table.Address.End.Row
            $startCol = $table.Address.Start.Column
            $endCol   = $table.Address.End.Column

            $headers = @()
            for ($col = $startCol; $col -le $endCol; $col++) {
                $headers += $ws.Cells[$startRow, $col].Text
            }

            $rows = @()
            for ($row = $startRow + 1; $row -le $endRow; $row++) {
                $obj = [ordered]@{}
                for ($col = $startCol; $col -le $endCol; $col++) {
                    $header = $headers[$col - $startCol]
                    if (-not [string]::IsNullOrWhiteSpace($header)) {
                        $obj[$header] = $ws.Cells[$row, $col].Text
                    }
                }
                $rows += [PSCustomObject]$obj
            }
            return ,$rows
        }

        throw "Tabelle '$TableName' wurde auf keinem Worksheet gefunden."
    }
    finally {
        Close-ExcelPackage -ExcelPackage $pkg -NoSave
    }
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

    $requiredCmdlets = @(
        'New-Mailbox', 'Set-Mailbox', 'Get-Mailbox',
        'New-DistributionGroup', 'Set-DistributionGroup',
        'Add-DistributionGroupMember', 'Get-DistributionGroup',
        'Add-MailboxPermission', 'Get-MailboxPermission',
        'Add-RecipientPermission', 'Get-RecipientPermission',
        'Get-Recipient'
    )

    if ($mode -eq 'app') {
        $appId    = Get-SafeTrim (Get-RowProp $Config.authentication 'appId')
        $org      = Get-SafeTrim (Get-RowProp $Config.authentication 'organization')
        $certHash = Get-SafeTrim (Get-RowProp $Config.authentication 'certificateThumbprint')

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
            -CommandName $requiredCmdlets `
            -ShowBanner:$false `
            -ErrorAction Stop
    }
    elseif ($mode -eq 'interactive' -or [string]::IsNullOrWhiteSpace($mode)) {
        Write-Log "Authentifizierungsmodus: Interaktiver Web-Login"
        Connect-ExchangeOnline `
            -CommandName $requiredCmdlets `
            -ShowBanner:$false `
            -ErrorAction Stop
    }
    else {
        throw "Unbekannter Authentifizierungsmodus: '$mode'. Gültige Werte: 'interactive', 'app'."
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
    $issues           = @()
    $validRows        = @()
    $invalidRowCount  = 0

    for ($i = 0; $i -lt $Rows.Count; $i++) {
        $Row           = $Rows[$i]
        $rowLabel      = "$Type Zeile $($i + 1)"
        $rowHasIssue   = $false

        $vorname  = Get-SafeTrim (Get-RowProp $Row 'Vorname')
        $nachname = Get-SafeTrim (Get-RowProp $Row 'Nachname')
        $zusatz   = Get-SafeTrim (Get-RowProp $Row 'Zusatz')

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
                    -ExplicitAddress (Get-SafeTrim (Get-RowProp $Row 'PrimaereAdresse')) `
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
                        @{ Name = 'Weiterleitung'; Values = @(Get-SafeTrim (Get-RowProp $Row 'Weiterleitung')) | Where-Object { $_ } },
                        @{ Name = 'FullAccess';    Values = Split-MultiValue -Value (Get-RowProp $Row 'FullAccess') -Delimiter $delimiter },
                        @{ Name = 'SendAs';        Values = Split-MultiValue -Value (Get-RowProp $Row 'SendAs') -Delimiter $delimiter }
                    )
                }
                elseif ($Type -eq 'DistributionGroup') {
                    $fieldsToValidate += @(
                        @{ Name = 'Mitglieder'; Values = Split-MultiValue -Value (Get-RowProp $Row 'Mitglieder') -Delimiter $delimiter },
                        @{ Name = 'Besitzer';   Values = Split-MultiValue -Value (Get-RowProp $Row 'Besitzer') -Delimiter $delimiter }
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

                # Externe Weiterleitung nur wenn per Config freigegeben (Datenabfluss-Prävention)
                if ($Type -eq 'SharedMailbox') {
                    $fwd = Get-SafeTrim (Get-RowProp $Row 'Weiterleitung')
                    if (-not [string]::IsNullOrWhiteSpace($fwd) -and (Test-EmailAddress -EmailAddress $fwd)) {
                        $allowExternalFwd = Get-SafeBool (Get-RowProp $Config.general 'allowExternalForwarding') $false
                        $fwdDomain = $fwd.Split('@')[-1].ToLowerInvariant()
                        if ($fwdDomain -ne $defaultDomain.ToLowerInvariant() -and -not $allowExternalFwd) {
                            $issues += "$rowLabel : Externe Weiterleitung zu '$fwdDomain' ist nicht erlaubt (general.allowExternalForwarding=false)."
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
        else {
            $invalidRowCount++
        }
    }

    return [PSCustomObject]@{
        Issues          = $issues
        ValidRows       = $validRows
        InvalidRowCount = $invalidRowCount
    }
}

# ============================================================
# PROVISIONING-FUNKTIONEN
# ============================================================
function New-SharedMailboxFromRow {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param(
        [Parameter(Mandatory)][object]$Row,
        [Parameter(Mandatory)][pscustomobject]$Config
    )

    $delimiter          = if ((Get-SafeTrim $Config.general.delimiter)) { Get-SafeTrim $Config.general.delimiter } else { ';' }
    $defaultDomain      = Get-SafeTrim $Config.general.domain
    $displayNamePrefix  = Get-SafeTrim $Config.general.displayNamePrefixSharedMailbox
    $defaultHiddenGAL   = Get-SafeBool $Config.general.defaultHiddenFromGAL $false

    $vorname       = Get-SafeTrim (Get-RowProp $Row 'Vorname')
    $nachname      = Get-SafeTrim (Get-RowProp $Row 'Nachname')
    $zusatz        = Get-SafeTrim (Get-RowProp $Row 'Zusatz')
    $anzeigename   = Get-SafeTrim (Get-RowProp $Row 'Anzeigename')
    $weiterleitung = Get-SafeTrim (Get-RowProp $Row 'Weiterleitung')
    $hiddenGAL     = Get-SafeBool (Get-RowProp $Row 'HiddenFromGAL') $defaultHiddenGAL

    $generatedAlias = Convert-ToMailboxAlias -Value "$vorname.$nachname.$zusatz"
    $primaryAddress = Get-EffectivePrimaryAddress -ExplicitAddress (Get-RowProp $Row 'PrimaereAdresse') -GeneratedAlias $generatedAlias -DefaultDomain $defaultDomain
    $alias          = Get-AliasFromAddress -Address $primaryAddress

    if ([string]::IsNullOrWhiteSpace($anzeigename)) {
        $anzeigename = "$displayNamePrefix$vorname.$nachname.$zusatz"
    }

    # Anzeigename: AD-ungültige Zeichen ersetzen
    $anzeigename = $anzeigename -replace '[/\\:\*\?"<>\|]', '-'

    $fullAccessUsers = Split-MultiValue -Value (Get-RowProp $Row 'FullAccess') -Delimiter $delimiter
    $sendAsUsers     = Split-MultiValue -Value (Get-RowProp $Row 'SendAs') -Delimiter $delimiter

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
            $fwdDomain = $weiterleitung.Split('@')[-1].ToLowerInvariant()
            if ($fwdDomain -ne $defaultDomain.ToLowerInvariant()) {
                Write-Log "  SICHERHEITSHINWEIS: Weiterleitung zu externer Domain '$fwdDomain' ($weiterleitung) - bitte prüfen!" "WARN"
            }
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

    # ShouldProcess=false: entweder WhatIf-Lauf oder Benutzer hat bei -Confirm abgelehnt
    return [PSCustomObject]@{
        Type        = "SharedMailbox"
        Alias       = $alias
        PrimarySmtp = $primaryAddress
        DisplayName = $anzeigename
        Action      = $(if ($WhatIfPreference) { "WhatIf" } else { "Declined" })
        Error       = ""
    }
}

function New-DistributionGroupFromRow {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param(
        [Parameter(Mandatory)][object]$Row,
        [Parameter(Mandatory)][pscustomobject]$Config
    )

    $delimiter         = if ((Get-SafeTrim $Config.general.delimiter)) { Get-SafeTrim $Config.general.delimiter } else { ';' }
    $defaultDomain     = Get-SafeTrim $Config.general.domain
    $displayNamePrefix = Get-SafeTrim $Config.general.displayNamePrefixDistributionGroup
    $defaultHiddenGAL  = Get-SafeBool $Config.general.defaultHiddenFromGAL $false

    $vorname     = Get-SafeTrim (Get-RowProp $Row 'Vorname')
    $nachname    = Get-SafeTrim (Get-RowProp $Row 'Nachname')
    $zusatz      = Get-SafeTrim (Get-RowProp $Row 'Zusatz')
    $anzeigename = Get-SafeTrim (Get-RowProp $Row 'Anzeigename')
    $hiddenGAL   = Get-SafeBool (Get-RowProp $Row 'HiddenFromGAL') $defaultHiddenGAL

    $generatedAlias = Convert-ToMailboxAlias -Value "$vorname.$nachname.$zusatz"
    $primaryAddress = Get-EffectivePrimaryAddress -ExplicitAddress (Get-RowProp $Row 'PrimaereAdresse') -GeneratedAlias $generatedAlias -DefaultDomain $defaultDomain
    $alias          = Get-AliasFromAddress -Address $primaryAddress

    if ([string]::IsNullOrWhiteSpace($anzeigename)) {
        $anzeigename = "$displayNamePrefix$vorname.$nachname.$zusatz"
    }

    # Anzeigename: AD-ungültige Zeichen ersetzen
    $anzeigename = $anzeigename -replace '[/\\:\*\?"<>\|]', '-'

    $members = Split-MultiValue -Value (Get-RowProp $Row 'Mitglieder') -Delimiter $delimiter
    $owners  = Split-MultiValue -Value (Get-RowProp $Row 'Besitzer') -Delimiter $delimiter

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

        if (@($owners).Count -gt 0) {
            Set-DistributionGroup -Identity $alias `
                -ManagedBy @($owners) `
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

    # ShouldProcess=false: entweder WhatIf-Lauf oder Benutzer hat bei -Confirm abgelehnt
    return [PSCustomObject]@{
        Type        = "DistributionGroup"
        Alias       = $alias
        PrimarySmtp = $primaryAddress
        DisplayName = $anzeigename
        Action      = $(if ($WhatIfPreference) { "WhatIf" } else { "Declined" })
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

try {
    Protect-OutputFile -Path $script:LogFile
    Write-Log "Scriptstart"
    Write-Log "Config: $ConfigFile"

    if ($WhatIfPreference) {
        Write-Log "╔══════════════════════════════════════════════════════════╗" "WARN"
        Write-Log "║  WHATIF-MODUS AKTIV - Keine Objekte werden erstellt/     ║" "WARN"
        Write-Log "║  geändert. Nur Simulation.                               ║" "WARN"
        Write-Log "╚══════════════════════════════════════════════════════════╝" "WARN"
    }
    if ($script:SkipConfirmations) {
        Write-Log "Force-Modus aktiv: Alle Rückfragen werden automatisch bestätigt." "WARN"
    }

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

    # -- Config-Struktur prüfen --
    $requiredConfigKeys = @(
        'general.domain', 'general.excelFile', 'general.delimiter',
        'general.displayNamePrefixSharedMailbox', 'general.displayNamePrefixDistributionGroup',
        'general.defaultHiddenFromGAL', 'authentication.mode'
    )
    foreach ($keyPath in $requiredConfigKeys) {
        $parts  = $keyPath -split '\.'
        $obj    = $Config
        $found  = $true
        foreach ($part in $parts) {
            if ($null -eq $obj) { $found = $false; break }
            $p = $obj.PSObject.Properties[$part]
            if ($null -eq $p) { $found = $false; break }
            $obj = $p.Value
        }
        if (-not $found) {
            throw "Pflichtfeld '$keyPath' fehlt in config.json."
        }
    }

    # -- Domain-Pflichtfeld prüfen --
    $defaultDomain = Get-SafeTrim $Config.general.domain
    if ([string]::IsNullOrWhiteSpace($defaultDomain)) {
        throw "general.domain in config.json ist leer. Eine Standarddomain ist erforderlich."
    }

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

    # -- Tabellen aus Excel lesen (benannte ListObjects über EPPlus) --
    try {
        $smRows = @(Get-ExcelTableData -Path $ExcelFile -TableName "SharedMailboxes")
    }
    catch {
        Write-Log "Tabelle 'SharedMailboxes' nicht gefunden oder nicht lesbar: $($_.Exception.Message)" "WARN"
        $smRows = @()
    }
    try {
        $dgRows = @(Get-ExcelTableData -Path $ExcelFile -TableName "DistributionGroups")
    }
    catch {
        Write-Log "Tabelle 'DistributionGroups' nicht gefunden oder nicht lesbar: $($_.Exception.Message)" "WARN"
        $dgRows = @()
    }

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

        $SkippedCount = $smValidation.InvalidRowCount + $dgValidation.InvalidRowCount

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
                    if ($result.Action -eq 'Created') { $CreatedCount++ }
                }
            }
            catch {
                $errMsg = $_.Exception.Message
                Write-Log "Fehler bei Shared Mailbox (Zeile $TotalCount): $errMsg" "ERROR"
                $FailedCount++
                $rawAlias = "$(Get-RowProp $row 'Vorname').$(Get-RowProp $row 'Nachname').$(Get-RowProp $row 'Zusatz')"
                $partialAction = "Failed"
                if ($errMsg -notmatch "existiert bereits") {
                    # Lookup mit der tatsächlich verwendeten Identität (explizite Adresse oder normalisierter Alias)
                    $lookupId = Get-SafeTrim (Get-RowProp $row 'PrimaereAdresse')
                    if ([string]::IsNullOrWhiteSpace($lookupId)) {
                        try { $lookupId = Convert-ToMailboxAlias -Value $rawAlias } catch { $lookupId = '' }
                    }
                    if (-not [string]::IsNullOrWhiteSpace($lookupId)) {
                        $partialCheck = Get-Mailbox -Identity $lookupId -ErrorAction SilentlyContinue
                        if ($partialCheck) {
                            Write-Log "  TEILFEHLER: Mailbox '$lookupId' wurde angelegt aber nicht vollständig konfiguriert. Manuelle Prüfung und ggf. Bereinigung erforderlich." "WARN"
                            $partialAction = "PartiallyCreated"
                        }
                    }
                }
                $Results.Add([PSCustomObject]@{
                    Type        = "SharedMailbox"
                    Alias       = $rawAlias
                    PrimarySmtp = Get-SafeTrim (Get-RowProp $row 'PrimaereAdresse')
                    DisplayName = Get-SafeTrim (Get-RowProp $row 'Anzeigename')
                    Action      = $partialAction
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
                    if ($result.Action -eq 'Created') { $CreatedCount++ }
                }
            }
            catch {
                $errMsg = $_.Exception.Message
                Write-Log "Fehler bei Distribution Group (Zeile $TotalCount): $errMsg" "ERROR"
                $FailedCount++
                $rawAlias = "$(Get-RowProp $row 'Vorname').$(Get-RowProp $row 'Nachname').$(Get-RowProp $row 'Zusatz')"
                $partialAction = "Failed"
                if ($errMsg -notmatch "existiert bereits") {
                    # Lookup mit der tatsächlich verwendeten Identität (explizite Adresse oder normalisierter Alias)
                    $lookupId = Get-SafeTrim (Get-RowProp $row 'PrimaereAdresse')
                    if ([string]::IsNullOrWhiteSpace($lookupId)) {
                        try { $lookupId = Convert-ToMailboxAlias -Value $rawAlias } catch { $lookupId = '' }
                    }
                    if (-not [string]::IsNullOrWhiteSpace($lookupId)) {
                        $partialCheck = Get-DistributionGroup -Identity $lookupId -ErrorAction SilentlyContinue
                        if ($partialCheck) {
                            Write-Log "  TEILFEHLER: Distribution Group '$lookupId' wurde angelegt aber nicht vollständig konfiguriert. Manuelle Prüfung und ggf. Bereinigung erforderlich." "WARN"
                            $partialAction = "PartiallyCreated"
                        }
                    }
                }
                $Results.Add([PSCustomObject]@{
                    Type        = "DistributionGroup"
                    Alias       = $rawAlias
                    PrimarySmtp = Get-SafeTrim (Get-RowProp $row 'PrimaereAdresse')
                    DisplayName = Get-SafeTrim (Get-RowProp $row 'Anzeigename')
                    Action      = $partialAction
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
        Write-ResultsFile -Data $Results.ToArray() -Path $script:ResultsFile
        Write-Log "Ergebnis-CSV: $script:ResultsFile" "SUCCESS"
    }

    if ($script:AclProtectionFailed) {
        Write-Log "SICHERHEITSHINWEIS: Mindestens eine Ausgabedatei konnte nicht ACL-geschützt werden. Log/CSV enthalten Berechtigungsdaten - bitte manuell absichern." "WARN"
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
