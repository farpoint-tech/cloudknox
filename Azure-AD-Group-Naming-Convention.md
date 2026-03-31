# Azure AD Naming Convention (Groups & Users)

## Management Summary

Die Etablierung einer durchdachten und konsistenten Namenskonvention für Azure AD (Entra ID) Objekte ist ein fundamentaler Baustein für eine sichere, skalierbare und effizient verwaltbare Cloud-Infrastruktur. Dieses Dokument definiert den Standard für die Benennung von Gruppen und Benutzerkonten innerhalb der Organisation. 

Die eingeführte Gruppen-Struktur berücksichtigt hybride Szenarien (Unterscheidung zwischen `AAD` und `AD`), definiert klare Baselines (`BASE` vs. `BaseEXT`) und ermöglicht eine sofortige Identifikation des Gruppenzwecks durch das Muster `[Hybrid]-[Scope]-[Environment]-[System]-[Object]-[Platform]-[Function]`. Zusätzlich wird eine strikte Namensgebung für Benutzerkonten (`username`, `adm`, `srv`) etabliert, um privilegierte Zugriffe und Dienstkonten klar von Standard-Benutzern zu trennen und Zero-Trust-Prinzipien auf Identitätsebene durchzusetzen.

## 1. Zielsetzung

Das primäre Ziel dieser Richtlinie ist die Etablierung einer einheitlichen, skalierbaren und logischen Namenskonvention für Entra ID-Gruppen und Benutzer. Dies ermöglicht eine klare Struktur, vereinfacht die tägliche Verwaltung und bildet die Grundlage für automatisierte Provisionierungs- und Deprovisionierungsprozesse. Eine standardisierte Benennung minimiert Fehlkonfigurationen bei der Zuweisung von Berechtigungen, Applikationen und Richtlinien in Microsoft Intune und Conditional Access.

## 2. Naming Convention Struktur für Gruppen

Die Namenskonvention folgt einem strikten, modularen Aufbau, der alle relevanten Attribute einer Gruppe im Namen abbildet.

### 2.1 Grundmuster

```text
[Hybrid-Indikator]-[Scope]-[Environment]-[System]-[Object]-[Platform]-[Function/Department]
```
*Hinweis: Nicht benötigte Blöcke (z.B. der Hybrid-Indikator in reinen Cloud-Umgebungen oder die Plattform bei IAM-Gruppen) entfallen, das logische Grundmuster bleibt jedoch bestehen.*

### 2.2 Komponenten-Definition

Jedes Segment des Namens erfüllt einen spezifischen Zweck und nutzt vordefinierte Werte.

#### **Hybrid-Indikator (Umgebungstyp)**
Wird **ausschließlich** in hybriden Umgebungen verwendet, um die Herkunft des Objekts auf einen Blick zu klären. In reinen Cloud-Only Umgebungen entfällt dieser Block komplett.
- `AAD` - Cloud-Only (Objekt existiert nur in der Cloud / Entra ID)
- `AD` - Lokales AD (Objekt stammt aus dem lokalen Active Directory und wird synchronisiert)

#### **Scope (Blueprint & Gültigkeitsbereich)**
Definiert, ob es sich um eine Standard-Konfiguration oder eine spezifische Erweiterung handelt.
- `BASE` - Baseline. Die Blueprint-Grundkonfiguration in Entra ID und Intune, die global für alle Gruppen gilt.
- `BaseEXT` - Extension. Eine Erweiterung, die nicht den Standard definiert oder eine firmenspezifische Definition einleitet.
- `BaseEXT_[Standort/Land]` - Standortspezifische Erweiterung (z.B. `BaseEXT_DE`, `BaseEXT_Berlin`). **Wichtig:** Fehlt der Standort explizit (also nur `BaseEXT`), gilt die Konfiguration immer als **Global**.

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

## 3. Naming Convention für Benutzerkonten (User Accounts)

Zur klaren Identifikation von Berechtigungen und zur Erhöhung der Sicherheit (Vermeidung von Standing Privileges auf Standard-Konten) gilt folgende strikte Namenskonvention für Benutzerkonten in Entra ID:

| User-Typ | Namensmuster | Beschreibung |
| :--- | :--- | :--- |
| **Standard User** | `[username]` | Reguläres Konto für die tägliche Arbeit (E-Mail, Teams, Dokumente). Besitzt **keine** administrativen Berechtigungen. Beispiel: `mmustermann@domain.com` |
| **Admin User** | `adm-[username]` | Dediziertes administratives Konto. Wird ausschließlich für administrative Tätigkeiten genutzt (idealerweise in Kombination mit PIM). Beispiel: `adm-mmustermann@domain.com` |
| **Service User** | `srv-[servicename]` | Dienstkonten für Applikationen, Automatisierungen oder Skripte. Diese Konten sind von interaktiven Logins ausgeschlossen oder durch strenge Conditional Access Richtlinien geschützt. Beispiel: `srv-backup@domain.com` |

## 4. Gruppenkategorien & Praxisbeispiele

Die folgenden Beispiele veranschaulichen die Anwendung der Namenskonvention in der Praxis.

### 4.1 Cloud-Only vs. Hybrid Beispiele (IAM)

| Gruppenname | Beschreibung |
| :--- | :--- |
| `BASE-PROD-IAM-USER-Standard` | **Cloud-Only Umgebung:** Globale Blueprint-Standardgruppe für Benutzer. |
| `AAD-BASE-PROD-IAM-USER-Standard` | **Hybrid Umgebung:** Cloud-Only Standard-Benutzergruppe. |
| `AD-BASE-PROD-IAM-USER-Standard` | **Hybrid Umgebung:** Vom lokalen AD synchronisierte Standard-Benutzergruppe. |

### 4.2 Scope & Standort Beispiele (BaseEXT)

| Gruppenname | Beschreibung |
| :--- | :--- |
| `BaseEXT-PROD-MDM-DEVICE-Windows-Sales` | Globale Erweiterung (da kein Standort angegeben) für Windows Sales-Geräte. |
| `BaseEXT_DE-PROD-MDM-DEVICE-Windows-Sales` | Standortspezifische Erweiterung für Deutschland. |
| `BaseEXT_Berlin-PROD-MDM-DEVICE-Windows` | Standortspezifische Erweiterung für den Standort Berlin. |

### 4.3 Mobile Device Management (MDM)

Gruppen für die Zuweisung von Intune-Profilen, Compliance-Richtlinien und Applikationen.

| Gruppenname | Beschreibung |
| :--- | :--- |
| `BASE-PROD-MDM-DEVICE-Windows` | Blueprint-Gruppe: Alle produktiven Windows-Geräte. |
| `BASE-PROD-MDM-DEVICE-MacOS` | Blueprint-Gruppe: Alle produktiven macOS-Geräte. |
| `BASE-PROD-MDM-DEVICE-Autopilot-UserDriven` | Autopilot-Profile für User-Driven Deployments. |

### 4.4 Conditional Access Policies (CAP)

Gruppen für die gezielte Steuerung (Einschluss/Ausschluss) von Conditional Access Richtlinien.

| Gruppenname | Beschreibung |
| :--- | :--- |
| `BASE-PROD-CAP-MFA-Excluded` | Accounts, die temporär von MFA ausgenommen sind (Break-Glass Accounts). |
| `BaseEXT-PROD-CAP-Unrestricted-External` | Globale Erweiterung für externe Accounts mit speziellen Zugriffsanforderungen. |

## 5. Assignment Filter Strategie

Um die Anzahl der Gruppen (Group Sprawl) zu minimieren und die Berechnungszeiten in Azure AD zu optimieren, wird intensiv auf **Assignment Filter** in Intune und Conditional Access gesetzt, anstatt für jede Kombination eine eigene Gruppe zu erstellen.

### 5.1 Corporate vs. BYOD Handling

Die Unterscheidung zwischen firmeneigenen und privaten Geräten erfolgt **nicht über Gruppennamen**, sondern dynamisch über Device Properties.

- **Corporate Devices:** `(device.deviceOwnership -eq "Corporate")`
- **BYOD Devices:** `(device.deviceOwnership -eq "Personal")`

### 5.2 Department-basierte Filter

Abteilungsspezifische Zuweisungen erfolgen primär über das `department`-Attribut des Benutzers in Entra ID.

- **Sales Department:** `(user.department -eq "Sales")`
- **Finance Department:** `(user.department -eq "Finance")`

### 5.3 Kombinierte Filter-Beispiele

Durch die Kombination von Attributen lassen sich hochgranulare Zuweisungen ohne zusätzliche Gruppen realisieren.

**Corporate Windows Sales:**
```text
(device.deviceOwnership -eq "Corporate") AND 
(device.deviceOSType -eq "Windows") AND 
(user.department -eq "Sales")
```

## 6. Vorteile der neuen Struktur

Die Implementierung dieser Namenskonvention bietet signifikante Vorteile für den IT-Betrieb.

### 6.1 Klarheit & Sicherheit
- Sofortige Erkennbarkeit von Herkunft (Hybrid), Scope (Blueprint vs. Extension), Umgebung und System.
- Klare Trennung von Standard-Benutzern (`username`), Administratoren (`adm`) und Service-Accounts (`srv`) reduziert das Risiko von Privilege Escalation.

### 6.2 Skalierbarkeit
- Einfache und logische Erweiterung um neue Standorte via `BaseEXT_[Standort]`.
- Konsistente Struktur über alle Umgebungen (PROD, TEST) und Bereitstellungsmodelle (Cloud-Only, Hybrid) hinweg.

### 6.3 Automatisierung
- Gruppennamen folgen einer vorhersagbaren, maschinenlesbaren Logik.
- PowerShell-Skripte und Graph API-Aufrufe können Namensmuster (Regex/Wildcards) für automatisierte Prozesse nutzen.

## 7. Migration der bestehenden Gruppen

Die Umstellung von Legacy-Gruppennamen auf die neue Konvention erfordert einen strukturierten Ansatz.

### 7.1 Migrationsstrategie
1. **Phase 1 (Vorbereitung)**: Neue Gruppen nach der neuen Namenskonvention (inkl. `BASE`/`BaseEXT` und ggf. `AAD`/`AD`) erstellen. Benutzerkonten (Admins/Services) nach neuem Schema provisionieren.
2. **Phase 2 (Transition)**: Mitgliedschaften schrittweise in die neuen Gruppen migrieren. Richtlinien und Apps auf die neuen Gruppen zuweisen.
3. **Phase 3 (Cleanup)**: Alte Gruppen nach erfolgreicher Validierung entfernen.

## 8. Governance & Standards

Um die Integrität der Namenskonvention dauerhaft zu gewährleisten, gelten folgende Regeln:

- Es sind ausschließlich **Großbuchstaben**, **Kleinbuchstaben** und **Bindestriche** (bzw. Unterstriche bei `BaseEXT_Standort`) zulässig.
- Keine Leerzeichen oder Sonderzeichen (wie `@`, `#`).
- Englische Begriffe sind zwingend zu verwenden, um internationale Konsistenz zu gewährleisten (Ausnahme: Eigennamen bei Standorten).
- **Verantwortlichkeit:** Das Identity & Access Management Team überwacht die Einhaltung der Konvention.

---

**Status**: ✅ Konzept finalisiert  
**Version**: 2.0  
**Autor**: Manus AI (im Auftrag von CloudKnox)
