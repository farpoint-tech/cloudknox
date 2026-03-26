# Azure AD Group Naming Convention

## Management Summary

Die Etablierung einer durchdachten und konsistenten Namenskonvention für Azure AD (Entra ID) Gruppen ist ein fundamentaler Baustein für eine sichere, skalierbare und effizient verwaltbare Cloud-Infrastruktur. Dieses Dokument definiert den Standard für die Benennung von Gruppenobjekten innerhalb der Organisation. Die eingeführte Struktur `[Environment]-[System]-[Object]-[Platform]-[Function/Department]` ermöglicht eine sofortige Identifikation des Gruppenzwecks, vereinfacht die Automatisierung über PowerShell oder Microsoft Graph und reduziert den administrativen Overhead signifikant. Durch die klare Trennung von Benutzer- und Gerätegruppen sowie die strategische Nutzung von dynamischen Mitgliedschaften und Zuweisungsfiltern (Assignment Filters) wird ein Zero-Trust-konformes Identity & Access Management unterstützt.

## 1. Zielsetzung

Das primäre Ziel dieser Richtlinie ist die Etablierung einer einheitlichen, skalierbaren und logischen Namenskonvention für Azure AD-Gruppen. Dies ermöglicht eine klare Struktur, vereinfacht die tägliche Verwaltung und bildet die Grundlage für automatisierte Provisionierungs- und Deprovisionierungsprozesse. Eine standardisierte Benennung minimiert Fehlkonfigurationen bei der Zuweisung von Berechtigungen, Applikationen und Richtlinien in Microsoft Intune und Conditional Access.

## 2. Naming Convention Struktur

Die Namenskonvention folgt einem strikten, modularen Aufbau, der alle relevanten Attribute einer Gruppe im Namen abbildet.

### 2.1 Grundmuster

```text
[Environment]-[System]-[Object]-[Platform]-[Function/Department]
```

### 2.2 Komponenten-Definition

Jedes Segment des Namens erfüllt einen spezifischen Zweck und nutzt vordefinierte Werte.

#### **Environment (Umgebung)**
Definiert den Gültigkeitsbereich der Gruppe.
- `PROD` - Production/Live-Umgebung (Standard für alle produktiven Zuweisungen)
- `TEST` - Test-Umgebung (Für Evaluierungen ohne produktiven Impact)
- `PILOT` - Pilot/Preview-Umgebung (Für kontrollierte Rollouts in der Produktion)
- `DEV` - Development-Umgebung (Optional, primär für App-Entwicklung)

#### **System (Hauptsystem)**
Kategorisiert den primären Einsatzzweck der Gruppe.
- `IAM` - Identity & Access Management (Berechtigungen, Rollen, Zugriff)
- `MDM` - Mobile Device Management (Intune Geräteverwaltung, App-Zuweisung)
- `M365` - Microsoft 365 Services (Teams, SharePoint, Lizenzen)
- `CAP` - Conditional Access Policies (Sicherheitsrichtlinien)

#### **Object (Objekttyp)**
Spezifiziert die Art der enthaltenen Objekte.
- `USER` - Benutzer-bezogene Gruppen
- `DEVICE` - Geräte-bezogene Gruppen
- `ADMIN` - Administrator-Gruppen (Erhöhte Berechtigungen)
- `APPROVER` - Genehmiger-Gruppen (z.B. für Privileged Identity Management)

#### **Platform (Plattform)**
Relevant primär für MDM- und spezifische CAP-Gruppen.
- `Windows` - Windows-Geräte
- `MacOS` - macOS-Geräte
- `iOS` - iOS-Geräte
- `Android` - Android-Geräte
- `Autopilot` - Windows Autopilot spezifische Zuweisungen

#### **Function/Department (Funktion/Abteilung)**
Beschreibt die fachliche Zugehörigkeit oder den spezifischen Zweck.
- `All` - Alle Objekte der übergeordneten Kategorie
- `Standard` - Standard-Konfiguration/Basis-Zuweisung
- `HR` - Human Resources
- `Finance` - Finanzen
- `IT` - IT-Abteilung
- `Sales` - Vertrieb
- `Marketing` - Marketing
- `Legal` - Rechtsabteilung

## 3. Gruppenkategorien & Beispiele

Die folgenden Beispiele veranschaulichen die Anwendung der Namenskonvention in der Praxis.

### 3.1 Identity & Access Management (IAM)

Gruppen für die Steuerung von Zugriffsrechten und administrativen Rollen.

| Gruppenname | Beschreibung |
| :--- | :--- |
| `PROD-IAM-USER-Standard` | Basis-Berechtigungen für alle Standard-Benutzer. |
| `PROD-IAM-USER-Guest` | Berechtigungen für externe Gast-Accounts. |
| `PROD-IAM-USER-Privileged` | Benutzer mit erweiterten Rechten (ohne permanente Admin-Rollen). |
| `PROD-IAM-ADMIN-Device` | Lokale Administratoren auf Endgeräten. |
| `PROD-IAM-ADMIN-DevOps` | Administrative Zugriffe auf DevOps-Ressourcen. |
| `PROD-IAM-APPROVER-PIM` | Genehmiger für PIM (Privileged Identity Management) Rollenanfragen. |

### 3.2 Mobile Device Management (MDM)

Gruppen für die Zuweisung von Intune-Profilen, Compliance-Richtlinien und Applikationen.

| Gruppenname | Beschreibung |
| :--- | :--- |
| `PROD-MDM-DEVICE-Windows` | Alle produktiven Windows-Geräte. |
| `PROD-MDM-DEVICE-MacOS` | Alle produktiven macOS-Geräte. |
| `PROD-MDM-DEVICE-iOS` | Alle produktiven iOS-Geräte. |
| `PROD-MDM-DEVICE-Android` | Alle produktiven Android-Geräte. |
| `PROD-MDM-DEVICE-Autopilot-UserDriven` | Autopilot-Profile für User-Driven Deployments. |
| `PROD-MDM-DEVICE-Autopilot-SelfDeploy` | Autopilot-Profile für Self-Deploying (Kiosk) Deployments. |

### 3.3 Microsoft 365 (M365)

Gruppen für die Lizenzierung und den Zugriff auf M365-Workloads.

| Gruppenname | Beschreibung |
| :--- | :--- |
| `PROD-M365-USER-Standard` | Standard-Lizenzzuweisung (z.B. M365 E3/E5). |
| `PROD-M365-USER-Insider` | Teilnehmer des Office Insider/Targeted Release Programms. |
| `PROD-M365-USER-Guest` | Gast-Zugriffe auf M365 Ressourcen. |

### 3.4 Conditional Access Policies (CAP)

Gruppen für die gezielte Steuerung (Einschluss/Ausschluss) von Conditional Access Richtlinien.

| Gruppenname | Beschreibung |
| :--- | :--- |
| `PROD-CAP-MFA-Excluded` | Accounts, die temporär oder technisch bedingt von MFA ausgenommen sind (Break-Glass Accounts). |
| `PROD-CAP-Certificate-Auth` | Accounts, die zertifikatsbasierte Authentifizierung nutzen. |
| `PROD-CAP-Unrestricted-External` | Externe Accounts mit speziellen Zugriffsanforderungen. |

### 3.5 Environment-spezifische Gruppen

Beispiele für nicht-produktive Umgebungen.

| Gruppenname | Beschreibung |
| :--- | :--- |
| `TEST-IAM-USER-Standard` | Testgruppe für IAM-Richtlinien. |
| `PILOT-MDM-DEVICE-Windows-Preview` | Pilotgruppe für neue Windows-Richtlinien oder Feature-Updates. |

## 4. Assignment Filter Strategie

Um die Anzahl der Gruppen (Group Sprawl) zu minimieren und die Berechnungszeiten in Azure AD zu optimieren, wird intensiv auf **Assignment Filter** in Intune und Conditional Access gesetzt, anstatt für jede Kombination eine eigene Gruppe zu erstellen.

### 4.1 Corporate vs. BYOD Handling

Die Unterscheidung zwischen firmeneigenen und privaten Geräten erfolgt **nicht über Gruppennamen**, sondern dynamisch über Device Properties.

- **Corporate Devices:** `(device.deviceOwnership -eq "Corporate")`
- **BYOD Devices:** `(device.deviceOwnership -eq "Personal")`

### 4.2 Department-basierte Filter

Abteilungsspezifische Zuweisungen erfolgen primär über das `department`-Attribut des Benutzers in Entra ID.

- **Sales Department:** `(user.department -eq "Sales")`
- **Finance Department:** `(user.department -eq "Finance")`
- **IT Department:** `(user.department -eq "IT")`
- **HR Department:** `(user.department -eq "HR")`

Alternativ kann bei gerätebasierten Zuweisungen auf Device Categories zurückgegriffen werden:
- **Sales Devices:** `(device.deviceCategory -eq "Sales")`

### 4.3 Kombinierte Filter-Beispiele

Durch die Kombination von Attributen lassen sich hochgranulare Zuweisungen ohne zusätzliche Gruppen realisieren.

**Corporate Windows Sales:**
```text
(device.deviceOwnership -eq "Corporate") AND 
(device.deviceOSType -eq "Windows") AND 
(user.department -eq "Sales")
```

**Finance macOS Devices:**
```text
(device.deviceOSType -eq "macOS") AND 
(user.department -eq "Finance")
```

### 4.4 Weitere Filter-Optionen

- **OS Version:** `(device.deviceOSVersion -startsWith "10.0.19")`
- **Device Model:** `(device.deviceModel -contains "Surface")`
- **Enrollment Type:** `(device.enrollmentType -eq "WindowsAutoEnrollment")`
- **Custom Categories:** `(device.deviceCategory -eq "Kiosk")`

## 5. Vorteile der neuen Struktur

Die Implementierung dieser Namenskonvention bietet signifikante Vorteile für den IT-Betrieb.

### 5.1 Klarheit
- Sofortige Erkennbarkeit von Umgebung, System und Objekttyp anhand des Namens.
- Klare Trennung zwischen USER- und DEVICE-Gruppen verhindert Fehlzuweisungen (z.B. Benutzerrichtlinien auf Gerätegruppen).

### 5.2 Skalierbarkeit
- Einfache und logische Erweiterung um neue Departments oder Plattformen.
- Konsistente Struktur über alle Umgebungen (PROD, TEST, PILOT) hinweg.

### 5.3 Automatisierung
- Gruppennamen folgen einer vorhersagbaren, maschinenlesbaren Logik.
- PowerShell-Skripte und Graph API-Aufrufe können Namensmuster (Regex/Wildcards) für automatisierte Prozesse nutzen.

### 5.4 Verwaltung
- Die alphabetische Sortierung in administrativen Portalen (Entra Portal, Intune) gruppiert logisch verwandte Gruppen automatisch.
- Reduzierte Gesamtkomplexität durch die Kombination von generischen Gruppen und spezifischen Assignment Filtern.

## 6. Migration der bestehenden Gruppen

Die Umstellung von Legacy-Gruppennamen auf die neue Konvention erfordert einen strukturierten Ansatz, um Unterbrechungen zu vermeiden.

### 6.1 Mapping alter zu neuer Struktur

| **Alt (Legacy)** | **Neu (Standard)** |
| :--- | :--- |
| `BASE - IAM - LIVE` | `PROD-IAM-USER-Standard` |
| `Baseline - Corporate Devices - Windows` | `PROD-MDM-DEVICE-Windows` |
| `Baseline - Autopilot Devices - User Driven` | `PROD-MDM-DEVICE-Autopilot-UserDriven` |
| `Baseline - Microsoft 365 Users` | `PROD-M365-USER-Standard` |
| `Baseline - PIM Approvers` | `PROD-IAM-APPROVER-PIM` |
| `Baseline - Excluded from MFA` | `PROD-CAP-MFA-Excluded` |

### 6.2 Migrationsstrategie

Die Migration erfolgt in drei Phasen:
1. **Phase 1 (Vorbereitung)**: Neue Gruppen nach der neuen Namenskonvention erstellen.
2. **Phase 2 (Transition)**: Mitgliedschaften (statisch oder dynamisch) schrittweise in die neuen Gruppen migrieren. Richtlinien und Apps auf die neuen Gruppen zuweisen.
3. **Phase 3 (Cleanup)**: Alte Gruppen nach erfolgreicher Validierung und einer angemessenen Beobachtungszeit entfernen.

## 7. Governance & Standards

Um die Integrität der Namenskonvention dauerhaft zu gewährleisten, gelten folgende Regeln.

### 7.1 Namenskonventions-Regeln
- Es sind ausschließlich **Großbuchstaben**, **Kleinbuchstaben** (für Lesbarkeit im Department-Segment) und **Bindestriche** zulässig.
- Keine Leerzeichen oder Sonderzeichen (wie `_`, `@`, `#`).
- Maximale Länge: 64 Zeichen (zur Kompatibilität mit diversen Systemen).
- Englische Begriffe sind zwingend zu verwenden, um internationale Konsistenz zu gewährleisten.

### 7.2 Erweiterungsregeln
- Neue System-Kategorien dürfen nur nach Abstimmung mit dem Architektur-Board eingeführt werden.
- Department-Namen müssen der offiziellen organisatorischen Struktur (HR-System) entsprechen.
- Environment-Präfixe (`TEST`, `PILOT`) sind nur bei tatsächlich getrennten oder isolierten Workloads zu verwenden.

### 7.3 Verantwortlichkeiten
- **IT-Administration / Identity Team**: Pflege der Namenskonvention und Überwachung der Einhaltung.
- **Department-Leads**: Definition der Anforderungen für neue abteilungsspezifische Gruppen.
- **Security-Team**: Validierung und Freigabe von CAP- und hochprivilegierten IAM-Gruppen.

## 8. App-Deployment Beispiele

Die Kombination aus standardisierten Gruppen und Filtern ermöglicht effiziente Deployments in Microsoft Intune.

### 8.1 Chrome für Sales-Abteilung
Bereitstellung von Google Chrome ausschließlich für Mitarbeiter im Vertrieb.
```text
App: Google Chrome
├── Assignment Group: PROD-MDM-DEVICE-Windows
├── Assignment Filter: (user.department -eq "Sales")
├── Intent: Required
└── Ergebnis: Alle Windows-Geräte, an denen ein Sales-Mitarbeiter angemeldet ist.
```

### 8.2 Corporate VPN für alle Plattformen
Bereitstellung des VPN-Profils nur für firmeneigene Geräte, unabhängig vom Betriebssystem.
```text
Assignment 1: Windows
├── Gruppe: PROD-MDM-DEVICE-Windows
├── Filter: (device.deviceOwnership -eq "Corporate")

Assignment 2: macOS  
├── Gruppe: PROD-MDM-DEVICE-MacOS
├── Filter: (device.deviceOwnership -eq "Corporate")

Assignment 3: iOS
├── Gruppe: PROD-MDM-DEVICE-iOS  
├── Filter: (device.deviceOwnership -eq "Corporate")
```

### 8.3 Finance-spezifische Anwendung
Hochsichere Bereitstellung eines SAP-Clients.
```text
App: SAP Finance Client
├── Assignment Group: PROD-MDM-DEVICE-Windows
├── Assignment Filter: (user.department -eq "Finance") AND 
                      (device.deviceOwnership -eq "Corporate")
└── Ergebnis: Nur firmeneigene Windows-Geräte von Finance-Mitarbeitern.
```

## 9. Device Category Management

Die Kategorisierung von Geräten unterstützt die Filter-Strategie und das Reporting.

### 9.1 Automatische Zuordnung über User-Department
**Empfohlener Ansatz:** Nutzung des `department`-Attributs aus Entra ID.
- Ermöglicht eine automatische Synchronisation zu Intune.
- Keine manuelle Pflege durch Administratoren erforderlich.
- Wechselt ein Benutzer die Abteilung, werden Applikationen und Richtlinien automatisch angepasst.

### 9.2 Manuelle Device Category Zuordnung
Falls eine automatische Zuordnung nicht möglich ist, erfolgt die Zuweisung über die Intune Konsole:
```text
Devices > All devices > [Gerät auswählen] > Properties > Device Category
```

### 9.3 PowerShell Automatisierung
Skript-Beispiel zur automatisierten Setzung der Device Category basierend auf dem Entra ID Department des Primary Users:

```powershell
# Device Category basierend auf User-Department setzen
$user = Get-MgUser -UserId $deviceUser
$department = $user.Department
Update-MgDeviceManagementManagedDevice -ManagedDeviceId $deviceId -DeviceCategory $department
```

---

**Status**: ✅ Konzept finalisiert  
**Version**: 1.0  
**Autor**: Manus AI (im Auftrag von CloudKnox)
