<#
.SYNOPSIS
    Setzt Group Tags für Windows Autopilot Geräte ohne bestehende Tags

.DESCRIPTION
    Dieses Script verbindet sich mit Microsoft Graph API und setzt Group Tags
    für alle Autopilot-Geräte die noch keinen Tag haben.
    
    Group Tags werden in Intune für die automatische Zuweisung von 
    Deployment-Profilen verwendet.

.PARAMETER GroupTag
    Der Group Tag der gesetzt werden soll (z.B. "userdriven", "selfenrollment")

.PARAMETER Test
    Führt einen Test-Lauf durch ohne echte Änderungen

.EXAMPLE
    .\Autopilot-GroupTag-Setzer.ps1 -Test
    Zeigt welche Geräte einen Tag bekommen würden

.EXAMPLE
    .\Autopilot-GroupTag-Setzer.ps1 -GroupTag "userdriven"
    Setzt den Tag "userdriven" für alle Geräte ohne Tag

.NOTES
    Benötigt:
    - Microsoft.Graph.Authentication PowerShell Modul
    - Intune Administrator oder Global Administrator Berechtigung
    - Internet-Verbindung für Graph API
    
    Änderungen werden in Intune nach 5-15 Minuten sichtbar.
    
    Version: 1.0
    Erstellt: 2024
#>

param(
    [Parameter(HelpMessage="Group Tag der gesetzt werden soll")]
    [string]$GroupTag,
    
    [Parameter(HelpMessage="Test-Modus ohne echte Änderungen")]
    [switch]$Test
)

#Requires -Modules Microsoft.Graph.Authentication

# ===== SCRIPT START =====
Write-Host "=== AUTOPILOT GROUP TAG SETZER ===" -ForegroundColor White -BackgroundColor Blue
Write-Host "Setzt Group Tags für Autopilot-Geräte ohne bestehende Tags`n" -ForegroundColor Cyan

# Graph API Verbindung herstellen
Write-Host "Verbinde mit Microsoft Graph..." -ForegroundColor Yellow
try {
    Import-Module Microsoft.Graph.Authentication -Force
    
    # Benötigte Berechtigungen für Autopilot-Verwaltung
    $requiredScopes = @(
        "DeviceManagementServiceConfig.ReadWrite.All"
    )
    
    Connect-MgGraph -Scopes $requiredScopes -NoWelcome
    
    $context = Get-MgContext
    Write-Host "✓ Verbunden als: $($context.Account)" -ForegroundColor Green
    Write-Host "✓ Tenant: $($context.TenantId)" -ForegroundColor Green
}
catch {
    Write-Host "✗ FEHLER bei Graph-Verbindung!" -ForegroundColor Red
    Write-Host "Stelle sicher dass du Intune Administrator Rechte hast." -ForegroundColor Yellow
    exit 1
}

# Group Tag Parameter bestimmen
if (-not $GroupTag) {
    Write-Host "`n=== GROUP TAG AUSWAHL ===" -ForegroundColor White -BackgroundColor DarkGreen
    Write-Host "Verfügbare Standard-Tags:"
    Write-Host "1 = userdriven    (Für User-Driven Autopilot)"
    Write-Host "2 = selfenrollment (Für Self-Deployment)"
    Write-Host "3 = Eigener Tag eingeben"
    
    do {
        $wahl = Read-Host "`nDeine Wahl (1, 2 oder 3)"
    } while ($wahl -notin @("1", "2", "3"))
    
    switch ($wahl) {
        "1" { $GroupTag = "userdriven" }
        "2" { $GroupTag = "selfenrollment" }
        "3" { 
            do {
                $GroupTag = Read-Host "Gib deinen Group Tag ein"
            } while ([string]::IsNullOrWhiteSpace($GroupTag))
        }
    }
    
    Write-Host "✓ Gewählter Group Tag: '$GroupTag'" -ForegroundColor Green
}

# Alle Autopilot-Geräte laden
Write-Host "`n=== GERÄTE LADEN ===" -ForegroundColor White -BackgroundColor DarkGreen
Write-Host "Lade alle Windows Autopilot Geräte..." -ForegroundColor Yellow

try {
    # Graph API Aufruf für alle Autopilot-Geräte
    $response = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/deviceManagement/windowsAutopilotDeviceIdentities"
    $allDevices = $response.value
    
    if (-not $allDevices -or $allDevices.Count -eq 0) {
        Write-Host "✗ Keine Autopilot-Geräte gefunden!" -ForegroundColor Red
        Write-Host "Sind Geräte in Autopilot registriert?" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "✓ $($allDevices.Count) Autopilot-Geräte gefunden" -ForegroundColor Green
}
catch {
    Write-Host "✗ FEHLER beim Laden der Geräte!" -ForegroundColor Red
    Write-Host "Fehler: $($_.Exception.Message)" -ForegroundColor Yellow
    exit 1
}

# Geräte ohne Group Tag filtern
$devicesWithoutTag = $allDevices | Where-Object { [string]::IsNullOrEmpty($_.groupTag) }
$devicesWithTag = $allDevices | Where-Object { -not [string]::IsNullOrEmpty($_.groupTag) }

# Übersicht anzeigen
Write-Host "`n=== GERÄTE-ÜBERSICHT ===" -ForegroundColor White -BackgroundColor DarkGreen
Write-Host "Gesamt Geräte: $($allDevices.Count)"
Write-Host "Mit Group Tag: $($devicesWithTag.Count)" -ForegroundColor Green
Write-Host "Ohne Group Tag: $($devicesWithoutTag.Count)" -ForegroundColor $(if ($devicesWithoutTag.Count -gt 0) { "Yellow" } else { "Green" })

# Wenn keine Geräte ohne Tag vorhanden
if ($devicesWithoutTag.Count -eq 0) {
    Write-Host "`n✓ Alle Geräte haben bereits Group Tags!" -ForegroundColor Green
    Write-Host "Keine Aktion erforderlich." -ForegroundColor Cyan
    exit 0
}

# Geräte ohne Tag auflisten
Write-Host "`nGeräte OHNE Group Tag:" -ForegroundColor Yellow
foreach ($device in $devicesWithoutTag) {
    Write-Host "  • $($device.serialNumber) - $($device.model)" -ForegroundColor Gray
}

# Bestätigung für echte Änderungen
if (-not $Test) {
    Write-Host "`n=== BESTÄTIGUNG ERFORDERLICH ===" -ForegroundColor White -BackgroundColor Red
    Write-Host "⚠️  ACHTUNG: Echte Änderungen werden durchgeführt!" -ForegroundColor Red
    Write-Host "Group Tag '$GroupTag' wird für $($devicesWithoutTag.Count) Geräte gesetzt." -ForegroundColor Yellow
    
    do {
        $confirmation = Read-Host "`nFortfahren? Schreibe 'JA' zum Bestätigen oder 'NEIN' zum Abbrechen"
        $confirmation = $confirmation.ToUpper()
    } while ($confirmation -notin @("JA", "NEIN"))
    
    if ($confirmation -eq "NEIN") {
        Write-Host "✓ Vorgang abgebrochen." -ForegroundColor Cyan
        exit 0
    }
}

# Group Tags setzen
Write-Host "`n=== GROUP TAGS SETZEN ===" -ForegroundColor White -BackgroundColor DarkGreen
if ($Test) {
    Write-Host "🧪 TEST-MODUS: Keine echten Änderungen!" -ForegroundColor Magenta
} else {
    Write-Host "⚙️  Setze Group Tags..." -ForegroundColor Yellow
}

$successCount = 0
$errorCount = 0

foreach ($device in $devicesWithoutTag) {
    $serialNumber = $device.serialNumber
    
    if ($Test) {
        # Test-Modus: Nur anzeigen was passieren würde
        Write-Host "TEST: $serialNumber → '$GroupTag'" -ForegroundColor Magenta
        $successCount++
        continue
    }
    
    try {
        # Graph API Aufruf zum Setzen des Group Tags
        # Verwendet den speziellen updateDeviceProperties Endpoint
        $updateUri = "https://graph.microsoft.com/beta/deviceManagement/windowsAutopilotDeviceIdentities/$($device.id)/updateDeviceProperties"
        $requestBody = @{ 
            groupTag = $GroupTag 
        } | ConvertTo-Json
        
        # API-Aufruf durchführen
        Invoke-MgGraphRequest -Method POST -Uri $updateUri -Body $requestBody -ContentType "application/json"
        
        Write-Host "✓ $serialNumber → '$GroupTag'" -ForegroundColor Green
        $successCount++
        
        # Kurze Pause um API nicht zu überlasten
        Start-Sleep -Milliseconds 500
    }
    catch {
        Write-Host "✗ FEHLER: $serialNumber" -ForegroundColor Red
        Write-Host "  Grund: $($_.Exception.Message)" -ForegroundColor Yellow
        $errorCount++
    }
}

# Ergebnis-Zusammenfassung
Write-Host "`n=== ERGEBNIS ===" -ForegroundColor White -BackgroundColor Blue
Write-Host "✓ Erfolgreich: $successCount Geräte" -ForegroundColor Green
if ($errorCount -gt 0) {
    Write-Host "✗ Fehler: $errorCount Geräte" -ForegroundColor Red
}
Write-Host "📋 Group Tag: '$GroupTag'" -ForegroundColor Cyan

if ($Test) {
    Write-Host "`n🧪 Das war nur ein TEST!" -ForegroundColor Magenta
    Write-Host "Für echte Änderungen das Script ohne -Test Parameter starten." -ForegroundColor Yellow
} elseif ($successCount -gt 0) {
    Write-Host "`n⏰ Wichtiger Hinweis:" -ForegroundColor Yellow
    Write-Host "Group Tags werden in Intune nach 5-15 Minuten sichtbar." -ForegroundColor Cyan
    Write-Host "Prüfe später im Intune Portal unter:" -ForegroundColor Gray
    Write-Host "Devices → Windows → Windows enrollment → Devices" -ForegroundColor Gray
}

Write-Host "`n🎉 Script abgeschlossen!" -ForegroundColor Green

# ===== SCRIPT ENDE =====
