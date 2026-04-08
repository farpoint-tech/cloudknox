<#
.SYNOPSIS
    Analysiert alle Enterprise Applications im Tenant und exportiert eine Excel-Liste fuer die Owner-Zuweisung.

.DESCRIPTION
    Dieses Script verbindet sich via Microsoft Graph API mit dem Azure AD / Entra ID Tenant,
    liest alle Service Principals (Enterprise Apps) aus und analysiert deren Tags und Owner-Status.

    Es erstellt eine uebersichtliche Konsolenausgabe mit:
    - Allen erkannten Tags im Tenant
    - Einer Kategorie-Zusammenfassung (Apps pro Tag, davon ohne Owner)

    Anschliessend wird eine formatierte Excel-Datei exportiert, die an die jeweiligen
    Abteilungen gesendet werden kann. Die Abteilungen fuellen die Spalten "NEW Owner UPN",
    "Department" und "Notes" aus.

.EXAMPLE
    .\Export-EnterpriseAppOwnerList.ps1
    Exportiert alle Enterprise Apps in eine Excel-Datei im aktuellen Verzeichnis.

.NOTES
    Erforderliche Berechtigungen:
    - Application.Read.All
    - Directory.Read.All

    Erforderliche Module:
    - Microsoft.Graph
    - ImportExcel

    Version: 1.0
    Autor: Farpoint Technologies
    Erstellt: 2026-04-08
#>

#Requires -Modules Microsoft.Graph, ImportExcel

# ============================================================
# Export-EnterpriseAppOwnerList.ps1
# Phase 1: Analyse, Tag-Uebersicht & Excel-Export
# ============================================================

# --- CONFIGURATION ---
$ExportPath = ".\EnterpriseApp_OwnerAssignment_$(Get-Date -Format 'yyyyMMdd').xlsx"

# --- CONNECT ---
Connect-MgGraph -Scopes "Application.Read.All", "Directory.Read.All"

Write-Host "`n🔍 Fetching all Enterprise Applications..." -ForegroundColor Cyan
$AllSPs = Get-MgServicePrincipal -All -Property "Id,DisplayName,AppId,ServicePrincipalType,Tags"

# --- TAG ANALYSIS ---
$AllTags = $AllSPs | ForEach-Object { $_.Tags } | Where-Object { $_ } | Sort-Object -Unique
Write-Host "`n📋 DETECTED TAGS IN YOUR TENANT:" -ForegroundColor Yellow
Write-Host ("=" * 55)
if ($AllTags.Count -eq 0) {
    Write-Host "  (No tags found)" -ForegroundColor Gray
} else {
    $AllTags | ForEach-Object { Write-Host "  • $_" -ForegroundColor White }
}
Write-Host ("=" * 55)

# --- CATEGORY SUMMARY ---
$CategorySummary = $AllSPs | Group-Object {
    if ($_.Tags -and $_.Tags.Count -gt 0) { $_.Tags[0] } else { "(no tag)" }
} | Sort-Object Count -Descending

Write-Host "`n📊 APPS BY CATEGORY (first tag):" -ForegroundColor Yellow
Write-Host ("=" * 55)
Write-Host ("{0,-25} {1,-10} {2}" -f "Category","Apps","No Owner")
Write-Host ("-" * 55)
foreach ($grp in $CategorySummary) {
    $noOwner = 0
    foreach ($sp in $grp.Group) {
        $owners = Get-MgServicePrincipalOwner -ServicePrincipalId $sp.Id -ErrorAction SilentlyContinue
        if (-not $owners -or $owners.Count -eq 0) { $noOwner++ }
    }
    Write-Host ("{0,-25} {1,-10} {2}" -f $grp.Name, $grp.Count, "⚠ $noOwner without owner")
}
Write-Host ("=" * 55)

# --- BUILD EXPORT DATA ---
Write-Host "`n📤 Building export list..." -ForegroundColor Cyan
$ExportData = @()

foreach ($SP in $AllSPs) {
    $Owners = Get-MgServicePrincipalOwner -ServicePrincipalId $SP.Id -ErrorAction SilentlyContinue
    $OwnerUPNs = if ($Owners) {
        ($Owners | ForEach-Object {
            (Get-MgUser -UserId $_.Id -ErrorAction SilentlyContinue).UserPrincipalName
        }) -join "; "
    } else { "" }

    $Category = if ($SP.Tags -and $SP.Tags.Count -gt 0) { $SP.Tags[0] } else { "(no tag)" }
    $TagString = if ($SP.Tags) { $SP.Tags -join "; " } else { "" }
    $Status = if ($OwnerUPNs) { "Has Owner" } else { "No Owner" }

    $ExportData += [PSCustomObject]@{
        AppObjectId            = $SP.Id
        DisplayName            = $SP.DisplayName
        "AppId (Client ID)"    = $SP.AppId
        ServicePrincipalType   = $SP.ServicePrincipalType
        Tags                   = $TagString
        "Category (Tag)"       = $Category
        "Current Owner(s)"     = $OwnerUPNs
        "Owner Status"         = $Status
        "NEW Owner UPN"        = ""
        Department             = ""
        Notes                  = ""
    }
}

# --- EXPORT TO EXCEL (requires ImportExcel module) ---
# Install if needed: Install-Module ImportExcel -Scope CurrentUser
$ExportData | Export-Excel -Path $ExportPath `
    -WorksheetName "App Owner Assignment" `
    -AutoSize -AutoFilter -FreezeTopRow `
    -TableName "AppOwners" -TableStyle Medium2 `
    -ConditionalFormat @(
        New-ConditionalFormattingIconSet -Range "H2:H9999" -Pattern "No Owner" -Color "FFA500"
    )

Write-Host "`n✅ Export saved to: $ExportPath" -ForegroundColor Green
Write-Host "📧 Send this file to each department. They fill in columns I, J, K." -ForegroundColor Cyan

Disconnect-MgGraph
