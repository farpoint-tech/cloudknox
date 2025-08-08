# OOBE Autopilot Registration - Minimal Version

## Beschreibung

Minimale Version des OOBE (Out-of-Box Experience) Autopilot-Registrierungsscripts für Microsoft Intune. Diese schlanke Lösung ermöglicht die schnelle und einfache Registrierung von Geräten im Windows Autopilot-Programm während der ersten Einrichtung.

## Hauptfunktionen

### 🚀 Schnelle Registrierung
- **Minimaler Overhead**: Schlanke Implementierung für maximale Performance
- **OOBE-Integration**: Nahtlose Integration in den Windows-Einrichtungsprozess
- **Automatische Erkennung**: Automatische Erfassung der Gerätehardware-ID
- **Sofortige Registrierung**: Direkte Übertragung an Autopilot-Service

### 🔧 Einfache Konfiguration
- **Wenige Parameter**: Minimale Konfigurationsanforderungen
- **Plug-and-Play**: Sofort einsatzbereit nach minimaler Anpassung
- **Standardwerte**: Sinnvolle Standardkonfiguration
- **Fehlertoleranz**: Robuste Fehlerbehandlung

### 📊 Grundlegendes Logging
- **Essentielle Protokollierung**: Wichtige Ereignisse werden protokolliert
- **Kompakte Logs**: Minimaler Speicherverbrauch
- **Fehlerprotokollierung**: Detaillierte Fehlermeldungen
- **Status-Tracking**: Verfolgung des Registrierungsstatus

## Voraussetzungen

- Windows 10/11 (Version 1903 oder höher)
- PowerShell 5.1 oder höher
- Internetverbindung für Autopilot-Service
- Entsprechende Azure AD-Berechtigungen:
  - `DeviceManagementServiceConfig.ReadWrite.All`
  - `Device.ReadWrite.All`

## Verwendung

### Grundlegende Ausführung
```powershell
# Einfache Registrierung
.\OOBE Autopilot Registration - Minimal Version.ps1

# Mit spezifischem Group Tag
.\OOBE Autopilot Registration - Minimal Version.ps1 -GroupTag "IT-Department"

# Mit Tenant-ID
.\OOBE Autopilot Registration - Minimal Version.ps1 -TenantId "your-tenant-id"
```

### OOBE-Integration
```powershell
# Während OOBE ausführen (als Administrator)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force
.\OOBE Autopilot Registration - Minimal Version.ps1 -Silent
```

## Parameter

### Grundparameter
- `-GroupTag`: Optional - Group Tag für Autopilot-Gerät
- `-TenantId`: Optional - Azure AD Tenant ID
- `-Silent`: Optional - Stille Ausführung ohne Benutzerinteraktion
- `-LogPath`: Optional - Pfad für Log-Dateien

### Beispiele
```powershell
# Minimale Ausführung
.\OOBE Autopilot Registration - Minimal Version.ps1

# Mit Group Tag
.\OOBE Autopilot Registration - Minimal Version.ps1 -GroupTag "Sales-Team"

# Stille Ausführung
.\OOBE Autopilot Registration - Minimal Version.ps1 -Silent -LogPath "C:\Temp\Autopilot.log"
```

## Funktionsweise

### 1. Hardware-ID-Erfassung
- Automatische Erfassung der Gerätehardware-ID
- Sammlung relevanter Geräteinformationen
- Validierung der erfassten Daten

### 2. Autopilot-Registrierung
- Verbindung zum Microsoft Autopilot-Service
- Übertragung der Gerätedaten
- Bestätigung der erfolgreichen Registrierung

### 3. Status-Rückmeldung
- Anzeige des Registrierungsstatus
- Protokollierung wichtiger Ereignisse
- Fehlerbehandlung und -meldung

## Ausgabe

### Erfolgreiche Registrierung
```
[INFO] Hardware-ID erfolgreich erfasst
[INFO] Verbindung zu Autopilot-Service hergestellt
[SUCCESS] Gerät erfolgreich registriert
[INFO] Group Tag gesetzt: IT-Department
```

### Fehlerbehandlung
```
[ERROR] Fehler bei Hardware-ID-Erfassung
[WARNING] Keine Internetverbindung verfügbar
[ERROR] Registrierung fehlgeschlagen - Berechtigungen prüfen
```

## Deployment-Optionen

### 1. USB-Stick
- Script auf USB-Stick kopieren
- Während OOBE von USB ausführen
- Automatische Registrierung

### 2. Netzwerk-Share
- Script auf Netzwerk-Share bereitstellen
- Per UNC-Pfad während OOBE ausführen
- Zentrale Verwaltung

### 3. Cloud-Download
- Script von Cloud-Storage herunterladen
- Ausführung direkt nach Download
- Immer aktuelle Version

## Unterschiede zur Vollversion

### Minimal Version
- ✅ Grundlegende Registrierung
- ✅ Einfache Konfiguration
- ✅ Minimaler Overhead
- ❌ Erweiterte UI
- ❌ Teams-Integration
- ❌ Detaillierte Berichte

### Vollversion
- ✅ Alle Minimal-Features
- ✅ Erweiterte Benutzeroberfläche
- ✅ Teams-Benachrichtigungen
- ✅ Detaillierte Protokollierung
- ✅ Erweiterte Konfiguration
- ✅ Batch-Verarbeitung

## Fehlerbehebung

### Häufige Probleme
1. **Keine Internetverbindung**: WLAN/Ethernet-Verbindung prüfen
2. **Berechtigungsfehler**: Azure AD-Berechtigungen validieren
3. **Hardware-ID-Fehler**: Als Administrator ausführen
4. **Timeout-Probleme**: Netzwerkverbindung überprüfen

### Debug-Informationen
```powershell
# Erweiterte Protokollierung aktivieren
.\OOBE Autopilot Registration - Minimal Version.ps1 -Verbose -Debug
```

## Sicherheitshinweise

- Script erfordert Administratorrechte
- Sichere Übertragung der Gerätedaten
- Keine Speicherung sensibler Informationen
- Compliance mit Datenschutzbestimmungen

## Automatisierung

### Task Scheduler
```powershell
# Geplante Ausführung einrichten
schtasks /create /tn "Autopilot Registration" /tr "powershell.exe -File 'C:\Scripts\OOBE Autopilot Registration - Minimal Version.ps1' -Silent" /sc onstart /ru SYSTEM
```

### Intune-Deployment
- Als PowerShell-Script in Intune bereitstellen
- Während Autopilot-Prozess ausführen
- Automatische Geräteregistrierung

## Autor

Philipp Schmidt - Farpoint Technologies

## Version

1.0 - Minimal Version für schnelle OOBE-Registrierung

## Support

Für technischen Support:
- Überprüfung der Internetverbindung
- Validierung der Azure AD-Berechtigungen
- Ausführung im Debug-Modus
- Analyse der Log-Dateien

