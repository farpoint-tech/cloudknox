<#
.SYNOPSIS
    Analyzes all Enterprise Applications in the tenant and exports an Excel list for owner assignment.

.DESCRIPTION
    This script connects to the Azure AD / Entra ID tenant via Microsoft Graph API,
    reads all Service Principals (Enterprise Apps) and analyzes their tags and owner status.

    It creates a console summary with:
    - All detected tags in the tenant
    - A category summary (apps per tag, including those without an owner)

    It then exports a formatted Excel file that can be sent to departments.
    Departments fill in the columns "NEW Owner UPN", "Department", and "Notes".

.EXAMPLE
    .\Export-EnterpriseAppOwnerList.ps1
    Exports all Enterprise Apps into an Excel file.
    Default path: C:\Temp (Windows) or ~/Downloads (macOS)

.NOTES
    Required Permissions:
    - Application.Read.All
    - Directory.Read.All

    Required Modules:
    - Microsoft.Graph
    - ImportExcel

    Version: 1.3
    Author: Farpoint Technologies
    Created:  2026-04-08
    Modified: 2026-04-09 - Fix: Module checks, ConditionalText, auto export path
#>

# ============================================================
# Export-EnterpriseAppOwnerList.ps1
# Phase 1: Analysis, Tag Overview & Excel Export
# ============================================================

# --- CONFIGURATION ---
$FileName = "EnterpriseApp_OwnerAssignment_$(Get-Date -Format 'yyyyMMdd').xlsx"

if ($IsMacOS) {
    $ExportFolder = "$HOME/Downloads"
} else {
    $ExportFolder = "C:\Temp"
}

if (-not (Test-Path $ExportFolder)) {
    New-Item -ItemType Directory -Path $ExportFolder -Force | Out-Null
    Write-Host "📁 Created folder: $ExportFolder" -ForegroundColor Gray
}

$ExportPath = Join-Path $ExportFolder $FileName
Write-Host "📁 Export path: $ExportPath" -ForegroundColor Gray

# --- MODULE CHECK ---
if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Applications)) {
    Write-Host "`n⚠ Microsoft.Graph module not found. Installing..." -ForegroundColor Yellow
    Install-Module Microsoft.Graph -Scope CurrentUser -Force
}
Import-Module Microsoft.Graph.Applications
Import-Module Microsoft.Graph.Users

if (-not (Get-Module -ListAvailable -Name ImportExcel)) {
    Write-Host "`n⚠ ImportExcel module not found. Installing..." -ForegroundColor Yellow
    Install-Module ImportExcel -Scope CurrentUser -Force
}
Import-Module ImportExcel

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
Write-Host ("{0,-25} {1,-10} {2}" -f "Category", "Apps", "No Owner")
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

    $Category  = if ($SP.Tags -and $SP.Tags.Count -gt 0) { $SP.Tags[0] } else { "(no tag)" }
    $TagString = if ($SP.Tags) { $SP.Tags -join "; " } else { "" }
    $Status    = if ($OwnerUPNs) { "Has Owner" } else { "No Owner" }

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

# --- EXPORT TO EXCEL ---
$ExportData | Export-Excel -Path $ExportPath `
    -WorksheetName "App Owner Assignment" `
    -AutoSize -AutoFilter -FreezeTopRow `
    -TableName "AppOwners" -TableStyle Medium2 `
    -ConditionalText (
        New-ConditionalText -Text "No Owner" `
            -ConditionalTextColor Black `
            -BackgroundColor Orange `
            -Range "H2:H9999"
    )

Write-Host "`n✅ Export saved to: $ExportPath" -ForegroundColor Green
Write-Host "📧 Send this file to each department. They fill in columns I, J, K." -ForegroundColor Cyan

# --- OPEN FILE ---
Start-Process $ExportPath

Disconnect-MgGraph
