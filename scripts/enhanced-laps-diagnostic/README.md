# Enhanced LAPS-Diagnoseskript für Windows-Geräte

## Beschreibung

Erweiterte Diagnoselösung für Local Administrator Password Solution (LAPS) auf Windows-Geräten. Dieses PowerShell-Script bietet umfassende Diagnose- und Überwachungsfunktionen für LAPS-Implementierungen in Microsoft Intune-verwalteten Umgebungen.

## Hauptfunktionen

### 🔍 Umfassende LAPS-Diagnose
- **Konfigurationsprüfung**: Überprüfung der LAPS-Konfiguration
- **Passwort-Status**: Kontrolle des aktuellen Passwort-Status
- **Richtlinien-Validierung**: Überprüfung der angewendeten LAPS-Richtlinien
- **Event Log-Analyse**: Auswertung von LAPS-bezogenen Ereignissen

### 📊 Detaillierte Berichterstattung
- **HTML-Berichte**: Generierung detaillierter HTML-Diagnoseberichte
- **CSV-Export**: Export der Diagnosedaten für weitere Analyse
- **Dashboard-Ansicht**: Übersichtliche Darstellung des LAPS-Status
- **Trend-Analyse**: Historische Datenauswertung

### 🛠️ Automatisierte Reparatur
- **Konfigurationsfehler-Behebung**: Automatische Korrektur häufiger Probleme
- **Richtlinien-Neuanwendung**: Erneute Anwendung von LAPS-Richtlinien
- **Service-Neustart**: Neustart relevanter Dienste bei Bedarf
- **Registry-Reparatur**: Korrektur von Registry-Einstellungen

### 🔔 Monitoring und Alerting
- **Proaktive Überwachung**: Kontinuierliche Überwachung des LAPS-Status
- **E-Mail-Benachrichtigungen**: Automatische Benachrichtigungen bei Problemen
- **Teams-Integration**: Integration mit Microsoft Teams für Alerts
- **Schwellenwert-Überwachung**: Konfigurierbare Überwachungsschwellen

## Voraussetzungen

- Windows 10/11 oder Windows Server 2016+
- PowerShell 5.1 oder höher
- LAPS installiert und konfiguriert
- Entsprechende Administratorrechte
- Microsoft Graph PowerShell SDK (für Intune-Integration)

## Verwendung

### Grundlegende Diagnose
```powershell
# Vollständige LAPS-Diagnose
.\Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1

# Nur Konfigurationsprüfung
.\Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1 -ConfigOnly

# Mit HTML-Bericht
.\Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1 -GenerateReport
```

### Erweiterte Optionen
```powershell
# Mit automatischer Reparatur
.\Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1 -AutoRepair

# Mit E-Mail-Benachrichtigung
.\Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1 -EmailAlert -SMTPServer "smtp.company.com"

# Kontinuierliche Überwachung
.\Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1 -Monitor -Interval 300
```

## Diagnose-Bereiche

### 1. LAPS-Installation
- Überprüfung der LAPS-Komponenten
- Validierung der Installationsintegrität
- Versionskontrolle

### 2. Konfiguration
- Registry-Einstellungen
- Gruppenrichtlinien-Anwendung
- Berechtigungen und Sicherheitseinstellungen

### 3. Passwort-Management
- Aktueller Passwort-Status
- Passwort-Rotation-Historie
- Ablaufzeiten und Richtlinien

### 4. Event Logs
- LAPS-spezifische Ereignisse
- Fehler- und Warnmeldungen
- Audit-Protokolle

### 5. Netzwerk-Konnektivität
- Domain Controller-Erreichbarkeit
- LDAP-Verbindungen
- DNS-Auflösung

## Ausgabeformate

### HTML-Bericht
- Interaktive Dashboard-Ansicht
- Grafische Darstellung der Ergebnisse
- Drill-Down-Funktionalität
- Export-Optionen

### CSV-Export
- Strukturierte Datenausgabe
- Kompatibel mit Excel und anderen Tools
- Historische Datensammlung
- Trend-Analyse-Unterstützung

### Console-Output
- Echtzeitanzeige der Diagnoseergebnisse
- Farbkodierte Statusanzeigen
- Fortschrittsbalken
- Detaillierte Fehlermeldungen

## Automatisierung

### Geplante Ausführung
```powershell
# Windows Task Scheduler Integration
schtasks /create /tn "LAPS Diagnostic" /tr "powershell.exe -File 'C:\Scripts\Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1'" /sc daily /st 09:00
```

### Intune-Integration
- Deployment als Intune PowerShell Script
- Compliance-Richtlinien-Integration
- Automatische Berichterstattung an Intune

## Fehlerbehebung

### Häufige Probleme
1. **LAPS nicht installiert**: Automatische Installationsprüfung
2. **Konfigurationsfehler**: Guided Repair-Funktionen
3. **Berechtigungsprobleme**: Elevated Rights-Prüfung
4. **Netzwerkprobleme**: Konnektivitätstests

### Debug-Modus
```powershell
.\Enhanced LAPS-Diagnoseskript für Windows-Geräte.ps1 -Debug -Verbose
```

## Sicherheitshinweise

- Script erfordert Administratorrechte
- Sensible Daten werden nicht in Logs gespeichert
- Sichere Übertragung von Diagnosedaten
- Compliance mit Datenschutzbestimmungen

## Autor

Philipp Schmidt - Farpoint Technologies

## Version

1.0 - Erste Veröffentlichung der erweiterten LAPS-Diagnoselösung

## Support

Für technischen Support und Fragen:
- Überprüfung der Voraussetzungen
- Ausführung im Debug-Modus
- Analyse der generierten Berichte
- Kontaktaufnahme mit dem Support-Team

