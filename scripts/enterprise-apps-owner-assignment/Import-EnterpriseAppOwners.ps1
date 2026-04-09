<#
.SYNOPSIS
    Reads a filled Excel file and assigns the entered owners to the corresponding Enterprise Apps.

.DESCRIPTION
    This script is Phase 2 of the owner assignment workflow. It reads the Excel file
    filled in by the departments (originally exported by Export-EnterpriseAppOwnerList.ps1)
    and assigns the users entered in the "NEW Owner UPN" column as owners of the
    respective Enterprise Application (Service Principal).

    The script supports two modes:
    - WhatIf (default): Shows which assignments would be made, without actually applying changes
    - Apply: Actually performs the owner assignments

.PARAMETER ExcelPath
    Path to the filled Excel file (.xlsx). Must contain a worksheet named "App Owner Assignment".

.PARAMETER Mode
    Execution mode: "WhatIf" for dry-run (default) or "Apply" for live execution.

.EXAMPLE
    .\Import-EnterpriseAppOwners.ps1 -ExcelPath ".\EnterpriseApp_OwnerAssignment_20260408.xlsx"
    Performs a dry-run and shows all planned assignments.

.EXAMPLE
    .\Import-EnterpriseAppOwners.ps1 -ExcelPath ".\EnterpriseApp_OwnerAssignment_20260408.xlsx" -Mode Apply
    Actually performs the owner assignments.

.NOTES
    Required Permissions:
    - Application.ReadWrite.All
    - Directory.ReadWrite.All

    Required Modules:
    - Microsoft.Graph
    - ImportExcel

    Version: 1.0
    Author: Farpoint Technologies
    Created: 2026-04-08
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
