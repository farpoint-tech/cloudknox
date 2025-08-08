# Device Rename GroupTAG Enhanced v2.0

## Beschreibung

Erweiterte PowerShell-Lösung für die dynamische Umbenennung von AAD-joined Intune-Geräten im Format "GroupTag-SerialTail" (≤15 Zeichen). Das Script bietet eine verbesserte Benutzeroberfläche, umfassendes Logging und mehrere Authentifizierungsoptionen.

## Hauptfunktionen

### 🔐 Mehrere Authentifizierungsoptionen
- **Interactive Authentication** (Empfohlen)
- **Username/Password Authentication** 
- **Client Credentials (App Registration)**
- **Device Code Authentication**

### 🎨 Erweiterte Benutzeroberfläche
- Farbenfrohe, augenfreundliche PowerShell-Oberfläche
- Fortschrittsanzeigen und Statusupdates
- Klare Fehlermeldungen und Anleitungen
- ISE-kompatibles Design

### 📊 Umfassendes Logging
- Detaillierte Ausführungsprotokolle
- Fehlerverfolgungs- und Debugging-Funktionen
- Log-Rotation und -Verwaltung
- Konfigurierbare Log-Level

### 🔔 Teams-Integration
- Echtzeitbenachrichtigungen über Microsoft Teams Webhooks
- Ausführungszusammenfassungen und Statusupdates
- Fehlerwarnungen und -meldungen
- Anpassbare Benachrichtigungsvorlagen

## Geräte-Namenskonvention

- **Muster:** `GroupTag-SerialTail`
- **Maximale Länge:** 15 Zeichen
- **Beispiel:** `IT-DEPT-ABC123`

## Voraussetzungen

- PowerShell 5.1 oder höher
- Microsoft Graph PowerShell SDK
- Entsprechende Azure AD-Berechtigungen
- Intune-verwaltete Geräte

## Schnellstart

### Interaktive Authentifizierung (Empfohlen)
```powershell
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive
```

### Mit Teams-Integration
```powershell
# Teams-Modul importieren
Import-Module ".\modules\TeamsIntegrationModule.psm1" -Force

# Script mit Teams-Benachrichtigungen ausführen
.\DeviceRename-GroupTAG-Enhanced-v2.ps1 -Interactive -TeamsWebhook "https://your-teams-webhook-url"
```

## Projektstruktur

```
project/
├── script/
│   └── DeviceRename-GroupTAG-Enhanced-v2.ps1
├── modules/
│   └── TeamsIntegrationModule.psm1
├── docs/
│   ├── DynamicDeviceRenaminginIntune-EnhancedVersionv2.0
│   └── DynamicDeviceRenaminginIntuneUsingGroupTagsandPowerShell-EnhancedVersionv2.0
├── examples/
│   └── README.md
├── LICENSE
└── README.md
```

## Erforderliche Azure AD RBAC-Rollen

### Für Username/Password-Authentifizierung:
- **Intune Administrator** (Empfohlen)
- **Global Administrator** (Vollzugriff)
- **Cloud Device Administrator** (Geräteverwaltung)

### Für App Registration (Client Credentials):
- Keine spezifischen Benutzerrollen erforderlich (verwendet App-Berechtigungen)

## Erforderliche Graph API-Berechtigungen
- `Device.Read.All` (Application oder Delegated)
- `DeviceManagementServiceConfig.Read.All` (Application oder Delegated)
- `User.Read` (Delegated)
- `DeviceManagementManagedDevices.Read.All` (Delegated - für Benutzerauthentifizierung)

## Autor

**Enhanced Version:** Philipp Schmidt - Farpoint Technologies  
**Original Konzept:** AliAlame - CYBERSYSTEM (https://www.cybersystem.ca)

## Version

v2.0 - Erweiterte Version mit verbesserter UI, Teams-Integration und mehreren Authentifizierungsoptionen

