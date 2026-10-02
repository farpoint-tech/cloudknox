<#
.SYNOPSIS
    Interactive script for owner assignment by category or globally for all Enterprise Apps.

.DESCRIPTION
    This script is Phase 3 of the owner assignment workflow and provides an interactive
    way to assign an owner directly from the command line.

    After starting, the script displays all available categories (based on the first tag
    of each Enterprise App). The user can then choose:
    - All apps at once (option 0)
    - One or multiple categories (comma-separated selection)

    Apps that already have an owner are skipped.
    Before any changes are made, the script shows the number of targeted apps
    and asks for explicit confirmation.

.EXAMPLE
    .\Assign-OwnerByCategory.ps1
    Starts the interactive mode for category-based owner assignment.

.NOTES
    Required Permissions:
    - Application.ReadWrite.All
    - Directory.ReadWrite.All

    Required Modules:
    - Microsoft.Graph

    Version: 1.1
    Author: Farpoint Technologies
    Created:  2026-04-08
    Modified: 2026-04-09 - Fix: selection input validation (negative-index bug),
                           confirmation prompt, summary counters, OData quote escaping
#>

#Requires -Modules Microsoft.Graph

# ============================================================
# Assign-OwnerByCategory.ps1
# Interactive: assign owner to ALL apps or by category/tag
# ============================================================

Connect-MgGraph -Scopes "Application.ReadWrite.All", "Directory.ReadWrite.All"

$AllSPs = Get-MgServicePrincipal -All -Property "Id,DisplayName,Tags"

# Show categories
$Categories = $AllSPs | Group-Object {
    if ($_.Tags -and $_.Tags.Count -gt 0) { $_.Tags[0] } else { "(no tag)" }
} | Sort-Object Name

Write-Host "`n📋 Available categories:" -ForegroundColor Yellow
Write-Host "  [0] ALL Apps"
for ($i = 1; $i -le $Categories.Count; $i++) {
    Write-Host "  [$i] $($Categories[$i-1].Name) ($($Categories[$i-1].Count) apps)"
}

$Selection = Read-Host "`nEnter number (0 = all, or multiple e.g. 1,3)"
$DefaultOwnerUPN = Read-Host "Enter owner UPN to assign"

# Escape single quotes to keep the OData filter intact
$SafeUPN = $DefaultOwnerUPN.Trim().Replace("'", "''")
$Owner = Get-MgUser -Filter "userPrincipalName eq '$SafeUPN'"
if (-not $Owner) { Write-Error "User not found."; exit 1 }

# Filter apps based on selection (validated: numeric, in range, no mixing of 0 with categories)
if ($Selection.Trim() -eq "0") {
    $TargetSPs = $AllSPs
} else {
    $SelectedIndices = @()
    foreach ($Token in ($Selection -split ",")) {
        $Trimmed = $Token.Trim()
        if ($Trimmed -notmatch '^\d+$') {
            Write-Error "Invalid selection '$Trimmed'. Enter numbers only (e.g. 1,3)."
            Disconnect-MgGraph
            exit 1
        }
        $Number = [int]$Trimmed
        if ($Number -lt 1 -or $Number -gt $Categories.Count) {
            Write-Error "Selection '$Number' is out of range (1-$($Categories.Count)). Use 0 on its own to target all apps."
            Disconnect-MgGraph
            exit 1
        }
        $SelectedIndices += ($Number - 1)
    }
    $SelectedCategories = $SelectedIndices | ForEach-Object { $Categories[$_].Name }
    $TargetSPs = $AllSPs | Where-Object {
        $cat = if ($_.Tags -and $_.Tags.Count -gt 0) { $_.Tags[0] } else { "(no tag)" }
        $SelectedCategories -contains $cat
    }
}

# Confirmation before any changes are made
Write-Host "`n🎯 Targeting $($TargetSPs.Count) apps. Assigning owner: $DefaultOwnerUPN" -ForegroundColor Yellow
$Confirm = Read-Host "Type 'yes' to continue"
if ($Confirm -ne "yes") {
    Write-Host "Aborted – no changes were made." -ForegroundColor Gray
    Disconnect-MgGraph
    exit 0
}
Write-Host ""

$Assigned = 0; $Skipped = 0; $Errors = 0

foreach ($SP in $TargetSPs) {
    $existing = Get-MgServicePrincipalOwner -ServicePrincipalId $SP.Id -ErrorAction SilentlyContinue
    if ($existing.Count -gt 0) {
        Write-Host "SKIP (has owner) – $($SP.DisplayName)" -ForegroundColor Gray
        $Skipped++
        continue
    }
    try {
        $Body = @{ "@odata.id" = "https://graph.microsoft.com/v1.0/directoryObjects/$($Owner.Id)" }
        Invoke-MgGraphRequest -Method POST `
            -Uri "https://graph.microsoft.com/v1.0/servicePrincipals/$($SP.Id)/owners/`$ref" `
            -Body ($Body | ConvertTo-Json) -ContentType "application/json" -ErrorAction Stop
        Write-Host "✅ ASSIGNED – $($SP.DisplayName)" -ForegroundColor Green
        $Assigned++
    } catch {
        Write-Warning "ERROR – $($SP.DisplayName): $_"
        $Errors++
    }
}

Write-Host "`n========== SUMMARY ==========" -ForegroundColor Cyan
Write-Host "Owner assigned : $Assigned" -ForegroundColor Green
Write-Host "Skipped        : $Skipped"  -ForegroundColor Gray
Write-Host "Errors         : $Errors"   -ForegroundColor Red
Write-Host "==============================`n"

Disconnect-MgGraph
