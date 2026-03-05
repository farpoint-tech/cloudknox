<#
.SYNOPSIS
    Setzt Group Tags für Windows Autopilot Geräte ohne bestehende Tags

.DESCRIPTION
    Dieses Script verbindet sich mit Microsoft Graph API und setzt Group Tags
    für alle Autopilot-Geräte die noch keinen Tag haben.

    Group Tags werden in Intune für die automatische Zuweisung von
    Deployment-Profilen verwendet.

    Unterstützt Umgebungen mit mehr als 1000 Geräten durch vollständige
    Pagination (Verarbeitung aller Seiten via @odata.nextLink).
    Schreibt ein persistentes Log-File und exportiert Ergebnisse als CSV.

.PARAMETER GroupTag
    Der Group Tag der gesetzt werden soll (z.B. "userdriven", "selfenrollment")

.PARAMETER Test
    Führt einen Test-Lauf durch ohne echte Änderungen

.PARAMETER LogPath
    Pfad für das Log-File (Standard: .\Logs\AutopilotGroupTag_<Datum>.log)

.PARAMETER ExportCsv
    Pfad für den CSV-Export der Ergebnisse (Standard: .\Logs\AutopilotGroupTag_<Datum>.csv)

.EXAMPLE
    .\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1 -Test
    Zeigt welche Geräte einen Tag bekommen würden

.EXAMPLE
    .\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1 -GroupTag "userdriven"
    Setzt den Tag "userdriven" für alle Geräte ohne Tag

.EXAMPLE
    .\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1 -GroupTag "selfenrollment" -LogPath "C:\Logs\autopilot.log"
    Setzt Tag und schreibt Log in angegebenen Pfad

.NOTES
    Benötigt:
    - Microsoft.Graph.Authentication PowerShell Modul
    - Intune Administrator oder Global Administrator Berechtigung
    - Internet-Verbindung für Graph API

    Änderungen werden in Intune nach 5-15 Minuten sichtbar.

    Version: 2.0
    Erstellt: 2024
    Aktualisiert: 2026-03-05 - Pagination, File-Logging, CSV-Export
#>

param(
    [Parameter(HelpMessage="Group Tag der gesetzt werden soll")]
    [string]$GroupTag,

    [Parameter(HelpMessage="Test-Modus ohne echte Änderungen")]
    [switch]$Test,

    [Parameter(HelpMessage="Pfad für das Log-File")]
    [string]$LogPath,

    [Parameter(HelpMessage="Pfad für den CSV-Export")]
    [string]$ExportCsv
)

#Requires -Modules Microsoft.Graph.Authentication

# ===== LOG-VERZEICHNIS VORBEREITEN =====
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logDir = Join-Path $PSScriptRoot "Logs"

if (-not (Test-Path $logDir)) {
    New-Item -Path $logDir -ItemType Directory -Force | Out-Null
}

if (-not $LogPath) {
    $LogPath = Join-Path $logDir "AutopilotGroupTag_$timestamp.log"
}
if (-not $ExportCsv) {
    $ExportCsv = Join-Path $logDir "AutopilotGroupTag_$timestamp.csv"
}

# ===== LOGGING-FUNKTION =====
function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("INFO", "WARN", "ERROR", "SUCCESS")]
        [string]$Level = "INFO"
    )
    $entry = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Message"
    Add-Content -Path $LogPath -Value $entry -Encoding UTF8

    $color = switch ($Level) {
        "SUCCESS" { "Green" }
        "WARN"    { "Yellow" }
        "ERROR"   { "Red" }
        default   { "Cyan" }
    }
    Write-Host $entry -ForegroundColor $color
}

# ===== SCRIPT START =====
Write-Host "=== AUTOPILOT GROUP TAG SETZER ===" -ForegroundColor White -BackgroundColor Blue
Write-Host "Setzt Group Tags für Autopilot-Geräte ohne bestehende Tags`n" -ForegroundColor Cyan
Write-Log "Script gestartet | Test-Modus: $($Test.IsPresent) | LogFile: $LogPath"

# Graph API Verbindung herstellen
Write-Log "Verbinde mit Microsoft Graph..."
try {
    Import-Module Microsoft.Graph.Authentication -Force

    $requiredScopes = @(
        "DeviceManagementServiceConfig.ReadWrite.All"
    )

    Connect-MgGraph -Scopes $requiredScopes -NoWelcome

    $context = Get-MgContext
    Write-Log "Verbunden als: $($context.Account) | Tenant: $($context.TenantId)" "SUCCESS"
}
catch {
    Write-Log "FEHLER bei Graph-Verbindung: $($_.Exception.Message)" "ERROR"
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

    Write-Log "Gewählter Group Tag: '$GroupTag'" "SUCCESS"
} else {
    Write-Log "Group Tag via Parameter: '$GroupTag'"
}

# ===== ALLE GERÄTE MIT PAGINATION LADEN =====
Write-Host "`n=== GERÄTE LADEN ===" -ForegroundColor White -BackgroundColor DarkGreen
Write-Log "Lade alle Windows Autopilot Geräte (mit Pagination)..."

$allDevices = [System.Collections.Generic.List[object]]::new()

try {
    $nextUri = "https://graph.microsoft.com/v1.0/deviceManagement/windowsAutopilotDeviceIdentities"
    $pageNumber = 0

    while ($nextUri) {
        $pageNumber++
        Write-Log "Lade Seite $pageNumber ($($allDevices.Count) Geräte bisher)..."

        $response = Invoke-MgGraphRequest -Method GET -Uri $nextUri

        if ($response.value) {
            foreach ($device in $response.value) {
                $allDevices.Add($device)
            }
        }

        # Nächste Seite prüfen
        $nextUri = if ($response.'@odata.nextLink') { $response.'@odata.nextLink' } else { $null }
    }

    if ($allDevices.Count -eq 0) {
        Write-Log "Keine Autopilot-Geräte gefunden." "WARN"
        Write-Host "Sind Geräte in Autopilot registriert?" -ForegroundColor Yellow
        exit 1
    }

    Write-Log "$($allDevices.Count) Autopilot-Geräte auf $pageNumber Seite(n) gefunden." "SUCCESS"
}
catch {
    Write-Log "FEHLER beim Laden der Geräte: $($_.Exception.Message)" "ERROR"
    exit 1
}

# Geräte ohne Group Tag filtern
$devicesWithoutTag = $allDevices | Where-Object { [string]::IsNullOrEmpty($_.groupTag) }
$devicesWithTag    = $allDevices | Where-Object { -not [string]::IsNullOrEmpty($_.groupTag) }

# Übersicht anzeigen
Write-Host "`n=== GERÄTE-ÜBERSICHT ===" -ForegroundColor White -BackgroundColor DarkGreen
Write-Log "Gesamt: $($allDevices.Count) | Mit Tag: $($devicesWithTag.Count) | Ohne Tag: $($devicesWithoutTag.Count)"
Write-Host "Gesamt Geräte:  $($allDevices.Count)"
Write-Host "Mit Group Tag:  $($devicesWithTag.Count)" -ForegroundColor Green
Write-Host "Ohne Group Tag: $($devicesWithoutTag.Count)" -ForegroundColor $(if ($devicesWithoutTag.Count -gt 0) { "Yellow" } else { "Green" })

if ($devicesWithoutTag.Count -eq 0) {
    Write-Log "Alle Geräte haben bereits Group Tags. Keine Aktion erforderlich." "SUCCESS"
    Write-Host "`n✓ Alle Geräte haben bereits Group Tags!" -ForegroundColor Green
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
        Write-Log "Vorgang vom Benutzer abgebrochen." "WARN"
        Write-Host "✓ Vorgang abgebrochen." -ForegroundColor Cyan
        exit 0
    }
    Write-Log "Benutzer hat Änderungen bestätigt."
}

# ===== GROUP TAGS SETZEN =====
Write-Host "`n=== GROUP TAGS SETZEN ===" -ForegroundColor White -BackgroundColor DarkGreen
if ($Test) {
    Write-Log "TEST-MODUS aktiv: keine echten Änderungen." "WARN"
    Write-Host "🧪 TEST-MODUS: Keine echten Änderungen!" -ForegroundColor Magenta
} else {
    Write-Log "Starte Zuweisung von Group Tag '$GroupTag'..."
    Write-Host "⚙️  Setze Group Tags..." -ForegroundColor Yellow
}

$successCount = 0
$errorCount   = 0
$csvResults   = [System.Collections.Generic.List[object]]::new()

foreach ($device in $devicesWithoutTag) {
    $serialNumber = $device.serialNumber
    $model        = $device.model

    if ($Test) {
        Write-Log "TEST: $serialNumber ($model) → '$GroupTag'"
        Write-Host "TEST: $serialNumber → '$GroupTag'" -ForegroundColor Magenta
        $successCount++
        $csvResults.Add([PSCustomObject]@{
            SerialNumber = $serialNumber
            Model        = $model
            GroupTag     = $GroupTag
            Status       = "TEST"
            Timestamp    = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            ErrorMessage = ""
        })
        continue
    }

    try {
        $updateUri   = "https://graph.microsoft.com/beta/deviceManagement/windowsAutopilotDeviceIdentities/$($device.id)/updateDeviceProperties"
        $requestBody = @{ groupTag = $GroupTag } | ConvertTo-Json

        Invoke-MgGraphRequest -Method POST -Uri $updateUri -Body $requestBody -ContentType "application/json"

        Write-Log "OK: $serialNumber ($model) → '$GroupTag'" "SUCCESS"
        Write-Host "✓ $serialNumber → '$GroupTag'" -ForegroundColor Green
        $successCount++

        $csvResults.Add([PSCustomObject]@{
            SerialNumber = $serialNumber
            Model        = $model
            GroupTag     = $GroupTag
            Status       = "Erfolg"
            Timestamp    = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            ErrorMessage = ""
        })

        Start-Sleep -Milliseconds 500
    }
    catch {
        $errMsg = $_.Exception.Message
        Write-Log "FEHLER: $serialNumber - $errMsg" "ERROR"
        Write-Host "✗ FEHLER: $serialNumber" -ForegroundColor Red
        Write-Host "  Grund: $errMsg" -ForegroundColor Yellow
        $errorCount++

        $csvResults.Add([PSCustomObject]@{
            SerialNumber = $serialNumber
            Model        = $model
            GroupTag     = $GroupTag
            Status       = "Fehler"
            Timestamp    = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            ErrorMessage = $errMsg
        })
    }
}

# ===== CSV-EXPORT =====
try {
    $csvResults | Export-Csv -Path $ExportCsv -NoTypeInformation -Encoding UTF8
    Write-Log "CSV-Ergebnisse exportiert: $ExportCsv" "SUCCESS"
    Write-Host "`n📄 Ergebnisse exportiert nach: $ExportCsv" -ForegroundColor Cyan
} catch {
    Write-Log "Fehler beim CSV-Export: $($_.Exception.Message)" "WARN"
}

# ===== ERGEBNIS-ZUSAMMENFASSUNG =====
Write-Host "`n=== ERGEBNIS ===" -ForegroundColor White -BackgroundColor Blue
Write-Log "Zusammenfassung: Erfolgreich=$successCount | Fehler=$errorCount | Tag='$GroupTag'"
Write-Host "✓ Erfolgreich: $successCount Geräte" -ForegroundColor Green
if ($errorCount -gt 0) {
    Write-Host "✗ Fehler: $errorCount Geräte" -ForegroundColor Red
}
Write-Host "📋 Group Tag: '$GroupTag'" -ForegroundColor Cyan
Write-Host "📁 Log-File:  $LogPath" -ForegroundColor Gray
Write-Host "📄 CSV-Export: $ExportCsv" -ForegroundColor Gray

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
Write-Log "Script beendet."

# ===== SCRIPT ENDE =====
