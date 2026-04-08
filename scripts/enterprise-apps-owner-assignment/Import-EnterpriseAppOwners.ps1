<#
.SYNOPSIS
    Liest eine ausgefuellte Excel-Datei ein und weist Enterprise Apps die eingetragenen Owner zu.

.DESCRIPTION
    Dieses Script ist Phase 2 des Owner-Assignment-Workflows. Es liest die von den Abteilungen
    ausgefuellte Excel-Datei (exportiert durch Export-EnterpriseAppOwnerList.ps1) ein und weist
    die in der Spalte "NEW Owner UPN" eingetragenen Benutzer als Owner der jeweiligen
    Enterprise Application (Service Principal) zu.

    Das Script unterstuetzt zwei Modi:
    - WhatIf (Standard): Zeigt an, welche Zuweisungen vorgenommen wuerden, ohne Aenderungen durchzufuehren
    - Apply: Fuehrt die Owner-Zuweisungen tatsaechlich durch

.PARAMETER ExcelPath
    Pfad zur ausgefuellten Excel-Datei (.xlsx). Muss das Worksheet "App Owner Assignment" enthalten.

.PARAMETER Mode
    Ausfuehrungsmodus: "WhatIf" fuer Dry-Run (Standard) oder "Apply" fuer Live-Ausfuehrung.

.EXAMPLE
    .\Import-EnterpriseAppOwners.ps1 -ExcelPath ".\EnterpriseApp_OwnerAssignment_20260408.xlsx"
    Fuehrt einen Dry-Run durch und zeigt alle geplanten Zuweisungen an.

.EXAMPLE
    .\Import-EnterpriseAppOwners.ps1 -ExcelPath ".\EnterpriseApp_OwnerAssignment_20260408.xlsx" -Mode Apply
    Fuehrt die Owner-Zuweisungen tatsaechlich durch.

.NOTES
    Erforderliche Berechtigungen:
    - Application.ReadWrite.All
    - Directory.ReadWrite.All

    Erforderliche Module:
    - Microsoft.Graph
    - ImportExcel

    Version: 1.0
    Autor: Farpoint Technologies
    Erstellt: 2026-04-08
#>

#Requires -Modules Microsoft.Graph, ImportExcel

# ============================================================
# Import-EnterpriseAppOwners.ps1
# Phase 2: Read filled Excel, assign owners via Graph API
# ============================================================

param(
    [Parameter(Mandatory)]
    [string]$ExcelPath,          # Pfad zur zurueckgesendeten .xlsx

    [string]$Mode = "WhatIf"     # "WhatIf" (dry-run) | "Apply" (live)
)

# Requires ImportExcel module
Import-Module ImportExcel

Connect-MgGraph -Scopes "Application.ReadWrite.All", "Directory.ReadWrite.All"

Write-Host "`n📥 Reading: $ExcelPath" -ForegroundColor Cyan
$Data = Import-Excel -Path $ExcelPath -WorksheetName "App Owner Assignment"

$Assigned = 0; $Skipped = 0; $Errors = 0; $DryRun = ($Mode -eq "WhatIf")

if ($DryRun) { Write-Host "⚠️  DRY-RUN MODE – no changes will be made.`n" -ForegroundColor Yellow }

foreach ($Row in $Data) {
    $NewOwnerUPN = $Row."NEW Owner UPN"
    $AppObjectId = $Row.AppObjectId
    $DisplayName = $Row.DisplayName

    # Skip rows without a new owner entered
    if (-not $NewOwnerUPN -or $NewOwnerUPN.Trim() -eq "") {
        Write-Host "SKIP – '$DisplayName' (no new owner entered)" -ForegroundColor Gray
        $Skipped++
        continue
    }

    # Resolve user
    $User = Get-MgUser -Filter "userPrincipalName eq '$($NewOwnerUPN.Trim())'" -ErrorAction SilentlyContinue
    if (-not $User) {
        Write-Warning "ERROR – User '$NewOwnerUPN' not found. Skipping '$DisplayName'."
        $Errors++
        continue
    }

    if ($DryRun) {
        Write-Host "[DRY-RUN] WOULD assign '$($User.DisplayName)' → '$DisplayName'" -ForegroundColor DarkCyan
        $Assigned++
        continue
    }

    # Assign owner
    try {
        $Body = @{
            "@odata.id" = "https://graph.microsoft.com/v1.0/directoryObjects/$($User.Id)"
        }
        Invoke-MgGraphRequest -Method POST `
            -Uri "https://graph.microsoft.com/v1.0/servicePrincipals/$AppObjectId/owners/`$ref" `
            -Body ($Body | ConvertTo-Json) `
            -ContentType "application/json" `
            -ErrorAction Stop

        Write-Host "✅ ASSIGNED '$($User.DisplayName)' → '$DisplayName'" -ForegroundColor Green
        $Assigned++
    }
    catch {
        Write-Warning "ERROR assigning owner for '$DisplayName': $_"
        $Errors++
    }
}

Write-Host "`n========== SUMMARY ==========" -ForegroundColor Cyan
Write-Host "Owner assigned : $Assigned" -ForegroundColor Green
Write-Host "Skipped        : $Skipped"  -ForegroundColor Gray
Write-Host "Errors         : $Errors"   -ForegroundColor Red
Write-Host "Mode           : $Mode"
Write-Host "==============================`n"

Disconnect-MgGraph
