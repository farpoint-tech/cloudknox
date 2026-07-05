<#
.SYNOPSIS
    Importiert Conditional Access Policies aus einem JSON-Backup in Microsoft Entra ID.

.DESCRIPTION
    Liest das JSON-Backup von Export-ConditionalAccessPolicies.ps1 ein und importiert
    die enthaltenen Policies via Microsoft Graph API in den Zieltenant.

    Das Script erkennt das Betriebssystem automatisch (Windows, macOS, Windows on Parallels)
    und normalisiert eingefügte Pfade entsprechend. Der Importpfad wird interaktiv abgefragt,
    sofern er nicht als Parameter übergeben wird – Copy-Paste aus dem Explorer oder Finder
    wird direkt unterstützt.

    Sicherheitshinweis: Policies werden standardmässig als "disabled" importiert, um
    Tenant-Lockouts zu verhindern. Erst nach manueller Prüfung aktivieren.

.PARAMETER ImportFile
    Pfad zur JSON-Backup-Datei (ConditionalAccess-Backup.json vom Exporter).
    Wenn nicht angegeben, wird der Pfad interaktiv abgefragt (Copy-Paste-freundlich).
    Anführungszeichen werden automatisch entfernt.

.PARAMETER TenantId
    Optionale Tenant-ID für den direkten Verbindungsaufbau (MSP-Szenarien mit mehreren Tenants).
    Wenn nicht angegeben, wird der Standard-Tenant des angemeldeten Benutzers verwendet.

.PARAMETER TargetState
    Status der importierten Policies. Gültige Werte:
      disabled                          – (Standard) Deaktiviert importieren. Empfohlen!
      enabledForReportingButNotEnforced – Report-Only Modus. Kein Enforcement, aber Logs.
      keepOriginal                      – Originalstatus aus dem Backup. ACHTUNG: Lockout-Risiko!

.PARAMETER Force
    Wenn angegeben, werden bestehende Policies mit gleichem DisplayName überschrieben (PATCH).
    Standard: Policies mit gleichem Namen werden übersprungen.
    Hinweis: Beim Update wird der aktuelle Live-Status der bestehenden Policy bewahrt.
    Der -TargetState gilt nur für NEU erstellte Policies (Lockout-/MFA-Schutz).

.PARAMETER AllowDisableExisting
    Erlaubt beim Update (-Force), eine aktuell aktive ("enabled") oder Report-Only Policy
    auf "disabled" zu setzen. Ohne diesen Schalter wird der Live-Status niemals still
    geschwächt, sondern bewahrt. ACHTUNG: Kann MFA-/CA-Enforcement deaktivieren!

.PARAMETER IgnoreDuplicateCheck
    Fährt fort, auch wenn die Duplikat-Prüfung (Laden bestehender Policies) fehlschlägt
    (z.B. Throttling/Berechtigung). Standard: Import wird abgebrochen, damit ein
    fehlgeschlagener GET nicht zu Massen-Duplikaten führt. Nicht empfohlen.

.PARAMETER SkipModuleInstall
    Überspringt die automatische Modul-Prüfung und Installation.
    Nützlich, wenn Module bereits installiert sind und keine Internetverbindung besteht.

.EXAMPLE
    # Standard-Import – Pfad wird interaktiv abgefragt, Policies als "disabled" importieren
    .\Import-ConditionalAccessPolicies.ps1

.EXAMPLE
    # Import mit direktem Pfad
    .\Import-ConditionalAccessPolicies.ps1 -ImportFile "C:\Backup\ConditionalAccess-Backup.json"

.EXAMPLE
    # macOS-Pfad (funktioniert auch auf Windows via Parallels)
    .\Import-ConditionalAccessPolicies.ps1 -ImportFile "/Users/john/CA-Export/ConditionalAccess-Backup.json"

.EXAMPLE
    # Import als Report-Only (sicherer Testmodus ohne Enforcement)
    .\Import-ConditionalAccessPolicies.ps1 -TargetState enabledForReportingButNotEnforced

.EXAMPLE
    # Bestehende Policies überschreiben + MSP-Tenant angeben
    .\Import-ConditionalAccessPolicies.ps1 -Force -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

.NOTES
    Autor:          CloudKnox / farpoint technologies ag
    Version:        1.0.0
    Erstellt:       2026-05-04
    Lizenz:         MIT

    Benötigte Graph-Berechtigungen (Delegated):
      - Policy.ReadWrite.All  (Erstellen und Aktualisieren von CA-Policies)
      - Policy.Read.All       (Duplikat-Prüfung bestehender Policies)

    Benötigte PowerShell-Module:
      - Microsoft.Graph.Authentication
      - Microsoft.Graph.Identity.SignIns

    Kompatibilität:
      - PowerShell 7.0 oder höher
      - Windows 10/11, macOS 12+, Linux (Ubuntu 20.04+)
      - Windows via Parallels auf Mac (Pfadnormalisierung automatisch)

    WICHTIG – Lockout-Prävention:
      Importierte Policies werden standardmässig als "disabled" erstellt.
      Aktiviere Policies immer erst nach sorgfältiger Prüfung im Zieltenant!

.LINK
    https://github.com/farpoint-tech/cloudknox
    https://learn.microsoft.com/en-us/graph/api/conditionalaccessroot-post-policies
#>

#Requires -Version 7.0

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $false, HelpMessage = "Pfad zur JSON-Backup-Datei. Wenn leer, wird interaktiv abgefragt.")]
    [string]$ImportFile,

    [Parameter(Mandatory = $false, HelpMessage = "Tenant-ID für MSP-Szenarien.")]
    [ValidatePattern('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')]
    [string]$TenantId,

    [Parameter(Mandatory = $false, HelpMessage = "Zielstatus der importierten Policies.")]
    [ValidateSet("disabled", "enabledForReportingButNotEnforced", "keepOriginal")]
    [string]$TargetState = "disabled",

    [Parameter(Mandatory = $false, HelpMessage = "Bestehende Policies mit gleichem DisplayName überschreiben.")]
    [switch]$Force,

    [Parameter(Mandatory = $false, HelpMessage = "Erlaubt beim Update das Deaktivieren einer aktuell aktiven/Report-Only Policy. Ohne diesen Schalter wird der Live-Status bewahrt.")]
    [switch]$AllowDisableExisting,

    [Parameter(Mandatory = $false, HelpMessage = "Ignoriert einen Fehler bei der Duplikat-Prüfung und fährt trotzdem fort (nicht empfohlen – Risiko von Massen-Duplikaten).")]
    [switch]$IgnoreDuplicateCheck,

    [Parameter(Mandatory = $false, HelpMessage = "Quell-Tenant-ID des Backups. Wird sie angegeben und stimmt mit dem Ziel-Tenant überein, gilt der Import als Restore in denselben Tenant und Directory-GUIDs werden NICHT zwangsdeaktiviert. Ohne diese Angabe wird der Import sicherheitshalber als tenant-übergreifend behandelt.")]
    [ValidatePattern('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')]
    [string]$SourceTenantId,

    [Parameter(Mandatory = $false, HelpMessage = "Modul-Prüfung und Installation überspringen.")]
    [switch]$SkipModuleInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Locale-unabhängige Ausführung erzwingen (kein Einfluss von Systemsprache auf Datum/Zahlen)
[System.Threading.Thread]::CurrentThread.CurrentCulture   = [System.Globalization.CultureInfo]::InvariantCulture
[System.Threading.Thread]::CurrentThread.CurrentUICulture = [System.Globalization.CultureInfo]::InvariantCulture

# ============================================================
#  REGION: HILFSFUNKTIONEN
# ============================================================

#region Helper Functions

function Write-Log {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Message,

        [Parameter(Mandatory = $false)]
        [ValidateSet("INFO", "SUCCESS", "WARNING", "ERROR")]
        [string]$Level = "INFO"
    )

    $timestamp = [System.DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm:ss", [System.Globalization.CultureInfo]::InvariantCulture)
    $logEntry  = "[$timestamp] [$Level] $Message"

    $color = switch ($Level) {
        "INFO"    { "Cyan"   }
        "SUCCESS" { "Green"  }
        "WARNING" { "Yellow" }
        "ERROR"   { "Red"    }
    }

    Write-Host $logEntry -ForegroundColor $color

    if ($script:LogFile -and (Test-Path (Split-Path $script:LogFile -Parent) -ErrorAction SilentlyContinue)) {
        Add-Content -Path $script:LogFile -Value $logEntry -Encoding UTF8
    }
}

function Ensure-GraphModule {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$ModuleName
    )

    $installed = Get-Module -ListAvailable -Name $ModuleName | Sort-Object Version -Descending | Select-Object -First 1

    if (-not $installed) {
        Write-Log "Modul '$ModuleName' nicht gefunden. Installiere..." -Level WARNING
        try {
            Install-Module -Name $ModuleName -Scope CurrentUser -Force -AllowClobber -Repository PSGallery
            Write-Log "Modul '$ModuleName' erfolgreich installiert." -Level SUCCESS
        }
        catch {
            Write-Log "Fehler beim Installieren von '$ModuleName': $($_.Exception.Message)" -Level ERROR
            throw
        }
    }
    else {
        Write-Log "Modul '$ModuleName' (v$($installed.Version)) ist verfügbar." -Level INFO
    }

    if (-not (Get-Module -Name $ModuleName)) {
        Import-Module -Name $ModuleName -ErrorAction Stop
    }
}

function Get-DetectedPlatform {
    # Erkennt die aktuelle Plattform inklusive Windows-on-Parallels-Szenario.
    # Rückgabe: "Windows", "macOS", "WindowsOnParallels", "Linux"
    if ($IsWindows) {
        # Parallels-Indikator: Shared-Folder-Pfad \\Mac\ ist erreichbar
        $parallelsPath = "\\Mac\"
        if (Test-Path $parallelsPath -ErrorAction SilentlyContinue) {
            return "WindowsOnParallels"
        }
        # Zweiter Indikator: Parallels-spezifische Umgebungsvariable / Servicename
        $prlService = Get-Service -Name "Parallels*" -ErrorAction SilentlyContinue
        if ($prlService) {
            return "WindowsOnParallels"
        }
        return "Windows"
    }
    elseif ($IsMacOS)  { return "macOS" }
    elseif ($IsLinux)  { return "Linux" }
    else               { return "Unknown" }
}

function Resolve-ImportPath {
    # Normalisiert einen eingefügten Pfad je nach erkannter Plattform.
    # Behandelt: Anführungszeichen, Tilde, Pfadtrennzeichen, Parallels UNC-Konvertierung.
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$RawPath,

        [Parameter(Mandatory)]
        [string]$Platform
    )

    # 1. Führende/abschliessende Leerzeichen und Anführungszeichen entfernen
    #    (passiert beim Copy-Paste aus Explorer/Finder oft automatisch)
    $path = $RawPath.Trim().Trim('"').Trim("'").Trim()

    # 2. Tilde auf allen Plattformen expandieren
    if ($path.StartsWith("~")) {
        $path = $path -replace '^~', $HOME
    }

    # 3. Plattform-spezifische Pfadnormalisierung
    switch ($Platform) {
        "Windows" {
            # Vorwärts-Slashes zu Rückwärts-Slashes normalisieren
            $path = $path -replace '/', '\'
        }
        "WindowsOnParallels" {
            # Unix-Pfad eingefügt (z.B. aus macOS Finder): /Users/... → \\Mac\Home\...
            if ($path -match '^/Users/[^/]+/(.*)$') {
                $relativePart = $matches[1] -replace '/', '\'
                $parallelsPath = "\\Mac\Home\$relativePart"
                if (Test-Path $parallelsPath -ErrorAction SilentlyContinue) {
                    Write-Log "macOS-Pfad via Parallels Shared Folder gefunden: $parallelsPath" -Level INFO
                    $path = $parallelsPath
                }
                else {
                    # Fallback: nur Slashes normalisieren, Benutzer informieren
                    $path = $path -replace '/', '\'
                    Write-Log "Parallels-Pfad '$parallelsPath' nicht erreichbar. Verwende normalisierter Pfad." -Level WARNING
                }
            }
            elseif ($path -match '^/(.*)$') {
                # Anderer Unix-Pfad auf Parallels – nur Slashes tauschen
                $path = $path -replace '/', '\'
            }
            else {
                $path = $path -replace '/', '\'
            }
        }
        "macOS" {
            # Windows-Pfad eingefügt (z.B. C:\Users\...): Rückwärts-Slashes zu Vorwärts-Slashes
            $path = $path -replace '\\', '/'
            # C:\ → nicht direkt auflösbar auf macOS, Hinweis ausgeben
            if ($path -match '^[A-Za-z]:/') {
                Write-Log "Windows-Laufwerkspfad auf macOS eingegeben. Pfad möglicherweise ungültig." -Level WARNING
            }
        }
        "Linux" {
            $path = $path -replace '\\', '/'
        }
    }

    return $path
}

function ConvertTo-PolicyHashtable {
    # Konvertiert ein PSCustomObject (aus ConvertFrom-Json) rekursiv in ein Hashtable
    # mit camelCase-Schlüsseln, bereinigt um read-only und SDK-interne Felder.
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        $InputObject
    )

    if ($null -eq $InputObject) { return $null }

    # Array-Behandlung
    if ($InputObject -is [System.Collections.IEnumerable] -and $InputObject -isnot [string]) {
        $result = [System.Collections.Generic.List[object]]::new()
        foreach ($item in $InputObject) {
            $result.Add((ConvertTo-PolicyHashtable -InputObject $item))
        }
        return $result.ToArray()
    }

    # PSCustomObject / Hashtable in camelCase-Hashtable umwandeln
    if ($InputObject -is [PSCustomObject] -or $InputObject -is [System.Collections.IDictionary]) {
        $output  = [ordered]@{}
        $props   = if ($InputObject -is [PSCustomObject]) { $InputObject.PSObject.Properties } else { $InputObject.GetEnumerator() }

        # Felder, die die Graph API nicht akzeptiert (read-only oder SDK-intern)
        $skipFields = @(
            'id', 'Id',
            'createdDateTime', 'CreatedDateTime',
            'modifiedDateTime', 'ModifiedDateTime',
            'AdditionalData', 'additionalData',
            'BackingStore', 'backingStore',
            'OdataType', '@odata.type', '@odata.context'
        )

        foreach ($prop in $props) {
            $name  = $prop.Name
            $value = $prop.Value

            if ($name -in $skipFields)     { continue }
            if ($null -eq $value)          { continue }

            # PascalCase → camelCase (erstes Zeichen zu Kleinbuchstabe)
            $camelName = $name.Substring(0, 1).ToLowerInvariant() + $name.Substring(1)

            $output[$camelName] = ConvertTo-PolicyHashtable -InputObject $value
        }

        # Leere Objekte nicht weitergeben (Graph API mag keine leeren Conditions-Blöcke)
        if ($output.Count -eq 0) { return $null }
        return $output
    }

    return $InputObject
}

function Get-ExistingPolicyNames {
    # Lädt alle bestehenden CA-Policy-Namen aus dem Tenant (für Duplikat-Prüfung).
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [switch]$IgnoreDuplicateCheck
    )
    try {
        $existing = Invoke-MgGraphRequest -Method GET `
            -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies?`$select=id,displayName" `
            -ErrorAction Stop

        $nameMap = @{}
        foreach ($p in $existing.value) {
            $nameMap[$p.displayName] = $p.id
        }

        # Paginierung
        $nextLink = $existing.'@odata.nextLink'
        while ($nextLink) {
            $page = Invoke-MgGraphRequest -Method GET -Uri $nextLink -ErrorAction Stop
            foreach ($p in $page.value) {
                $nameMap[$p.displayName] = $p.id
            }
            $nextLink = $page.'@odata.nextLink'
        }

        return $nameMap
    }
    catch {
        # WICHTIG: Bei einem Fehler (Throttling/transient/Berechtigung) darf die
        # Duplikat-Prüfung NICHT stillschweigend deaktiviert werden – sonst würde
        # ein erneuter Lauf jede Policy erneut per POST anlegen (Massen-Duplikate).
        if ($IgnoreDuplicateCheck) {
            Write-Log "Bestehende Policies konnten nicht geladen werden: $($_.Exception.Message). Duplikat-Prüfung wird auf Wunsch übersprungen (-IgnoreDuplicateCheck)." -Level WARNING
            return @{}
        }
        throw "Duplikat-Prüfung fehlgeschlagen: $($_.Exception.Message). Import wird abgebrochen, um Massen-Duplikate zu vermeiden. Mit -IgnoreDuplicateCheck kann die Prüfung bewusst übersprungen werden (nicht empfohlen)."
    }
}

function Get-DirectoryObjectGuidReference {
    # Prüft, ob eine (bereinigte) Policy-Hashtable Verweise auf Directory-Objekte
    # (GUIDs) enthält, die nach einem Tenant-Wechsel ungültig wären und damit
    # ein Lockout-Risiko darstellen (tote Break-Glass-Ausschlüsse, tote
    # Trusted-Location-Ausschlüsse etc.). Geprüft werden:
    #   conditions.users.{include|exclude}{Users,Groups,Roles}
    #   conditions.locations.{include|exclude}Locations
    #   conditions.applications.{include|exclude}Applications
    # Sonderwerte (All/None/GuestsOrExternalUsers/AllTrusted) werden ignoriert.
    # Rückgabe: Liste der gefundenen "feld=guid"-Referenzen (leer wenn keine).
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        $PolicyBody
    )

    $guidPattern   = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    $specialValues = @('All', 'None', 'GuestsOrExternalUsers', 'AllTrusted', 'Office365', 'MicrosoftAdminPortals')
    $found         = [System.Collections.Generic.List[string]]::new()

    if ($null -eq $PolicyBody -or $PolicyBody -isnot [System.Collections.IDictionary]) { return $found }
    if (-not $PolicyBody.Contains('conditions')) { return $found }
    $conditions = $PolicyBody['conditions']
    if ($null -eq $conditions -or $conditions -isnot [System.Collections.IDictionary]) { return $found }

    # Sub-Objekt -> zu prüfende GUID-Felder. Jedes dieser Felder kann Directory-
    # Objekt-IDs enthalten, die tenant-spezifisch sind.
    $sections = @{
        'users'        = @('includeUsers', 'excludeUsers', 'includeGroups', 'excludeGroups', 'includeRoles', 'excludeRoles')
        'locations'    = @('includeLocations', 'excludeLocations')
        'applications' = @('includeApplications', 'excludeApplications')
    }

    foreach ($sectionName in $sections.Keys) {
        if (-not $conditions.Contains($sectionName)) { continue }
        $section = $conditions[$sectionName]
        if ($null -eq $section -or $section -isnot [System.Collections.IDictionary]) { continue }

        foreach ($field in $sections[$sectionName]) {
            if (-not $section.Contains($field)) { continue }
            $values = $section[$field]
            if ($null -eq $values) { continue }
            foreach ($v in @($values)) {
                if (($v -is [string]) -and ($v -match $guidPattern) -and ($v -notin $specialValues)) {
                    $found.Add("$sectionName.$field=$v")
                }
            }
        }
    }

    return $found
}

#endregion

# ============================================================
#  REGION: PLATTFORM-ERKENNUNG
# ============================================================

#region Platform Detection

$platform = Get-DetectedPlatform
Write-Host ""
Write-Host "============================================================" -ForegroundColor DarkCyan
Write-Host "  CloudKnox - Conditional Access Import v1.0" -ForegroundColor Cyan
Write-Host "  farpoint technologies ag" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor DarkCyan
Write-Host ""

$platformLabel = switch ($platform) {
    "Windows"           { "Windows" }
    "WindowsOnParallels"{ "Windows on Parallels (Mac)" }
    "macOS"             { "macOS" }
    "Linux"             { "Linux" }
    default             { "Unbekannt" }
}
Write-Host "  Erkannte Plattform: " -NoNewline -ForegroundColor Gray
Write-Host $platformLabel -ForegroundColor White
Write-Host ""

#endregion

# ============================================================
#  REGION: PFAD-EINGABE
# ============================================================

#region Path Input

# Pfad interaktiv abfragen wenn nicht per Parameter übergeben
$resolvedPath = $null

while (-not $resolvedPath) {

    if (-not $ImportFile) {
        Write-Host "  Pfad zur JSON-Backup-Datei eingeben oder einfu" -NoNewline -ForegroundColor Cyan
        Write-Host "gen:" -ForegroundColor Cyan
        Write-Host "  (z.B. ConditionalAccess-Backup.json vom Exporter)" -ForegroundColor DarkGray
        Write-Host ""
        $ImportFile = Read-Host "  Pfad"
    }

    if ([string]::IsNullOrWhiteSpace($ImportFile)) {
        Write-Host "  Kein Pfad eingegeben. Bitte erneut versuchen." -ForegroundColor Yellow
        $ImportFile = $null
        continue
    }

    $normalizedPath = Resolve-ImportPath -RawPath $ImportFile -Platform $platform

    if (Test-Path -LiteralPath $normalizedPath -PathType Leaf) {
        $resolvedPath = $normalizedPath
    }
    elseif (Test-Path -LiteralPath $normalizedPath -PathType Container) {
        # Ordner angegeben: automatisch ConditionalAccess-Backup.json suchen
        $candidate = Join-Path $normalizedPath "ConditionalAccess-Backup.json"
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            Write-Host "  Ordner angegeben. Verwende: $candidate" -ForegroundColor Cyan
            $resolvedPath = $candidate
        }
        else {
            Write-Host "  Ordner gefunden, aber keine 'ConditionalAccess-Backup.json' darin." -ForegroundColor Yellow
            Write-Host "  Bitte vollständigen Pfad zur JSON-Datei angeben." -ForegroundColor Yellow
            $ImportFile = $null
        }
    }
    else {
        Write-Host ""
        Write-Host "  Datei nicht gefunden: $normalizedPath" -ForegroundColor Red
        Write-Host "  Bitte Pfad prüfen und erneut eingeben." -ForegroundColor Yellow
        Write-Host ""
        $ImportFile = $null
    }
}

# Log-Datei im gleichen Ordner wie die Import-Datei ablegen
$importDir         = Split-Path $resolvedPath -Parent
$script:LogFile    = Join-Path $importDir "import.log"

Write-Host ""
Write-Host "  Import-Datei : $resolvedPath" -ForegroundColor Green
Write-Host "  Log-Datei    : $($script:LogFile)" -ForegroundColor DarkGray
Write-Host "  Zielstatus   : $TargetState" -ForegroundColor DarkGray
if ($Force) {
    Write-Host "  Modus        : Bestehende Policies überschreiben (-Force)" -ForegroundColor Yellow
}
else {
    Write-Host "  Modus        : Bestehende Policies überspringen (Standard)" -ForegroundColor DarkGray
}
Write-Host ""

Write-Log "============================================================" -Level INFO
Write-Log "  CloudKnox - Conditional Access Import v1.0" -Level INFO
Write-Log "  farpoint technologies ag" -Level INFO
Write-Log "============================================================" -Level INFO
Write-Log "Plattform    : $platform" -Level INFO
Write-Log "Import-Datei : $resolvedPath" -Level INFO
Write-Log "Zielstatus   : $TargetState" -Level INFO
Write-Log "Force-Modus  : $($Force.IsPresent)" -Level INFO

#endregion

# ============================================================
#  REGION: JSON EINLESEN
# ============================================================

#region Load JSON

Write-Log "Lese JSON-Backup ein..." -Level INFO

try {
    $rawContent = Get-Content -LiteralPath $resolvedPath -Raw -Encoding UTF8 -ErrorAction Stop
    $policies   = $rawContent | ConvertFrom-Json -Depth 50 -ErrorAction Stop
}
catch {
    Write-Log "Fehler beim Einlesen der JSON-Datei: $($_.Exception.Message)" -Level ERROR
    exit 1
}

# Unterstützt sowohl ein Array von Policies als auch ein einzelnes Policy-Objekt
if ($policies -isnot [System.Collections.IEnumerable] -or $policies -is [string]) {
    $policies = @($policies)
}
elseif ($policies -is [PSCustomObject]) {
    # Einzelnes Objekt
    $policies = @($policies)
}

if ($policies.Count -eq 0) {
    Write-Log "Keine Policies in der JSON-Datei gefunden." -Level WARNING
    exit 0
}

Write-Log "$($policies.Count) Policies in der JSON-Datei gefunden." -Level SUCCESS

#endregion

# ============================================================
#  REGION: MODUL-VERWALTUNG
# ============================================================

#region Module Management

if (-not $SkipModuleInstall) {
    Write-Log "Prüfe benötigte PowerShell-Module..." -Level INFO

    $requiredModules = @(
        "Microsoft.Graph.Authentication",
        "Microsoft.Graph.Identity.SignIns"
    )

    foreach ($module in $requiredModules) {
        try {
            Ensure-GraphModule -ModuleName $module
        }
        catch {
            Write-Log "Kritischer Fehler: Modul '$module' konnte nicht geladen werden." -Level ERROR
            exit 1
        }
    }
}
else {
    Write-Log "Modul-Prüfung übersprungen (-SkipModuleInstall)." -Level WARNING
}

#endregion

# ============================================================
#  REGION: GRAPH-AUTHENTIFIZIERUNG
# ============================================================

#region Authentication

Write-Log "Verbinde mit Microsoft Graph..." -Level INFO

$graphScopes = @(
    "Policy.ReadWrite.All",   # Erstellen und Aktualisieren von CA-Policies
    "Policy.Read.All"         # Duplikat-Prüfung bestehender Policies
)

try {
    $connectParams = @{
        Scopes    = $graphScopes
        NoWelcome = $true
    }

    if ($TenantId) {
        $connectParams["TenantId"] = $TenantId
        Write-Log "Verbinde mit Tenant: $TenantId" -Level INFO
    }

    Connect-MgGraph @connectParams

    $context = Get-MgContext
    if (-not $context) {
        throw "Graph-Kontext konnte nicht abgerufen werden. Authentifizierung fehlgeschlagen."
    }

    Write-Log "Verbunden als      : $($context.Account)" -Level SUCCESS
    Write-Log "Tenant-ID          : $($context.TenantId)" -Level INFO
    Write-Log "Aktive Scopes      : $($context.Scopes -join ', ')" -Level INFO
}
catch {
    Write-Log "Fehler bei der Graph-Authentifizierung: $($_.Exception.Message)" -Level ERROR
    exit 1
}

#endregion

# ============================================================
#  REGION: BESTEHENDE POLICIES LADEN (DUPLIKAT-PRÜFUNG)
# ============================================================

#region Load Existing

Write-Log "Lade bestehende Policies aus dem Tenant (Duplikat-Prüfung)..." -Level INFO
try {
    $existingPolicies = Get-ExistingPolicyNames -IgnoreDuplicateCheck:$IgnoreDuplicateCheck
}
catch {
    Write-Log $_.Exception.Message -Level ERROR
    Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
    exit 1
}
Write-Log "$($existingPolicies.Count) bestehende Policies im Tenant gefunden." -Level INFO

#endregion

# ============================================================
#  REGION: POLICIES IMPORTIEREN
# ============================================================

#region Import

Write-Log "Starte Import..." -Level INFO
Write-Host ""

$counters = @{
    Created  = 0
    Updated  = 0
    Skipped  = 0
    Failed   = 0
}

# ------------------------------------------------------------
#  Cross-Tenant-Erkennung (Schutz gegen Lockout durch nicht
#  remappte Directory-GUIDs, z.B. Break-Glass-Ausschlüsse)
# ------------------------------------------------------------
$currentTenantId = [string]$context.TenantId

# Quell-Tenant-ID bestimmen. Vorrang hat der explizite Parameter -SourceTenantId
# (vom Operator zugesichert). Andernfalls wird versucht, sie aus dem Backup zu
# lesen.
# HINWEIS: Der aktuelle Exporter schreibt die Quell-Tenant-ID NICHT in das
# JSON-Backup (das Backup ist ein reines Policy-Array). Ohne -SourceTenantId ist
# sie daher i.d.R. unbekannt und wird bewusst als "möglicherweise abweichend"
# behandelt (sicherer Default gegen Lockout).
$sourceTenantId = $null
if ($PSBoundParameters.ContainsKey('SourceTenantId') -and $SourceTenantId) {
    $sourceTenantId = [string]$SourceTenantId
    Write-Log "Quell-Tenant-ID explizit angegeben: '$sourceTenantId'." -Level INFO
}
else {
    foreach ($p in $policies) {
        foreach ($propName in @('SourceTenantId', 'sourceTenantId')) {
            if (($p.PSObject.Properties.Name -contains $propName) -and $p.$propName) {
                $sourceTenantId = [string]$p.$propName
                break
            }
        }
        if ($sourceTenantId) { break }
    }
}

if (-not $sourceTenantId) {
    $isCrossTenant = $true
    Write-Log "Quell-Tenant-ID unbekannt (weder -SourceTenantId angegeben noch im Backup hinterlegt) – Import wird sicherheitshalber als tenant-übergreifend behandelt. Policies mit Directory-GUID-Referenzen werden geschützt (kein Enable). Für einen bestätigten Restore in denselben Tenant -SourceTenantId angeben." -Level WARNING
}
elseif ($sourceTenantId -ne $currentTenantId) {
    $isCrossTenant = $true
    Write-Log "Tenant-übergreifender Import erkannt: Quelle '$sourceTenantId' != Ziel '$currentTenantId'. Directory-GUID-Referenzen werden NICHT remappt und Policies deshalb nicht aktiviert." -Level WARNING
}
else {
    $isCrossTenant = $false
    Write-Log "Import in denselben Tenant (Quelle == Ziel: '$currentTenantId'). Kein GUID-Remapping erforderlich." -Level INFO
}

# Policies, die wegen Cross-Tenant-Import zwangsweise deaktiviert wurden
$forceDisabledForCrossTenant = [System.Collections.Generic.List[string]]::new()

foreach ($policy in $policies) {
    $displayName = $policy.DisplayName ?? $policy.displayName ?? "(kein Name)"

    # Zielstatus bestimmen
    $stateToApply = if ($TargetState -eq "keepOriginal") {
        $policy.State ?? $policy.state ?? "disabled"
    }
    else {
        $TargetState
    }

    # Policy-Body bereinigen (read-only-Felder entfernen, camelCase normalisieren)
    $policyBody = ConvertTo-PolicyHashtable -InputObject $policy

    if ($null -eq $policyBody) {
        Write-Log "Policy '$displayName' konnte nicht verarbeitet werden (leeres Objekt). Überspringe." -Level WARNING
        $counters.Skipped++
        continue
    }

    # Zustandsüberschreibung anwenden
    $policyBody['state'] = $stateToApply

    # Sicherheitsnetz: ID-Felder nochmals explizit entfernen
    $policyBody.Remove('id')
    $policyBody.Remove('createdDateTime')
    $policyBody.Remove('modifiedDateTime')

    try {
        if ($existingPolicies.ContainsKey($displayName)) {
            # Policy existiert bereits
            if ($Force) {
                $existingId = $existingPolicies[$displayName]

                # ----------------------------------------------------------------
                #  Ein Update darf den Live-Status einer bestehenden Policy NIEMALS
                #  still schwächen (z.B. aktive MFA-Enforcement -> disabled).
                #  Aktuellen Status der Ziel-Policy lesen und bewahren.
                #  Der -TargetState gilt bewusst nur für NEU erstellte Policies.
                # ----------------------------------------------------------------
                $existingState = $null
                try {
                    $existingPolicyObj = Invoke-MgGraphRequest -Method GET `
                        -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies/$($existingId)?`$select=id,state" `
                        -ErrorAction Stop
                    if (($existingPolicyObj -is [System.Collections.IDictionary]) -and $existingPolicyObj.Contains('state')) {
                        $existingState = [string]$existingPolicyObj['state']
                    }
                    elseif ($existingPolicyObj -and ($existingPolicyObj.PSObject.Properties.Name -contains 'state')) {
                        $existingState = [string]$existingPolicyObj.state
                    }
                }
                catch {
                    Write-Log "  WARNUNG  : Aktueller Status von '$displayName' konnte nicht gelesen werden: $($_.Exception.Message)" -Level WARNING
                }

                if ($AllowDisableExisting) {
                    # Operator hat explizit zugestimmt: TargetState auch beim Update anwenden
                    $effectiveState = $stateToApply
                    if ($existingState -and ($existingState -in @('enabled', 'enabledForReportingButNotEnforced')) -and ($stateToApply -eq 'disabled')) {
                        Write-Log "  WARNUNG  : '$displayName' wird von '$existingState' auf 'disabled' gesetzt (-AllowDisableExisting aktiv – Live-Enforcement wird deaktiviert!)." -Level WARNING
                    }
                    $policyBody['state'] = $effectiveState
                }
                elseif ($existingState) {
                    # Standard: bestehenden Live-Status bewahren, nie still schwächen
                    $effectiveState = $existingState
                    if (($existingState -in @('enabled', 'enabledForReportingButNotEnforced')) -and ($stateToApply -eq 'disabled')) {
                        Write-Log "  WARNUNG  : '$displayName' ist aktuell '$existingState'. Import wollte 'disabled' setzen – Live-Status wird BEWAHRT (kein stilles Deaktivieren). Für explizites Deaktivieren -AllowDisableExisting verwenden." -Level WARNING
                    }
                    elseif ($stateToApply -ne $existingState) {
                        Write-Log "  INFO     : '$displayName' – bestehender Status '$existingState' wird beim Update bewahrt (TargetState '$stateToApply' gilt nur für neue Policies)." -Level INFO
                    }
                    $policyBody['state'] = $effectiveState
                }
                else {
                    # Aktueller Status konnte nicht gelesen werden -> 'state' NICHT mitsenden,
                    # damit Graph den bestehenden Status beibehält (kein stilles Schwächen).
                    $effectiveState = "unverändert (nicht gelesen)"
                    $policyBody.Remove('state')
                    Write-Log "  WARNUNG  : '$displayName' – aktueller Status unbekannt. 'state' wird beim PATCH ausgelassen, damit der Live-Status erhalten bleibt." -Level WARNING
                }

                # ----------------------------------------------------------------
                #  Lockout-Schutz beim UPDATE: Ein PATCH überschreibt die
                #  'conditions' der Ziel-Policy mit den (nicht remappten) GUIDs aus
                #  dem Backup. Bei tenant-übergreifendem Import sind diese GUIDs im
                #  Ziel ungültig – eine weiterhin AKTIVE Policy mit toten
                #  Break-Glass-Ausschlüssen würde zum Lockout führen. Deshalb wird
                #  der Status hier zwingend auf 'disabled' gesetzt, egal welcher
                #  Live-Status zuvor bewahrt wurde.
                # ----------------------------------------------------------------
                $guidRefs = Get-DirectoryObjectGuidReference -PolicyBody $policyBody
                if ($isCrossTenant -and ($guidRefs.Count -gt 0)) {
                    Write-Log "  ACHTUNG  : '$displayName' (Update) referenziert nicht-remappte Directory-GUIDs ($($guidRefs -join ', ')). Bei tenant-übergreifendem Import wird der Status zur Lockout-Vermeidung auf 'disabled' erzwungen. GUIDs manuell prüfen/remappen, bevor die Policy wieder aktiviert wird!" -Level WARNING
                    $effectiveState = 'disabled'
                    $policyBody['state'] = 'disabled'
                    if (-not $forceDisabledForCrossTenant.Contains($displayName)) {
                        $forceDisabledForCrossTenant.Add($displayName)
                    }
                }

                $bodyJson = $policyBody | ConvertTo-Json -Depth 50 -Compress

                if ($PSCmdlet.ShouldProcess($displayName, "Bestehende Policy aktualisieren (PATCH)")) {
                    Invoke-MgGraphRequest -Method PATCH `
                        -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies/$existingId" `
                        -Body $bodyJson `
                        -ContentType "application/json" `
                        -ErrorAction Stop | Out-Null
                }

                $stateNote = if ($AllowDisableExisting) { "gemäss -AllowDisableExisting" } else { "Live-Status bewahrt" }
                Write-Log "  UPDATED  : '$displayName' (State: $effectiveState, $stateNote)" -Level SUCCESS
                $counters.Updated++
            }
            else {
                Write-Log "  SKIPPED  : '$displayName' (bereits vorhanden, kein -Force)" -Level WARNING
                $counters.Skipped++
            }
        }
        else {
            # ----------------------------------------------------------------
            #  Neue Policy erstellen. Bei tenant-übergreifendem Import werden
            #  Directory-GUIDs (User/Gruppen/Rollen) NICHT remappt. Enthält die
            #  Policy solche GUIDs (z.B. Break-Glass-Ausschlüsse), würde eine
            #  aktive Policy zum Lockout führen -> zwangsweise 'disabled'.
            # ----------------------------------------------------------------
            $effectiveState = $stateToApply
            $guidRefs = Get-DirectoryObjectGuidReference -PolicyBody $policyBody
            if ($isCrossTenant -and ($guidRefs.Count -gt 0) -and ($effectiveState -ne 'disabled')) {
                Write-Log "  ACHTUNG  : '$displayName' referenziert nicht-remappte Directory-GUIDs ($($guidRefs -join ', ')). Bei tenant-übergreifendem Import wird der Status zur Lockout-Vermeidung auf 'disabled' erzwungen. GUIDs (inkl. Break-Glass-Ausschlüsse) manuell im Ziel-Tenant prüfen/remappen, bevor die Policy aktiviert wird!" -Level WARNING
                $effectiveState = 'disabled'
                $forceDisabledForCrossTenant.Add($displayName)
            }

            $policyBody['state'] = $effectiveState
            $bodyJson = $policyBody | ConvertTo-Json -Depth 50 -Compress

            if ($PSCmdlet.ShouldProcess($displayName, "Neue Policy erstellen (POST)")) {
                Invoke-MgGraphRequest -Method POST `
                    -Uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
                    -Body $bodyJson `
                    -ContentType "application/json" `
                    -ErrorAction Stop | Out-Null
            }

            Write-Log "  CREATED  : '$displayName' (State: $effectiveState)" -Level SUCCESS
            $counters.Created++
        }
    }
    catch {
        Write-Log "  FAILED   : '$displayName' – $($_.Exception.Message)" -Level ERROR
        $counters.Failed++
    }
}

#endregion

# ============================================================
#  REGION: GRAPH-VERBINDUNG TRENNEN
# ============================================================

#region Disconnect

try {
    Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
    Write-Log "Graph-Verbindung getrennt." -Level INFO
}
catch {
    Write-Log "Hinweis: Graph-Verbindung konnte nicht sauber getrennt werden." -Level WARNING
}

#endregion

# ============================================================
#  REGION: ABSCHLUSSZUSAMMENFASSUNG
# ============================================================

#region Summary

Write-Log "" -Level INFO
Write-Log "============================================================" -Level SUCCESS
Write-Log "   IMPORT ABGESCHLOSSEN" -Level SUCCESS
Write-Log "============================================================" -Level SUCCESS
Write-Log "Policies in Backup-Datei : $($policies.Count)" -Level INFO
Write-Log "  Erstellt (Created)     : $($counters.Created)" -Level INFO
Write-Log "  Aktualisiert (Updated) : $($counters.Updated)" -Level INFO
Write-Log "  Übersprungen (Skipped) : $($counters.Skipped)" -Level INFO
Write-Log "  Fehlgeschlagen (Failed): $($counters.Failed)" -Level INFO
Write-Log "" -Level INFO

if ($forceDisabledForCrossTenant.Count -gt 0) {
    Write-Log "TENANT-ÜBERGREIFENDER IMPORT – folgende neu erstellte Policies wurden zur" -Level WARNING
    Write-Log "Lockout-Vermeidung ZWANGSWEISE auf 'disabled' gesetzt (Directory-GUIDs NICHT remappt):" -Level WARNING
    foreach ($n in $forceDisabledForCrossTenant) {
        Write-Log "   - $n" -Level WARNING
    }
    Write-Log "Bitte User-/Gruppen-/Rollen-GUIDs (inkl. Break-Glass-Ausschlüsse) manuell im" -Level WARNING
    Write-Log "Ziel-Tenant prüfen und remappen, bevor diese Policies aktiviert werden." -Level WARNING
    Write-Log "" -Level WARNING
}

if ($TargetState -ne "enabled") {
    Write-Log "WICHTIG: Alle importierten Policies haben den Status '$TargetState'." -Level WARNING
    Write-Log "         Bitte Policies im Entra Portal prüfen und erst dann aktivieren." -Level WARNING
}

Write-Log "Log-Datei: $($script:LogFile)" -Level INFO
Write-Log "============================================================" -Level SUCCESS

if ($counters.Failed -gt 0) {
    Write-Host ""
    Write-Host "  $($counters.Failed) Policy(ies) konnten nicht importiert werden." -ForegroundColor Red
    Write-Host "  Details: $($script:LogFile)" -ForegroundColor Red
    exit 1
}

#endregion
