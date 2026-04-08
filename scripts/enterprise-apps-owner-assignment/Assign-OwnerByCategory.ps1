<#
.SYNOPSIS
    Interaktives Script zur Owner-Zuweisung nach Kategorie oder global fuer alle Enterprise Apps.

.DESCRIPTION
    Dieses Script ist Phase 3 des Owner-Assignment-Workflows und bietet eine interaktive
    Moeglichkeit, einen Owner direkt per Kommandozeile zuzuweisen.

    Nach dem Start zeigt das Script alle verfuegbaren Kategorien (basierend auf dem ersten Tag
    der jeweiligen Enterprise App) an. Der Benutzer kann dann waehlen:
    - Alle Apps auf einmal (Option 0)
    - Einzelne oder mehrere Kategorien (kommagetrennte Auswahl)

    Apps die bereits einen Owner besitzen, werden uebersprungen.

.EXAMPLE
    .\Assign-OwnerByCategory.ps1
    Startet den interaktiven Modus zur Kategorie-basierten Owner-Zuweisung.

.NOTES
    Erforderliche Berechtigungen:
    - Application.ReadWrite.All
    - Directory.ReadWrite.All

    Erforderliche Module:
    - Microsoft.Graph

    Version: 1.0
    Autor: Farpoint Technologies
    Erstellt: 2026-04-08
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

$Owner = Get-MgUser -Filter "userPrincipalName eq '$DefaultOwnerUPN'"
if (-not $Owner) { Write-Error "User not found."; exit 1 }

# Filter apps based on selection
if ($Selection -eq "0") {
    $TargetSPs = $AllSPs
} else {
    $SelectedIndices = $Selection -split "," | ForEach-Object { [int]$_.Trim() - 1 }
    $SelectedCategories = $SelectedIndices | ForEach-Object { $Categories[$_].Name }
    $TargetSPs = $AllSPs | Where-Object {
        $cat = if ($_.Tags -and $_.Tags.Count -gt 0) { $_.Tags[0] } else { "(no tag)" }
        $SelectedCategories -contains $cat
    }
}

Write-Host "`n🎯 Targeting $($TargetSPs.Count) apps. Assigning owner: $DefaultOwnerUPN`n"

foreach ($SP in $TargetSPs) {
    $existing = Get-MgServicePrincipalOwner -ServicePrincipalId $SP.Id -ErrorAction SilentlyContinue
    if ($existing.Count -gt 0) {
        Write-Host "SKIP (has owner) – $($SP.DisplayName)" -ForegroundColor Gray
        continue
    }
    try {
        $Body = @{ "@odata.id" = "https://graph.microsoft.com/v1.0/directoryObjects/$($Owner.Id)" }
        Invoke-MgGraphRequest -Method POST `
            -Uri "https://graph.microsoft.com/v1.0/servicePrincipals/$($SP.Id)/owners/`$ref" `
            -Body ($Body | ConvertTo-Json) -ContentType "application/json" -ErrorAction Stop
        Write-Host "✅ ASSIGNED – $($SP.DisplayName)" -ForegroundColor Green
    } catch {
        Write-Warning "ERROR – $($SP.DisplayName): $_"
    }
}

Disconnect-MgGraph
