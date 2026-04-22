#Requires -RunAsAdministrator

<#
.SYNOPSIS
    OOBE Autopilot Registration - Minimal Version

.DESCRIPTION
    Simple hardware registration using community script with GroupTag "userdriven".

.NOTES
    Author: Philipp Schmidt - Farpoint Technologies
    Version: 1.0
    Date: August 2025

    Usage: Run during OOBE (Shift+F10)
#>

# ============================================================================
# MINIMAL AUTOPILOT REGISTRATION
# ============================================================================

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  Autopilot Registration (Minimal)     " -ForegroundColor Cyan
Write-Host "  Philipp Schmidt - Farpoint Technologies" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

try {
    # 1. Set execution policy
    Write-Host "[1/4] Setting ExecutionPolicy..." -ForegroundColor Yellow
    Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

    # 2. TLS for secure downloads
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    # 3. Install community script
    Write-Host "[2/4] Installing community Autopilot script..." -ForegroundColor Yellow
    Install-Script -Name "get-windowsautopilotinfocommunity" -Force -Scope CurrentUser -SkipPublisherCheck

    # 4. Register hardware with GroupTag
    Write-Host "[3/4] Registering hardware with GroupTag 'userdriven'..." -ForegroundColor Yellow
    Get-WindowsAutoPilotInfoCommunity -GroupTag "userdriven" -Online

    # 5. Success message
    Write-Host "[4/4] Registration completed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "SUCCESS: Device successfully registered for Autopilot!" -ForegroundColor Green
    Write-Host "GroupTag: userdriven" -ForegroundColor Green
    Write-Host ""
    Write-Host "NEXT: Restart the device for Autopilot setup" -ForegroundColor Cyan

} catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Fallback: Attempting standard Microsoft script..." -ForegroundColor Yellow

    try {
        Install-Script -Name "Get-WindowsAutoPilotInfo" -Force -Scope CurrentUser -SkipPublisherCheck
        Get-WindowsAutoPilotInfo -GroupTag "userdriven" -Online
        Write-Host "SUCCESS: Registration with standard script successful!" -ForegroundColor Green
    } catch {
        Write-Host "FAILED: Standard script also failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Script complete. Device can now be restarted." -ForegroundColor White
