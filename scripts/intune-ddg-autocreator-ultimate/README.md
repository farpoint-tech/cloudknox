# Intune DDG AutoCreator Ultimate

## Beschreibung

Die ultimative Lösung für die automatische Erstellung und Verwaltung von Dynamic Device Groups (DDG) in Microsoft Intune. Dieses umfassende PowerShell-Framework bietet erweiterte Funktionen für die automatisierte Gruppenverwaltung mit Teams-Integration und modularer Architektur.

## Hauptfunktionen

### 🚀 Automatische Gruppenerstellung
- **Dynamic Device Groups**: Automatische Erstellung basierend auf Geräteattributen
- **Regel-Engine**: Flexible Regeldefinition für Gruppenmitgliedschaft
- **Bulk-Operationen**: Massenhafte Gruppenerstellung und -verwaltung
- **Template-System**: Vordefinierte Gruppenvorlagen

### 🔧 Erweiterte Konfiguration
- **JSON-Konfiguration**: Zentrale Konfigurationsverwaltung
- **Modulare Architektur**: Getrennte Module für verschiedene Funktionen
- **Skalierbare Lösung**: Unterstützung für große Umgebungen
- **Anpassbare Workflows**: Flexible Anpassung an Unternehmensanforderungen

### 🔐 Authentifizierung und Sicherheit
- **Multiple Auth-Methoden**: Verschiedene Authentifizierungsoptionen
- **Sichere Credential-Verwaltung**: Verschlüsselte Speicherung von Anmeldedaten
- **RBAC-Integration**: Rollenbasierte Zugriffskontrolle
- **Audit-Logging**: Umfassende Protokollierung aller Aktionen

### 🔔 Teams-Integration
- **Webhook-Benachrichtigungen**: Echtzeitbenachrichtigungen über Teams
- **Status-Updates**: Automatische Fortschrittsmeldungen
- **Fehler-Alerts**: Sofortige Benachrichtigung bei Problemen
- **Zusammenfassungsberichte**: Detaillierte Ausführungsberichte

## Projektstruktur

```
project/
├── script1/                        # Hauptskript
│   ├── Intune-DDG-AutoCreator-Ultimate.ps1
│   └── README.md
├── script2/                        # Zusätzliche Skripte (Platzhalter)
│   └── README.md
├── shared-modules/                 # Gemeinsame Module
│   ├── AuthenticationModule.psm1
│   ├── TeamsIntegrationModule.psm1
│   └── README.md
├── shared-config/                  # Konfigurationsdateien
│   ├── config-ultimate.json
│   └── README.md
├── docs/                          # Dokumentation
│   └── IntuneDynamicDeviceGroupAutoCreator-UltimateEnterpriseEdition.md
├── examples/                      # Verwendungsbeispiele
│   └── README.md
└── README.md                      # Hauptdokumentation
```

## Voraussetzungen

- PowerShell 5.1 oder höher
- Microsoft Graph PowerShell SDK
- Azure AD-Berechtigungen:
  - `Group.ReadWrite.All`
  - `Device.Read.All`
  - `DeviceManagementManagedDevices.Read.All`
- Microsoft Intune-Lizenz

## Schnellstart

### 1. Konfiguration
```powershell
# Konfigurationsdatei anpassen
notepad shared-config\config-ultimate.json
```

### 2. Module importieren
```powershell
# Authentifizierungsmodul
Import-Module ".\shared-modules\AuthenticationModule.psm1" -Force

# Teams-Integration (optional)
Import-Module ".\shared-modules\TeamsIntegrationModule.psm1" -Force
```

### 3. Script ausführen
```powershell
# Grundlegende Ausführung
.\script1\Intune-DDG-AutoCreator-Ultimate.ps1

# Mit Teams-Benachrichtigungen
.\script1\Intune-DDG-AutoCreator-Ultimate.ps1 -TeamsWebhook "https://your-webhook-url"
```

## Konfiguration

### config-ultimate.json
```json
{
  "GroupSettings": {
    "Prefix": "DDG-",
    "Description": "Automatically created dynamic device group",
    "MembershipType": "DynamicDevice"
  },
  "Rules": [
    {
      "Name": "Windows Devices",
      "Rule": "(device.deviceOSType -eq \"Windows\")"
    },
    {
      "Name": "iOS Devices", 
      "Rule": "(device.deviceOSType -eq \"iOS\")"
    }
  ],
  "Notifications": {
    "TeamsEnabled": true,
    "EmailEnabled": false
  }
}
```

## Verwendungsszenarien

### 1. Betriebssystem-basierte Gruppen
```powershell
# Automatische Erstellung von OS-spezifischen Gruppen
.\script1\Intune-DDG-AutoCreator-Ultimate.ps1 -GroupType "OperatingSystem"
```

### 2. Abteilungs-basierte Gruppen
```powershell
# Gruppen basierend auf Abteilungszugehörigkeit
.\script1\Intune-DDG-AutoCreator-Ultimate.ps1 -GroupType "Department" -DepartmentList "IT,HR,Finance"
```

### 3. Compliance-basierte Gruppen
```powershell
# Gruppen für Compliance-Status
.\script1\Intune-DDG-AutoCreator-Ultimate.ps1 -GroupType "Compliance"
```

## Erweiterte Funktionen

### Bulk-Operationen
- Massenhafte Gruppenerstellung
- Batch-Verarbeitung von Regeln
- Parallele Ausführung für bessere Performance
- Fortschrittsüberwachung

### Template-System
- Vordefinierte Gruppenvorlagen
- Anpassbare Regel-Templates
- Wiederverwendbare Konfigurationen
- Best-Practice-Implementierungen

### Monitoring und Reporting
- Detaillierte Ausführungsprotokolle
- Performance-Metriken
- Fehlerberichterstattung
- Trend-Analyse

## Authentifizierung

### Unterstützte Methoden
1. **Interactive Authentication** (Empfohlen für manuelle Ausführung)
2. **Service Principal** (Für automatisierte Ausführung)
3. **Managed Identity** (Für Azure-gehostete Umgebungen)
4. **Certificate-based Authentication** (Für höchste Sicherheit)

### Beispiel: Service Principal
```powershell
$AuthParams = @{
    TenantId = "your-tenant-id"
    ClientId = "your-client-id"
    ClientSecret = "your-client-secret"
}

.\script1\Intune-DDG-AutoCreator-Ultimate.ps1 @AuthParams
```

## Teams-Integration

### Webhook-Setup
1. Teams-Kanal öffnen
2. Connectors konfigurieren
3. Incoming Webhook hinzufügen
4. Webhook-URL kopieren

### Benachrichtigungstypen
- **Start-Benachrichtigungen**: Script-Ausführung beginnt
- **Fortschritts-Updates**: Gruppenerstellungsstatus
- **Erfolgs-Meldungen**: Erfolgreich erstellte Gruppen
- **Fehler-Alerts**: Probleme und Fehlschläge
- **Zusammenfassungen**: Vollständige Ausführungsberichte

## Fehlerbehebung

### Häufige Probleme
1. **Authentifizierungsfehler**: Berechtigungen überprüfen
2. **Gruppenerstellung fehlgeschlagen**: Regel-Syntax validieren
3. **Teams-Benachrichtigungen funktionieren nicht**: Webhook-URL prüfen
4. **Performance-Probleme**: Batch-Größe anpassen

### Debug-Modus
```powershell
.\script1\Intune-DDG-AutoCreator-Ultimate.ps1 -Debug -Verbose
```

### Log-Analyse
```powershell
# Aktuelle Logs anzeigen
Get-Content "C:\Logs\DDG-AutoCreator\latest.log" -Tail 50

# Fehler suchen
Select-String -Path "C:\Logs\DDG-AutoCreator\*.log" -Pattern "ERROR"
```

## Best Practices

### 1. Regel-Design
- Eindeutige und spezifische Regeln verwenden
- Performance-optimierte Abfragen erstellen
- Regel-Konflikte vermeiden
- Regelmäßige Validierung durchführen

### 2. Sicherheit
- Minimale erforderliche Berechtigungen verwenden
- Sichere Credential-Speicherung implementieren
- Audit-Logging aktivieren
- Regelmäßige Sicherheitsüberprüfungen

### 3. Wartung
- Regelmäßige Updates der Module
- Monitoring der Gruppenperformance
- Bereinigung verwaister Gruppen
- Dokumentation aktuell halten

## Autor

Philipp Schmidt - Farpoint Technologies

## Version

1.0 - Ultimate Enterprise Edition

## Support

Für technischen Support:
1. Dokumentation in `docs/` überprüfen
2. Debug-Modus aktivieren
3. Log-Dateien analysieren
4. Support-Team kontaktieren

