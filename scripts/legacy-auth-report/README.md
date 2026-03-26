# Legacy Authentication Sign-In Report

Dieses PowerShell-Skript (`Get-LegacyAuthReport.ps1`) fragt die Microsoft Graph Sign-In Logs nach allen Anmeldeversuchen über Legacy-Authentifizierungsprotokolle ab. Anschließend generiert es einen in sich geschlossenen, visuell ansprechenden HTML-Bericht, der Details wie Benutzer, Protokoll, IP-Adresse, Standort, Risikostufe und Conditional Access-Status enthält.

## Funktionen

- **Plattformübergreifend kompatibel**: Funktioniert unter Windows (PowerShell 7), macOS (PowerShell 7) und der Azure Cloud Shell.
- **Automatische Plattformerkennung**: Das Skript erkennt die Laufzeitumgebung und passt das Verhalten (z.B. das Öffnen des HTML-Berichts) entsprechend an.
- **Detaillierte Analyse**: Wertet gezielt alte, unsichere Protokolle aus (z.B. Exchange ActiveSync, IMAP4, POP3, Authenticated SMTP, Exchange Web Services).
- **Visueller HTML-Bericht**: Generiert eine moderne HTML-Datei mit Filterfunktionen (nach Fehlern, hohem Risiko, ohne Conditional Access) und einer interaktiven Tabelle.
- **Azure Cloud Shell Support**: Unterstützt Managed Identities in der Cloud Shell mit Fallback auf Device Code Authentication.

## Voraussetzungen

- **PowerShell Version**: 7.0 oder höher empfohlen (Azure Cloud Shell wird unterstützt).
- **Benötigte Berechtigungen**: `AuditLog.Read.All`, `Directory.Read.All`
- **Benötigtes Modul**: `Microsoft.Graph` (v2+). Das Skript prüft automatisch auf das Vorhandensein und bietet an, fehlende Module zu installieren.

## Parameter

| Parameter | Typ | Beschreibung | Standardwert |
| :--- | :--- | :--- | :--- |
| `Days` | `int` | Der Zeitraum in Tagen, der rückwirkend geprüft werden soll (1 bis 30 Tage). | `30` |
| `OutputPath` | `string` | Pfad zur HTML-Ausgabedatei. Wird dies nicht angegeben, wählt das Skript einen temporären Ordner passend zur Plattform. | *Temporärer Pfad* |
| `TopCount` | `int` | Maximale Anzahl an Datensätzen, die abgerufen werden sollen. | `2000` |
| `SkipAutoOpen` | `switch` | Verhindert das automatische Öffnen des generierten HTML-Berichts im Standardbrowser. | `$false` |

## Beispiele

### Windows / macOS
Führt den Bericht für die letzten 30 Tage aus und öffnet das Ergebnis automatisch im Browser:
```powershell
.\Get-LegacyAuthReport.ps1 -Days 30
```

### Azure Cloud Shell
Führt den Bericht für die letzten 14 Tage aus und unterdrückt das automatische Öffnen (da in der Cloud Shell kein lokaler Browser verfügbar ist):
```powershell
.\Get-LegacyAuthReport.ps1 -Days 14 -SkipAutoOpen
```

## Funktionsweise und Fehlerbehebung

1. **Verbindung zu Microsoft Graph**: Das Skript nutzt `Connect-MgGraph`. In der Cloud Shell wird primär versucht, die Managed Identity zu nutzen. Schlägt dies fehl, fällt es auf die Device-Code-Authentifizierung zurück.
2. **Sortierung der Ergebnisse**: Die Ergebnisse werden intelligent sortiert: Fehlgeschlagene Logins und hohe Risiken erscheinen zuerst.
3. **Conditional Access Hinweis**: Da Legacy-Authentifizierungsprotokolle MFA umgehen können, enthält der Bericht eine Warnung und Empfehlung, diese Protokolle via Conditional Access zu blockieren.

## Changelog / Änderungen

- Bugfix in der `Sort-Object`-Logik behoben, um Kompatibilität mit `Set-StrictMode -Version Latest` sicherzustellen (Vermeidung von mehrdeutigen Hashtable-Schlüsseln bei der Sortierung).
