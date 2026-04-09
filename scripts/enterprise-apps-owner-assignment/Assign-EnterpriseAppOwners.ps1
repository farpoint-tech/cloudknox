<#
.SYNOPSIS
    Assigns a defined default owner to all Enterprise Apps without an owner.

.DESCRIPTION
    This script connects to the tenant via Microsoft Graph API and checks all
    Service Principals (Enterprise Applications) for existing owners.

    For each app without an owner, the user configured in $DefaultOwnerUPN is
    automatically assigned as owner. Apps that already have at least one owner
    are skipped.

    At the end, a summary is displayed with the number of assigned, skipped,
    and failed apps.

.EXAMPLE
    .\Assign-EnterpriseAppOwners.ps1
    Assigns the configured default owner to all Enterprise Apps without an owner.

.NOTES
    Required Permissions:
    - Application.Read.All
    - Directory.ReadWrite.All

    Required Modules:
    - Microsoft.Graph

    Configuration:
    - Adjust $DefaultOwnerUPN in the script to the desired owner

    Version: 1.0
    Author: Farpoint Technologies
    Created: 2026-04-08
#>

#Requires -Modules Microsoft.Graph

# ============================================================
# Assign-EnterpriseAppOwners.ps1
# Assigns a default owner to all Enterprise Apps with no owner
# Requires: Microsoft.Graph PowerShell SDK
# Permissions: Application.Read.All, AppRoleAssignment.ReadWrite.All,
#              Directory.ReadWrite.All (or via delegated with admin consent)
# ============================================================

# --- CONFIGURATION ---
$DefaultOwnerUPN = "admin@yourdomain.com"  # <-- Owner UPN hier anpassen

# --- CONNECT ---
Connect-MgGraph -Scopes "Application.Read.All", "Directory.ReadWrite.All"

# --- GET OWNER OBJECT ID ---
$OwnerUser = Get-MgUser -Filter "userPrincipalName eq '$DefaultOwnerUPN'"
if (-not $OwnerUser) {
    Write-Error "User '$DefaultOwnerUPN' not found. Exiting."
    exit 1
}
$OwnerObjectId = $OwnerUser.Id
Write-Host "✅ Owner resolved: $($OwnerUser.DisplayName) [$OwnerObjectId]" -ForegroundColor Green

# --- GET ALL SERVICE PRINCIPALS (Enterprise Apps) ---
Write-Host "`n🔍 Fetching all Enterprise Applications..." -ForegroundColor Cyan
$AllSPs = Get-MgServicePrincipal -All -Property "Id,DisplayName,ServicePrincipalType"

$Counter   = 0
$Skipped   = 0
$Assigned  = 0
$Errors    = 0

foreach ($SP in $AllSPs) {
    $Counter++

    # Get current owners
    try {
        $Owners = Get-MgServicePrincipalOwner -ServicePrincipalId $SP.Id -ErrorAction Stop
    }
    catch {
        Write-Warning "[$Counter] Could not retrieve owners for '$($SP.DisplayName)': $_"
        $Errors++
        continue
    }

    # Skip if already has owner
    if ($Owners.Count -gt 0) {
        Write-Host "[$Counter] SKIP – '$($SP.DisplayName)' already has $($Owners.Count) owner(s)." -ForegroundColor Gray
        $Skipped++
        continue
    }

    # Assign owner
    try {
        $Body = @{
            "@odata.id" = "https://graph.microsoft.com/v1.0/directoryObjects/$OwnerObjectId"
        }
        Invoke-MgGraphRequest -Method POST `
            -Uri "https://graph.microsoft.com/v1.0/servicePrincipals/$($SP.Id)/owners/`$ref" `
            -Body ($Body | ConvertTo-Json) `
            -ContentType "application/json" `
            -ErrorAction Stop

        Write-Host "[$Counter] ASSIGNED – '$($SP.DisplayName)'" -ForegroundColor Green
        $Assigned++
    }
    catch {
        Write-Warning "[$Counter] ERROR assigning owner to '$($SP.DisplayName)': $_"
        $Errors++
    }
}

# --- SUMMARY ---
Write-Host "`n========== SUMMARY ==========" -ForegroundColor Cyan
Write-Host "Total Apps processed : $Counter"
Write-Host "Owner assigned       : $Assigned" -ForegroundColor Green
Write-Host "Already had owner    : $Skipped"  -ForegroundColor Gray
Write-Host "Errors               : $Errors"   -ForegroundColor Red
Write-Host "==============================`n"

Disconnect-MgGraph
