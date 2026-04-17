<#
.SYNOPSIS
    Exportiert alle Conditional Access Policies aus Microsoft Entra ID via Microsoft Graph API.

.DESCRIPTION
    Dieses Script verbindet sich mit Microsoft Graph und exportiert alle Conditional Access Policies
    in mehrere Formate (JSON, CSV). Es erstellt:
      - Ein vollständiges JSON-Backup aller Policies
      - Eine CSV-Übersicht mit Status und Zeitstempeln
      - Eine CSV mit aufgelösten Assignments (Benutzer, Gruppen, Rollen)
      - Ein separates JSON-Backup der Admin/Privileged Policies
      - Eine CSV der Report-Only Policies
      - Eine HTML-Zusammenfassung für einfache Lesbarkeit
      - Eine Log-Datei des gesamten Export-Vorgangs

    Das Script ist rein lesend (Read-Only) und nimmt keine Änderungen an Policies vor.
    Es ist kompatibel mit PowerShell 7+ (Windows und macOS).

.PARAMETER ExportPath
    Optionaler Pfad für den Export-Ordner.
    Standard: ~/CA-Export/<Datum>

.PARAMETER TenantId
    Optionale Tenant-ID für den direkten Verbindungsaufbau (nützlich für MSP-Szenarien mit mehreren Tenants).
    Wenn nicht angegeben, wird der Standard-Tenant des angemeldeten Benutzers verwendet.

.PARAMETER ResolveNames
    Wenn angegeben, werden Gruppen- und Rollen-IDs in lesbare Namen aufgelöst.
    Dies erfordert zusätzliche Graph-Aufrufe und kann die Laufzeit erhöhen.
    Standard: $true

.PARAMETER SkipModuleInstall
    Wenn angegeben, wird die Modul-Prüfung und Installation übersprungen.
    Nützlich, wenn die Module bereits installiert sind und keine Internetverbindung für Updates besteht.

.EXAMPLE
    # Standard-Export mit Namensauflösung
    .\Export-ConditionalAccessPolicies.ps1

.EXAMPLE
    # Export in einen benutzerdefinierten Pfad ohne Namensauflösung
    .\Export-ConditionalAccessPolicies.ps1 -ExportPath "C:\Exports\CA" -ResolveNames:$false

.EXAMPLE
    # Export für einen spezifischen Tenant (MSP-Szenario)
    .\Export-ConditionalAccessPolicies.ps1 -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

.NOTES
    Autor:          CloudKnox / farpoint technologies ag
    Version:        2.0.0
    Erstellt:       2025-03-26
    Letzte Änderung: 2025-03-26
    Lizenz:         MIT

    Benötigte Graph-Berechtigungen (Delegated, Read-Only):
      - Policy.Read.All              (Lesen aller CA-Policies)
      - Directory.Read.All           (Auflösen von Gruppen, Rollen, Benutzern)
      - RoleManagement.Read.Directory (Auflösen von Directory-Rollen)

    Benötigte PowerShell-Module:
      - Microsoft.Graph.Authentication
      - Microsoft.Graph.Identity.SignIns
      - Microsoft.Graph.Groups
      - Microsoft.Graph.Identity.DirectoryManagement

    Kompatibilität:
      - PowerShell 7.0 oder höher (empfohlen: 7.4+)
      - Windows 10/11, macOS 12+, Linux (Ubuntu 20.04+)
      - Microsoft Graph PowerShell SDK v2.x

    Sicherheitshinweis:
      Das Script verwendet ausschliesslich Read-Only Graph-Scopes und nimmt
      keinerlei Änderungen an Policies oder Tenant-Konfigurationen vor.
      Es werden keine Credentials, Secrets oder Tokens in Dateien gespeichert.

.LINK
    https://github.com/farpoint-tech/cloudknox
    https://learn.microsoft.com/en-us/graph/api/conditionalaccessroot-list-policies
#>

#Requires -Version 7.0

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $false, HelpMessage = "Pfad für den Export-Ordner. Standard: ~/CA-Export/<Datum>")]
    [ValidateNotNullOrEmpty()]
    [string]$ExportPath = (Join-Path $HOME "CA-Export" (Get-Date -Format "yyyy-MM-dd_HH-mm")),

    [Parameter(Mandatory = $false, HelpMessage = "Tenant-ID für MSP-Szenarien mit mehreren Tenants.")]
    [ValidatePattern('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')]
    [string]$TenantId,

    [Parameter(Mandatory = $false, HelpMessage = "Gruppen- und Rollen-IDs in lesbare Namen auflösen.")]
    [bool]$ResolveNames = $true,

    [Parameter(Mandatory = $false, HelpMessage = "Modul-Prüfung und Installation überspringen.")]
    [switch]$SkipModuleInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ============================================================
#  REGION: HILFSFUNKTIONEN
# ============================================================

#region Helper Functions

function Write-Log {
    <#
    .SYNOPSIS
        Schreibt eine Nachricht sowohl in die Konsole als auch in die Log-Datei.
    .PARAMETER Message
        Die zu protokollierende Nachricht.
    .PARAMETER Level
        Der Log-Level: INFO, SUCCESS, WARNING, ERROR.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Message,

        [Parameter(Mandatory = $false)]
        [ValidateSet("INFO", "SUCCESS", "WARNING", "ERROR")]
        [string]$Level = "INFO"
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry  = "[$timestamp] [$Level] $Message"

    # Farbe je nach Level
    $color = switch ($Level) {
        "INFO"    { "Cyan"   }
        "SUCCESS" { "Green"  }
        "WARNING" { "Yellow" }
        "ERROR"   { "Red"    }
    }

    Write-Host $logEntry -ForegroundColor $color

    # In Log-Datei schreiben (nur wenn Pfad bereits gesetzt)
    if ($script:LogFile -and (Test-Path (Split-Path $script:LogFile -Parent))) {
        Add-Content -Path $script:LogFile -Value $logEntry -Encoding UTF8
    }
}

function Ensure-GraphModule {
    <#
    .SYNOPSIS
        Prüft, ob ein Microsoft Graph Modul installiert ist, und installiert es bei Bedarf.
    .PARAMETER ModuleName
        Der Name des zu prüfenden/installierenden Moduls.
    #>
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
        Write-Log "Modul '$ModuleName' (v$($installed.Version)) ist bereits installiert." -Level INFO
    }

    # Modul importieren, falls noch nicht geladen
    if (-not (Get-Module -Name $ModuleName)) {
        Import-Module -Name $ModuleName -ErrorAction Stop
    }
}

function Resolve-GroupName {
    <#
    .SYNOPSIS
        Löst eine Entra ID Gruppen-ID in den Anzeigenamen auf.
    .PARAMETER GroupId
        Die Objekt-ID der Gruppe.
    .NOTES
        Gibt bei Fehler die ursprüngliche ID zurück, damit der Export nicht abbricht.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$GroupId
    )

    # Bekannte Sonderwerte nicht auflösen
    if ($GroupId -in @("All", "None", "GuestsOrExternalUsers")) {
        return $GroupId
    }

    # Cache prüfen (verhindert wiederholte API-Aufrufe)
    if ($script:GroupCache.ContainsKey($GroupId)) {
        return $script:GroupCache[$GroupId]
    }

    try {
        $group = Get-MgGroup -GroupId $GroupId -Property DisplayName -ErrorAction Stop
        $script:GroupCache[$GroupId] = $group.DisplayName
        return $group.DisplayName
    }
    catch {
        Write-Log "Gruppe '$GroupId' konnte nicht aufgelöst werden: $($_.Exception.Message)" -Level WARNING
        $script:GroupCache[$GroupId] = $GroupId  # Fallback: ID zurückgeben
        return $GroupId
    }
}

function Resolve-RoleName {
    <#
    .SYNOPSIS
        Löst eine Entra ID Directory-Rollen-ID in den Anzeigenamen auf.
    .PARAMETER RoleId
        Die Template-ID der Rolle.
    .NOTES
        Gibt bei Fehler die ursprüngliche ID zurück, damit der Export nicht abbricht.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$RoleId
    )

    if ($script:RoleCache.ContainsKey($RoleId)) {
        return $script:RoleCache[$RoleId]
    }

    try {
        # Rollen werden über DirectoryRoleTemplates aufgelöst
        $role = Get-MgDirectoryRoleTemplate -DirectoryRoleTemplateId $RoleId -Property DisplayName -ErrorAction Stop
        $script:RoleCache[$RoleId] = $role.DisplayName
        return $role.DisplayName
    }
    catch {
        Write-Log "Rolle '$RoleId' konnte nicht aufgelöst werden: $($_.Exception.Message)" -Level WARNING
        $script:RoleCache[$RoleId] = $RoleId
        return $RoleId
    }
}

function Get-PolicyRiskLevel {
    <#
    .SYNOPSIS
        Bewertet das Risiko einer Policy anhand ihrer Konfiguration.
    .DESCRIPTION
        Gibt eine Risikobewertung (LOW/MEDIUM/HIGH) zurück, basierend auf:
        - Ob die Policy deaktiviert ist
        - Ob sie nur im Report-Only-Modus läuft
        - Ob kritische Benutzer (All Users) eingeschlossen sind
        - Ob Ausschlüsse vorhanden sind
    .PARAMETER Policy
        Das Policy-Objekt aus der Graph API.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        $Policy
    )

    if ($Policy.State -eq "disabled") { return "LOW" }
    if ($Policy.State -eq "enabledForReportingButNotEnforced") { return "MEDIUM" }

    # Hohe Aufmerksamkeit wenn "All" Users eingeschlossen und keine Ausschlüsse
    $includesAll    = $Policy.Conditions.Users.IncludeUsers -contains "All"
    $hasExclusions  = ($Policy.Conditions.Users.ExcludeUsers.Count -gt 0) -or
                      ($Policy.Conditions.Users.ExcludeGroups.Count -gt 0)

    if ($includesAll -and -not $hasExclusions) { return "HIGH" }
    if ($includesAll -and $hasExclusions)       { return "MEDIUM" }

    return "LOW"
}

#endregion

# ============================================================
#  REGION: INITIALISIERUNG
# ============================================================

#region Initialization

# Export-Ordner und Log-Datei vorbereiten
try {
    if (-not (Test-Path $ExportPath)) {
        New-Item -ItemType Directory -Path $ExportPath -Force | Out-Null
    }
    $script:LogFile = Join-Path $ExportPath "export.log"
    $script:GroupCache = @{}
    $script:RoleCache  = @{}
}
catch {
    Write-Error "Fehler beim Erstellen des Export-Ordners '$ExportPath': $($_.Exception.Message)"
    exit 1
}

Write-Log "============================================================" -Level INFO
Write-Log "  CloudKnox - Conditional Access Export v2.0" -Level INFO
Write-Log "  farpoint technologies ag" -Level INFO
Write-Log "============================================================" -Level INFO
Write-Log "Export-Pfad: $ExportPath" -Level INFO
Write-Log "Namensauflösung: $ResolveNames" -Level INFO

#endregion

# ============================================================
#  REGION: MODUL-VERWALTUNG
# ============================================================

#region Module Management

if (-not $SkipModuleInstall) {
    Write-Log "Prüfe benötigte PowerShell-Module..." -Level INFO

    $requiredModules = @(
        "Microsoft.Graph.Authentication",
        "Microsoft.Graph.Identity.SignIns",
        "Microsoft.Graph.Groups",
        "Microsoft.Graph.Identity.DirectoryManagement"
    )

    foreach ($module in $requiredModules) {
        try {
            Ensure-GraphModule -ModuleName $module
        }
        catch {
            Write-Log "Kritischer Fehler: Modul '$module' konnte nicht geladen werden. Abbruch." -Level ERROR
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

# Benötigte Scopes - ausschliesslich Read-Only (Principle of Least Privilege)
$graphScopes = @(
    "Policy.Read.All",                   # Lesen aller CA-Policies
    "Directory.Read.All",                # Auflösen von Gruppen und Benutzern
    "RoleManagement.Read.Directory"      # Auflösen von Directory-Rollen
)

try {
    $connectParams = @{
        Scopes = $graphScopes
        NoWelcome = $true  # Unterdrückt die Willkommensnachricht
    }

    # Tenant-ID nur hinzufügen, wenn explizit angegeben (MSP-Szenario)
    if ($TenantId) {
        $connectParams["TenantId"] = $TenantId
        Write-Log "Verbinde mit Tenant: $TenantId" -Level INFO
    }

    Connect-MgGraph @connectParams

    # Verbindung verifizieren
    $context = Get-MgContext
    if (-not $context) {
        throw "Graph-Kontext konnte nicht abgerufen werden. Authentifizierung fehlgeschlagen."
    }

    Write-Log "Erfolgreich verbunden als: $($context.Account)" -Level SUCCESS
    Write-Log "Tenant-ID: $($context.TenantId)" -Level INFO
    Write-Log "Aktive Scopes: $($context.Scopes -join ', ')" -Level INFO
}
catch {
    Write-Log "Fehler bei der Graph-Authentifizierung: $($_.Exception.Message)" -Level ERROR
    exit 1
}

#endregion

# ============================================================
#  REGION: POLICIES ABRUFEN
# ============================================================

#region Fetch Policies

Write-Log "Rufe alle Conditional Access Policies ab..." -Level INFO

try {
    # -All stellt sicher, dass bei grossen Tenants alle Seiten paginiert werden
    $policies = Get-MgIdentityConditionalAccessPolicy -All -ErrorAction Stop

    if (-not $policies -or $policies.Count -eq 0) {
        Write-Log "Keine Conditional Access Policies gefunden. Tenant möglicherweise leer oder fehlende Berechtigung." -Level WARNING
        exit 0
    }

    Write-Log "Insgesamt $($policies.Count) Policies gefunden." -Level SUCCESS
}
catch {
    Write-Log "Fehler beim Abrufen der Policies: $($_.Exception.Message)" -Level ERROR
    Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
    exit 1
}

#endregion

# ============================================================
#  REGION: EXPORT 1 - JSON VOLLBACKUP
# ============================================================

#region Export 1 - Full JSON Backup

Write-Log "Erstelle vollständiges JSON-Backup..." -Level INFO

try {
    $jsonBackupPath = Join-Path $ExportPath "ConditionalAccess-Backup.json"
    $policies | ConvertTo-Json -Depth 50 | Out-File -FilePath $jsonBackupPath -Encoding UTF8 -Force
    Write-Log "JSON-Backup gespeichert: $jsonBackupPath" -Level SUCCESS
}
catch {
    Write-Log "Fehler beim Erstellen des JSON-Backups: $($_.Exception.Message)" -Level ERROR
    # Kein exit - andere Exporte sollen trotzdem versucht werden
}

#endregion

# ============================================================
#  REGION: EXPORT 2 - CSV ÜBERSICHT
# ============================================================

#region Export 2 - CSV Overview

Write-Log "Erstelle CSV-Übersicht..." -Level INFO

try {
    $overviewPath = Join-Path $ExportPath "CA-Overview.csv"

    $policies |
        Select-Object DisplayName, State, CreatedDateTime, ModifiedDateTime, Id |
        Export-Csv -Path $overviewPath -NoTypeInformation -Delimiter ";" -Encoding UTF8

    Write-Log "CSV-Übersicht gespeichert: $overviewPath" -Level SUCCESS
}
catch {
    Write-Log "Fehler beim Erstellen der CSV-Übersicht: $($_.Exception.Message)" -Level ERROR
}

#endregion

# ============================================================
#  REGION: EXPORT 3 - ASSIGNMENTS MIT NAMENSAUFLÖSUNG
# ============================================================

#region Export 3 - Assignments

Write-Log "Erstelle Assignments-Export (Namensauflösung: $ResolveNames)..." -Level INFO

try {
    $assignmentList = foreach ($p in $policies) {

        # Gruppen-IDs auflösen (wenn aktiviert)
        $includeGroupsRaw = $p.Conditions.Users.IncludeGroups
        $excludeGroupsRaw = $p.Conditions.Users.ExcludeGroups

        if ($ResolveNames -and $includeGroupsRaw) {
            $includeGroupsResolved = ($includeGroupsRaw | ForEach-Object { Resolve-GroupName -GroupId $_ }) -join " | "
        } else {
            $includeGroupsResolved = $includeGroupsRaw -join " | "
        }

        if ($ResolveNames -and $excludeGroupsRaw) {
            $excludeGroupsResolved = ($excludeGroupsRaw | ForEach-Object { Resolve-GroupName -GroupId $_ }) -join " | "
        } else {
            $excludeGroupsResolved = $excludeGroupsRaw -join " | "
        }

        # Rollen-IDs auflösen (wenn aktiviert)
        $includeRolesRaw = $p.Conditions.Users.IncludeRoles
        if ($ResolveNames -and $includeRolesRaw) {
            $includeRolesResolved = ($includeRolesRaw | ForEach-Object { Resolve-RoleName -RoleId $_ }) -join " | "
        } else {
            $includeRolesResolved = $includeRolesRaw -join " | "
        }

        # Risikobewertung der Policy
        $riskLevel = Get-PolicyRiskLevel -Policy $p

        [PSCustomObject]@{
            PolicyId              = $p.Id
            PolicyName            = $p.DisplayName
            State                 = $p.State
            RiskLevel             = $riskLevel
            IncludeUsers          = ($p.Conditions.Users.IncludeUsers -join " | ")
            IncludeGroups         = $includeGroupsResolved
            IncludeRoles          = $includeRolesResolved
            ExcludeUsers          = ($p.Conditions.Users.ExcludeUsers -join " | ")
            ExcludeGroups         = $excludeGroupsResolved
            IncludeApplications   = ($p.Conditions.Applications.IncludeApplications -join " | ")
            ExcludeApplications   = ($p.Conditions.Applications.ExcludeApplications -join " | ")
            GrantControls         = ($p.GrantControls.BuiltInControls -join " | ")
            SessionControls       = if ($p.SessionControls) { "Ja" } else { "Nein" }
            CreatedDateTime       = $p.CreatedDateTime
            ModifiedDateTime      = $p.ModifiedDateTime
        }
    }

    $assignmentsPath = Join-Path $ExportPath "CA-Assignments.csv"
    $assignmentList | Export-Csv -Path $assignmentsPath -Delimiter ";" -NoTypeInformation -Encoding UTF8

    Write-Log "Assignments-Export gespeichert: $assignmentsPath" -Level SUCCESS
}
catch {
    Write-Log "Fehler beim Erstellen des Assignments-Exports: $($_.Exception.Message)" -Level ERROR
}

#endregion

# ============================================================
#  REGION: EXPORT 4 - ADMIN-POLICIES
# ============================================================

#region Export 4 - Admin Policies

Write-Log "Filtere Admin/Privileged Policies..." -Level INFO

try {
    # Privilegierte Rollen-Templates (Global Admin, Security Admin, etc.)
    # Quelle: https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/permissions-reference
    $privilegedRoleTemplateIds = @(
        "62e90394-69f5-4237-9190-012177145e10",  # Global Administrator
        "194ae4cb-b126-40b2-bd5b-6091b380977d",  # Security Administrator
        "f28a1f50-f6e7-4571-818b-6a12f2af6b6c",  # SharePoint Administrator
        "29232cdf-9323-42fd-ade2-1d097af3e4de",  # Exchange Administrator
        "b1be1c3e-b65d-4f19-8427-f6fa0d97feb9",  # Conditional Access Administrator
        "158c047a-c907-4556-b7ef-446551a6b5f7",  # Cloud Application Administrator
        "b0f54661-2d74-4c50-afa3-1ec803f12efe",  # Billing Administrator
        "fe930be7-5e62-47db-91af-98c3a49a38b1",  # User Administrator
        "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3",  # Application Administrator
        "e8611ab8-c189-46e8-94e1-60213ab1f814",  # Privileged Role Administrator
        "7be44c8a-adaf-4e2a-84d6-ab2649e08a13",  # Privileged Authentication Administrator
        "966707d0-3269-4727-9be2-8c3a10f19b9d"   # Password Administrator
    )

    # Filter: Policies, die privilegierte Rollen einschliessen ODER nach Name erkennbar sind
    $adminPolicies = $policies | Where-Object {
        $includesPrivRole = ($_.Conditions.Users.IncludeRoles | Where-Object { $_ -in $privilegedRoleTemplateIds }).Count -gt 0
        $nameMatch        = $_.DisplayName -match "(?i)(Admin|Administrator|Privileged|PIM|PAW|Tier0|Tier1|Tier-0|Tier-1)"
        $includesPrivRole -or $nameMatch
    }

    $adminJsonPath = Join-Path $ExportPath "Admin-Policies.json"
    $adminPolicies | ConvertTo-Json -Depth 50 | Out-File -FilePath $adminJsonPath -Encoding UTF8 -Force

    Write-Log "Admin-Policies ($($adminPolicies.Count) Stück) exportiert: $adminJsonPath" -Level SUCCESS
}
catch {
    Write-Log "Fehler beim Exportieren der Admin-Policies: $($_.Exception.Message)" -Level ERROR
}

#endregion

# ============================================================
#  REGION: EXPORT 5 - REPORT-ONLY POLICIES
# ============================================================

#region Export 5 - Report-Only Policies

Write-Log "Filtere Report-Only Policies..." -Level INFO

try {
    $reportOnly = $policies | Where-Object { $_.State -eq "enabledForReportingButNotEnforced" }

    $reportOnlyPath = Join-Path $ExportPath "CA-ReportOnly.csv"
    $reportOnly |
        Select-Object DisplayName, State, CreatedDateTime, ModifiedDateTime, Id |
        Export-Csv -Path $reportOnlyPath -Delimiter ";" -NoTypeInformation -Encoding UTF8

    Write-Log "Report-Only-Policies ($($reportOnly.Count) Stück) exportiert: $reportOnlyPath" -Level SUCCESS
}
catch {
    Write-Log "Fehler beim Exportieren der Report-Only-Policies: $($_.Exception.Message)" -Level ERROR
}

#endregion

# ============================================================
#  REGION: EXPORT 6 - DEAKTIVIERTE POLICIES
# ============================================================

#region Export 6 - Disabled Policies

Write-Log "Filtere deaktivierte Policies..." -Level INFO

try {
    $disabledPolicies = $policies | Where-Object { $_.State -eq "disabled" }

    $disabledPath = Join-Path $ExportPath "CA-Disabled.csv"
    $disabledPolicies |
        Select-Object DisplayName, State, CreatedDateTime, ModifiedDateTime, Id |
        Export-Csv -Path $disabledPath -Delimiter ";" -NoTypeInformation -Encoding UTF8

    Write-Log "Deaktivierte Policies ($($disabledPolicies.Count) Stück) exportiert: $disabledPath" -Level SUCCESS
}
catch {
    Write-Log "Fehler beim Exportieren der deaktivierten Policies: $($_.Exception.Message)" -Level ERROR
}

#endregion

# ============================================================
#  REGION: EXPORT 7 - HTML ZUSAMMENFASSUNG
# ============================================================

#region Export 7 - HTML Summary Report

Write-Log "Erstelle HTML-Zusammenfassung..." -Level INFO

try {
    $enabledCount   = ($policies | Where-Object { $_.State -eq "enabled" }).Count
    $reportOnlyCount = ($policies | Where-Object { $_.State -eq "enabledForReportingButNotEnforced" }).Count
    $disabledCount  = ($policies | Where-Object { $_.State -eq "disabled" }).Count
    $highRiskCount  = ($assignmentList | Where-Object { $_.RiskLevel -eq "HIGH" }).Count
    $tenantInfo     = Get-MgContext

    $htmlRows = $assignmentList | ForEach-Object {
        $rowColor = switch ($_.RiskLevel) {
            "HIGH"   { "#ffe6e6" }
            "MEDIUM" { "#fff8e6" }
            default  { "#ffffff" }
        }
        "<tr style='background-color:$rowColor'>
            <td>$($_.PolicyName)</td>
            <td>$($_.State)</td>
            <td><strong>$($_.RiskLevel)</strong></td>
            <td>$($_.IncludeUsers)</td>
            <td>$($_.IncludeGroups)</td>
            <td>$($_.GrantControls)</td>
            <td>$($_.ModifiedDateTime)</td>
        </tr>"
    }

    $htmlContent = @"
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conditional Access Export Report</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #333; background: #f9f9f9; }
        h1   { color: #0078d4; border-bottom: 3px solid #0078d4; padding-bottom: 10px; }
        h2   { color: #005a9e; margin-top: 30px; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
        .card { background: white; border-radius: 8px; padding: 20px; text-align: center;
                box-shadow: 0 2px 6px rgba(0,0,0,0.1); border-top: 4px solid #0078d4; }
        .card .number { font-size: 2.5em; font-weight: bold; color: #0078d4; }
        .card .label  { font-size: 0.9em; color: #666; margin-top: 5px; }
        .card.warning { border-top-color: #d83b01; }
        .card.warning .number { color: #d83b01; }
        table { width: 100%; border-collapse: collapse; background: white;
                box-shadow: 0 2px 6px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
        th    { background: #0078d4; color: white; padding: 12px 10px; text-align: left; font-size: 0.9em; }
        td    { padding: 10px; border-bottom: 1px solid #eee; font-size: 0.85em; }
        tr:hover td { background-color: #f0f7ff !important; }
        .footer { margin-top: 40px; font-size: 0.8em; color: #999; border-top: 1px solid #ddd; padding-top: 15px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; font-weight: bold; }
        .badge-high   { background: #ffe6e6; color: #c00; }
        .badge-medium { background: #fff8e6; color: #a60; }
        .badge-low    { background: #e6f4ea; color: #2a7a2a; }
    </style>
</head>
<body>
    <h1>&#128274; Conditional Access Export Report</h1>
    <p><strong>Tenant:</strong> $($tenantInfo.TenantId) &nbsp;|&nbsp;
       <strong>Exportiert am:</strong> $(Get-Date -Format "dd.MM.yyyy HH:mm") &nbsp;|&nbsp;
       <strong>Exportiert von:</strong> $($tenantInfo.Account)</p>

    <h2>Zusammenfassung</h2>
    <div class="summary-grid">
        <div class="card">
            <div class="number">$($policies.Count)</div>
            <div class="label">Policies gesamt</div>
        </div>
        <div class="card">
            <div class="number">$enabledCount</div>
            <div class="label">Aktiv (Enforced)</div>
        </div>
        <div class="card">
            <div class="number">$reportOnlyCount</div>
            <div class="label">Report-Only</div>
        </div>
        <div class="card warning">
            <div class="number">$highRiskCount</div>
            <div class="label">Hohe Risikobewertung</div>
        </div>
    </div>

    <h2>Policy-Übersicht</h2>
    <table>
        <thead>
            <tr>
                <th>Policy Name</th>
                <th>Status</th>
                <th>Risiko</th>
                <th>Include Users</th>
                <th>Include Groups</th>
                <th>Grant Controls</th>
                <th>Zuletzt geändert</th>
            </tr>
        </thead>
        <tbody>
            $($htmlRows -join "`n")
        </tbody>
    </table>

    <div class="footer">
        <p>Generiert von: <strong>CloudKnox CA Export Script v2.0</strong> | farpoint technologies ag<br>
        GitHub: <a href="https://github.com/farpoint-tech/cloudknox">https://github.com/farpoint-tech/cloudknox</a><br>
        Dieses Dokument enthält vertrauliche Tenant-Konfigurationsdaten. Bitte entsprechend schützen.</p>
    </div>
</body>
</html>
"@

    $htmlPath = Join-Path $ExportPath "CA-Report.html"
    $htmlContent | Out-File -FilePath $htmlPath -Encoding UTF8 -Force
    Write-Log "HTML-Report gespeichert: $htmlPath" -Level SUCCESS
}
catch {
    Write-Log "Fehler beim Erstellen des HTML-Reports: $($_.Exception.Message)" -Level ERROR
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

#region Final Summary

$enabledFinal     = ($policies | Where-Object { $_.State -eq "enabled" }).Count
$reportOnlyFinal  = ($policies | Where-Object { $_.State -eq "enabledForReportingButNotEnforced" }).Count
$disabledFinal    = ($policies | Where-Object { $_.State -eq "disabled" }).Count
$adminFinal       = if ($adminPolicies) { $adminPolicies.Count } else { 0 }
$highRiskFinal    = if ($assignmentList) { ($assignmentList | Where-Object { $_.RiskLevel -eq "HIGH" }).Count } else { 0 }

Write-Log "" -Level INFO
Write-Log "============================================================" -Level SUCCESS
Write-Log "   EXPORT ABGESCHLOSSEN" -Level SUCCESS
Write-Log "============================================================" -Level SUCCESS
Write-Log "Policies gesamt:        $($policies.Count)" -Level INFO
Write-Log "  Aktiv (Enforced):     $enabledFinal" -Level INFO
Write-Log "  Report-Only:          $reportOnlyFinal" -Level INFO
Write-Log "  Deaktiviert:          $disabledFinal" -Level INFO
Write-Log "  Admin/Privileged:     $adminFinal" -Level INFO
Write-Log "  Hohe Risikobewertung: $highRiskFinal" -Level INFO
Write-Log "" -Level INFO
Write-Log "Exportierte Dateien:" -Level INFO
Write-Log "  ConditionalAccess-Backup.json  (Vollbackup)" -Level INFO
Write-Log "  CA-Overview.csv                (Übersicht)" -Level INFO
Write-Log "  CA-Assignments.csv             (Zuweisungen)" -Level INFO
Write-Log "  Admin-Policies.json            (Admin-Policies)" -Level INFO
Write-Log "  CA-ReportOnly.csv              (Report-Only)" -Level INFO
Write-Log "  CA-Disabled.csv                (Deaktivierte)" -Level INFO
Write-Log "  CA-Report.html                 (HTML-Report)" -Level INFO
Write-Log "  export.log                     (Log-Datei)" -Level INFO
Write-Log "" -Level INFO
Write-Log "Export-Ordner: $ExportPath" -Level SUCCESS
Write-Log "============================================================" -Level SUCCESS

#endregion
