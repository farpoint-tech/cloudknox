#Requires -RunAsAdministrator

<#
.SYNOPSIS
    OOBE Autopilot Registration - Minimal Version
    
.DESCRIPTION
    Einfache Hardware-Registrierung mit Community Script + GroupTag "userdriven"
    
.NOTES
    Autor: Philipp Schmidt, BitHawk AG - SDA Projekt
    Version: 1.0
    Datum: August 2025
    
    Verwendung: Ausführung während OOBE (Shift+F10)
#>

# ============================================================================
# MINIMAL AUTOPILOT REGISTRATION
# ============================================================================

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  SDA Autopilot Registration (Minimal) " -ForegroundColor Cyan
Write-Host "  Philipp Schmidt, BitHawk AG          " -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

try {
    # 1. Execution Policy setzen
    Write-Host "[1/4] Setze ExecutionPolicy..." -ForegroundColor Yellow
    Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force
    
    # 2. TLS für sichere Downloads
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    
    # 3. Community Script installieren
    Write-Host "[2/4] Installiere Community Autopilot Script..." -ForegroundColor Yellow
    Install-Script -Name "get-windowsautopilotinfocommunity" -Force -Scope CurrentUser -SkipPublisherCheck
    
    # 4. Hardware registrieren mit GroupTag
    Write-Host "[3/4] Registriere Hardware mit GroupTag 'userdriven'..." -ForegroundColor Yellow
    Get-WindowsAutoPilotInfoCommunity -GroupTag "userdriven" -Online
    
    # 5. Erfolgsmeldung
    Write-Host "[4/4] Registrierung abgeschlossen!" -ForegroundColor Green
    Write-Host ""
    Write-Host "SUCCESS: Gerät erfolgreich für Autopilot registriert!" -ForegroundColor Green
    Write-Host "GroupTag: userdriven" -ForegroundColor Green
    Write-Host ""
    Write-Host "NEXT: Gerät neu starten für Autopilot-Setup" -ForegroundColor Cyan
    
} catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Fallback: Versuche Standard Microsoft Script..." -ForegroundColor Yellow
    
    try {
        Install-Script -Name "Get-WindowsAutoPilotInfo" -Force -Scope CurrentUser -SkipPublisherCheck
        Get-WindowsAutoPilotInfo -GroupTag "userdriven" -Online
        Write-Host "SUCCESS: Registrierung mit Standard Script erfolgreich!" -ForegroundColor Green
    } catch {
        Write-Host "FAILED: Auch Standard Script fehlgeschlagen: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Script beendet. Gerät kann neu gestartet werden." -ForegroundColor White
