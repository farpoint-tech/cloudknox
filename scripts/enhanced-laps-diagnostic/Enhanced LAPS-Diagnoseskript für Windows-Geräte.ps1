<#
.SYNOPSIS
    Enhanced LAPS-Diagnoseskript für Windows-Geräte
.DESCRIPTION
    Dieses Skript prüft, ob Microsoft LAPS korrekt funktioniert. Es führt folgende Diagnoseschritte aus:
    1. Administrator-Berechtigung prüfen
    2. LAPS-Modul laden und prüfen
    3. Azure AD-Status (dsregcmd)
    4. Netzwerk-Konnektivität
    5. PowerShell Execution Policy
    6. LAPS-Diagnose (Get-LapsDiagnostics)
    7. Eventlog-Auswertung (LAPS Operational Log)
    8. Uhrzeit-Synchronisation
    9. Ausgabe in eine Textdatei
.AUTHOR
    Philipp Schmidt (Enhanced Version)
.NOTES
    Requires Administrator privileges and LAPS PowerShell module
#>

#Requires -RunAsAdministrator

# Setze den Pfad für die Ausgabedatei (mit Fallback-Optionen)
$PossiblePaths = @(
    "$env:USERPROFILE\Desktop\LAPS_Diagnosebericht_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt",
    "$env:USERPROFILE\Documents\LAPS_Diagnosebericht_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt",
    "$env:TEMP\LAPS_Diagnosebericht_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt",
    "C:\Temp\LAPS_Diagnosebericht_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
)

$OutputPath = $null
foreach ($Path in $PossiblePaths) {
    $Directory = Split-Path $Path -Parent
    if (Test-Path $Directory) {
        $OutputPath = $Path
        break
    } elseif ($Directory -eq "C:\Temp") {
        # Erstelle C:\Temp falls es nicht existiert
        try {
            New-Item -Path "C:\Temp" -ItemType Directory -Force -ErrorAction Stop | Out-Null
            $OutputPath = $Path
            break
        } catch {
            continue
        }
    }
}

if (-not $OutputPath) {
    # Letzter Fallback: Aktuelles Verzeichnis
    $OutputPath = ".\LAPS_Diagnosebericht_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
}

# Funktion für formatierte Ausgabe mit verbessertem Error Handling
function Write-DiagnosticOutput {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $output = "[$timestamp] [$Level] $Message"
    Write-Host $output
    
    # Versuche in Datei zu schreiben, aber versage nicht wenn es nicht geht
    try {
        $output | Out-File -FilePath $OutputPath -Append -ErrorAction Stop
    } catch {
        # Fallback: Nur in Konsole ausgeben wenn Datei nicht beschreibbar ist
        Write-Host "[WARNUNG] Konnte nicht in Datei schreiben: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Initialisiere die Ausgabedatei mit verbessertem Error Handling
try {
    "Microsoft LAPS Enhanced Diagnosebericht" | Out-File -FilePath $OutputPath -ErrorAction Stop
    "Erstellt am: $(Get-Date)" | Out-File -FilePath $OutputPath -Append
    "Autor: Philipp Schmidt (Enhanced Version)" | Out-File -FilePath $OutputPath -Append
    "Computer: $env:COMPUTERNAME" | Out-File -FilePath $OutputPath -Append
    "Benutzer: $env:USERNAME" | Out-File -FilePath $OutputPath -Append
    "Ausgabepfad: $OutputPath" | Out-File -FilePath $OutputPath -Append
    "`n=============================`n" | Out-File -FilePath $OutputPath -Append
    Write-Host "Bericht wird gespeichert unter: $OutputPath" -ForegroundColor Green
} catch {
    Write-Host "WARNUNG: Konnte Ausgabedatei nicht erstellen: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "Diagnose wird nur in der Konsole ausgegeben." -ForegroundColor Yellow
    $OutputPath = $null
}

Write-DiagnosticOutput "LAPS Diagnose gestartet..."

# 0. Administrator-Berechtigung prüfen
Write-DiagnosticOutput "0. Administrator-Berechtigung prüfen"
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if ($isAdmin) {
    Write-DiagnosticOutput "✓ Skript läuft mit Administrator-Berechtigung" "SUCCESS"
} else {
    Write-DiagnosticOutput "✗ WARNUNG: Skript läuft NICHT mit Administrator-Berechtigung" "WARNING"
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# 1. LAPS PowerShell Modul prüfen und laden
Write-DiagnosticOutput "1. LAPS PowerShell Modul Status"
try {
    # Prüfe ob LAPS Modul verfügbar ist
    $lapsModule = Get-Module -ListAvailable -Name "LAPS" -ErrorAction SilentlyContinue
    if ($lapsModule) {
        Write-DiagnosticOutput "✓ LAPS PowerShell Modul gefunden: Version $($lapsModule.Version)" "SUCCESS"
        
        # Lade das Modul
        Import-Module LAPS -Force -ErrorAction Stop
        Write-DiagnosticOutput "✓ LAPS Modul erfolgreich geladen" "SUCCESS"
        
        # Zeige verfügbare LAPS Cmdlets
        $lapsCmdlets = Get-Command -Module LAPS
        Write-DiagnosticOutput "Verfügbare LAPS Cmdlets: $($lapsCmdlets.Name -join ', ')"
        
        # Sichere Ausgabe in Datei
        if ($OutputPath) {
            "`n=============================`n" | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
        }
    } else {
        Write-DiagnosticOutput "✗ LAPS PowerShell Modul nicht gefunden!" "ERROR"
        Write-DiagnosticOutput "Installieren Sie das Modul mit: Install-Module -Name LAPS" "ERROR"
    }
} catch {
    Write-DiagnosticOutput "✗ Fehler beim Laden des LAPS Moduls: $($_.Exception.Message)" "ERROR"
}
if ($OutputPath) {
    "`n=============================`n" | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
}

# 2. PowerShell Execution Policy
Write-DiagnosticOutput "2. PowerShell Execution Policy"
try {
    $executionPolicy = Get-ExecutionPolicy
    Write-DiagnosticOutput "Aktuelle Execution Policy: $executionPolicy"
    
    if ($executionPolicy -eq "Restricted") {
        Write-DiagnosticOutput "✗ WARNUNG: Execution Policy ist auf 'Restricted' gesetzt" "WARNING"
    } else {
        Write-DiagnosticOutput "✓ Execution Policy erlaubt Skript-Ausführung" "SUCCESS"
    }
} catch {
    Write-DiagnosticOutput "✗ Fehler beim Abrufen der Execution Policy: $($_.Exception.Message)" "ERROR"
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# 3. Netzwerk-Konnektivität prüfen
Write-DiagnosticOutput "3. Netzwerk-Konnektivität"
try {
    # Teste Verbindung zu Azure AD
    $azureADTest = Test-NetConnection -ComputerName "login.microsoftonline.com" -Port 443 -WarningAction SilentlyContinue
    if ($azureADTest.TcpTestSucceeded) {
        Write-DiagnosticOutput "✓ Verbindung zu Azure AD erfolgreich (login.microsoftonline.com:443)" "SUCCESS"
    } else {
        Write-DiagnosticOutput "✗ Verbindung zu Azure AD fehlgeschlagen" "ERROR"
    }
    
    # Teste DNS-Auflösung
    $dnsTest = Resolve-DnsName "login.microsoftonline.com" -ErrorAction SilentlyContinue
    if ($dnsTest) {
        Write-DiagnosticOutput "✓ DNS-Auflösung funktioniert" "SUCCESS"
    } else {
        Write-DiagnosticOutput "✗ DNS-Auflösung fehlgeschlagen" "ERROR"
    }
} catch {
    Write-DiagnosticOutput "✗ Fehler bei Netzwerk-Tests: $($_.Exception.Message)" "ERROR"
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# 4. Azure AD Status
Write-DiagnosticOutput "4. Azure AD Status (dsregcmd /status)"
try {
    $dsregOutput = dsregcmd /status
    $dsregOutput | Out-File -FilePath $OutputPath -Append
    
    # Analysiere wichtige Statuswerte
    $azureAdJoined = ($dsregOutput | Select-String "AzureAdJoined.*YES")
    $domainJoined = ($dsregOutput | Select-String "DomainJoined.*YES")
    
    if ($azureAdJoined) {
        Write-DiagnosticOutput "✓ Gerät ist Azure AD beigetreten" "SUCCESS"
    } elseif ($domainJoined) {
        Write-DiagnosticOutput "✓ Gerät ist Domain beigetreten (Hybrid möglich)" "SUCCESS"
    } else {
        Write-DiagnosticOutput "✗ Gerät ist weder Azure AD noch Domain beigetreten" "WARNING"
    }
} catch {
    Write-DiagnosticOutput "✗ Fehler beim Ausführen von dsregcmd: $($_.Exception.Message)" "ERROR"
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# 5. LAPS Diagnose (mit Workaround für bekannten Bug)
Write-DiagnosticOutput "5. LAPS Diagnose (Get-LapsDiagnostics + Alternative Methoden)"
try {
    if (Get-Command Get-LapsDiagnostics -ErrorAction SilentlyContinue) {
        Write-DiagnosticOutput "Versuche Get-LapsDiagnostics..."
        
        # Versuche zuerst den normalen Weg
        try {
            $lapsDiagnostics = Get-LapsDiagnostics -ErrorAction Stop
            if ($OutputPath) {
                $lapsDiagnostics | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
            }
            Write-DiagnosticOutput "✓ LAPS Diagnose erfolgreich ausgeführt" "SUCCESS"
        } catch {
            Write-DiagnosticOutput "✗ Get-LapsDiagnostics fehlgeschlagen (bekannter Bug): $($_.Exception.Message)" "WARNING"
            Write-DiagnosticOutput "Verwende alternative Diagnosemethoden..." "INFO"
            
            # Alternative 1: Manuelle LAPS-Status-Prüfung
            Write-DiagnosticOutput "--- Alternative LAPS Diagnose ---"
            
            # Prüfe LAPS Service
            try {
                $lapsService = Get-Service -Name "LAPS" -ErrorAction SilentlyContinue
                if ($lapsService) {
                    Write-DiagnosticOutput "✓ LAPS Service gefunden: Status = $($lapsService.Status)" "SUCCESS"
                    if ($OutputPath) {
                        "LAPS Service Status: $($lapsService.Status)" | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
                    }
                } else {
                    Write-DiagnosticOutput "⚠ LAPS Service nicht gefunden" "WARNING"
                }
            } catch {
                Write-DiagnosticOutput "✗ Fehler beim Service-Check: $($_.Exception.Message)" "ERROR"
            }
            
            # Prüfe LAPS Registry-Konfiguration
            try {
                $lapsConfigPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\LAPS\Config"
                if (Test-Path $lapsConfigPath) {
                    Write-DiagnosticOutput "✓ LAPS Konfiguration gefunden in Registry" "SUCCESS"
                    $lapsConfig = Get-ItemProperty -Path $lapsConfigPath -ErrorAction SilentlyContinue
                    if ($lapsConfig) {
                        Write-DiagnosticOutput "LAPS Config Properties: $($lapsConfig.PSObject.Properties.Name -join ', ')"
                        if ($OutputPath) {
                            "LAPS Registry Konfiguration:" | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
                            $lapsConfig | Format-List | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
                        }
                    }
                } else {
                    Write-DiagnosticOutput "⚠ LAPS Registry-Konfiguration nicht gefunden" "WARNING"
                }
            } catch {
                Write-DiagnosticOutput "✗ Fehler beim Registry-Check: $($_.Exception.Message)" "ERROR"
            }
            
            # Prüfe alternative LAPS Cmdlets
            try {
                if (Get-Command Get-LapsADPassword -ErrorAction SilentlyContinue) {
                    Write-DiagnosticOutput "✓ Get-LapsADPassword Cmdlet verfügbar" "SUCCESS"
                }
                if (Get-Command Set-LapsADComputerSelfPermission -ErrorAction SilentlyContinue) {
                    Write-DiagnosticOutput "✓ Set-LapsADComputerSelfPermission Cmdlet verfügbar" "SUCCESS"
                }
                if (Get-Command Invoke-LapsPolicyProcessing -ErrorAction SilentlyContinue) {
                    Write-DiagnosticOutput "✓ Invoke-LapsPolicyProcessing Cmdlet verfügbar" "SUCCESS"
                }
            } catch {
                Write-DiagnosticOutput "✗ Fehler beim Cmdlet-Check: $($_.Exception.Message)" "ERROR"
            }
        }
    } else {
        Write-DiagnosticOutput "✗ Get-LapsDiagnostics Cmdlet nicht verfügbar" "ERROR"
        Write-DiagnosticOutput "Möglicherweise ist das LAPS PowerShell Modul nicht richtig installiert" "ERROR"
    }
} catch {
    Write-DiagnosticOutput "✗ Allgemeiner Fehler bei LAPS Diagnose: $($_.Exception.Message)" "ERROR"
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# 6. LAPS Eventlog-Auswertung
Write-DiagnosticOutput "6. LAPS Eventlog-Auswertung (Microsoft-Windows-LAPS/Operational)"
try {
    $lapsEvents = Get-WinEvent -LogName "Microsoft-Windows-LAPS/Operational" -MaxEvents 50 -ErrorAction Stop
    Write-DiagnosticOutput "✓ $($lapsEvents.Count) LAPS Events gefunden" "SUCCESS"
    
    # Analysiere Event-Typen
    $errorEvents = $lapsEvents | Where-Object { $_.LevelDisplayName -eq "Error" }
    $warningEvents = $lapsEvents | Where-Object { $_.LevelDisplayName -eq "Warning" }
    
    if ($errorEvents) {
        Write-DiagnosticOutput "✗ $($errorEvents.Count) Fehler-Events gefunden" "WARNING"
    }
    if ($warningEvents) {
        Write-DiagnosticOutput "⚠ $($warningEvents.Count) Warnungs-Events gefunden" "WARNING"
    }
    
    $lapsEvents | Format-List | Out-File -FilePath $OutputPath -Append
} catch {
    Write-DiagnosticOutput "✗ LAPS Eventlog konnte nicht gelesen werden: $($_.Exception.Message)" "ERROR"
    "Mögliche Ursachen: LAPS nicht installiert oder Operational Log nicht aktiviert" | Out-File -FilePath $OutputPath -Append
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# 7. Uhrzeit-Synchronisation
Write-DiagnosticOutput "7. Uhrzeit-Synchronisation (w32tm /query /status)"
try {
    $timeStatus = w32tm /query /status
    $timeStatus | Out-File -FilePath $OutputPath -Append
    
    # Prüfe auf Synchronisation
    $syncStatus = $timeStatus | Select-String "Last Successful Sync Time"
    if ($syncStatus) {
        Write-DiagnosticOutput "✓ Zeitsynchronisation aktiv" "SUCCESS"
    } else {
        Write-DiagnosticOutput "⚠ Zeitsynchronisation möglicherweise nicht aktiv" "WARNING"
    }
} catch {
    Write-DiagnosticOutput "✗ Fehler bei Uhrzeitabfrage: $($_.Exception.Message)" "ERROR"
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# 8. Zusätzliche LAPS-spezifische Prüfungen
Write-DiagnosticOutput "8. Zusätzliche LAPS Prüfungen"
try {
    # Prüfe lokale Administrator-Konten
    $localAdmins = Get-LocalUser | Where-Object { $_.Enabled -eq $true -and $_.Name -like "*admin*" }
    if ($localAdmins) {
        Write-DiagnosticOutput "Lokale Administrator-Konten gefunden: $($localAdmins.Name -join ', ')"
        $localAdmins | Format-List | Out-File -FilePath $OutputPath -Append
    }
    
    # Prüfe LAPS Registry-Einstellungen (falls vorhanden)
    $lapsRegPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\GPExtensions\{D76B9641-3288-4f75-942D-087DE603E3EA}"
    if (Test-Path $lapsRegPath) {
        Write-DiagnosticOutput "✓ LAPS Registry-Pfad gefunden" "SUCCESS"
        Get-ItemProperty -Path $lapsRegPath | Out-File -FilePath $OutputPath -Append
    } else {
        Write-DiagnosticOutput "⚠ LAPS Registry-Pfad nicht gefunden" "WARNING"
    }
} catch {
    Write-DiagnosticOutput "✗ Fehler bei zusätzlichen Prüfungen: $($_.Exception.Message)" "ERROR"
}
"`n=============================`n" | Out-File -FilePath $OutputPath -Append

# Abschluss und Zusammenfassung
Write-DiagnosticOutput "DIAGNOSE ABGESCHLOSSEN"
if ($OutputPath) {
    "Bericht gespeichert unter: $OutputPath" | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
    "Für weitere Unterstützung wenden Sie sich an den IT-Support." | Out-File -FilePath $OutputPath -Append -ErrorAction SilentlyContinue
}

Write-Host "`n" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "LAPS Diagnose erfolgreich abgeschlossen!" -ForegroundColor Green
if ($OutputPath) {
    Write-Host "Bericht gespeichert: $OutputPath" -ForegroundColor Yellow
    
    # Öffne den Bericht automatisch
    try {
        Start-Process notepad.exe -ArgumentList $OutputPath
    } catch {
        Write-Host "Bericht konnte nicht automatisch geöffnet werden." -ForegroundColor Yellow
    }
} else {
    Write-Host "Diagnose nur in Konsole verfügbar (Datei konnte nicht erstellt werden)" -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Green
