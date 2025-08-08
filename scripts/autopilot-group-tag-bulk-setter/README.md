# Autopilot Group Tag Bulk Setter

## Beschreibung

Dieses PowerShell-Script ermöglicht das massenhafte Setzen von Group Tags für Autopilot-Geräte in Microsoft Intune. Es bietet eine effiziente Lösung für die Verwaltung großer Mengen von Autopilot-Geräten durch automatisierte Group Tag-Zuweisung.

## Funktionen

- **Massenhafte Group Tag-Zuweisung**: Setzen von Group Tags für mehrere Autopilot-Geräte gleichzeitig
- **CSV-Import**: Unterstützung für CSV-Dateien mit Gerätelisten
- **Validierung**: Überprüfung der Gerätedaten vor der Verarbeitung
- **Logging**: Detaillierte Protokollierung aller Aktionen
- **Fehlerbehandlung**: Robuste Fehlerbehandlung mit Retry-Mechanismus

## Voraussetzungen

- PowerShell 5.1 oder höher
- Microsoft Graph PowerShell SDK
- Entsprechende Azure AD-Berechtigungen:
  - `DeviceManagementServiceConfig.ReadWrite.All`
  - `Device.ReadWrite.All`

## Verwendung

```powershell
# Grundlegende Verwendung
.\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1

# Mit CSV-Datei
.\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1 -CsvPath "C:\path\to\devices.csv"

# Mit spezifischem Group Tag
.\AUTOPILOT_GROUP_TAG_BULK_SETTER.ps1 -GroupTag "IT-Department"
```

## CSV-Format

Die CSV-Datei sollte folgende Spalten enthalten:
- `SerialNumber`: Seriennummer des Geräts
- `GroupTag`: Gewünschter Group Tag
- `DeviceName`: (Optional) Gerätename

## Autor

Philipp Schmidt - Farpoint Technologies

## Version

1.0 - Erste Veröffentlichung

