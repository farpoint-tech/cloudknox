# Azure AD Naming Convention (Groups & Users)
**Version:** 3.0 | **Organisation:** 365solution AG | **Status:** ✅ Final

---

## Management Summary

Die Etablierung einer durchdachten und konsistenten Namenskonvention für Entra ID Objekte ist ein fundamentaler Baustein für eine sichere, skalierbare und effizient verwaltbare Cloud-Infrastruktur. Dieses Dokument definiert den Standard für die Benennung von Gruppen und Benutzerkonten der 365solution AG.

Die Gruppenstruktur berücksichtigt hybride Szenarien (`AAD`/`AD`), definiert klare Baselines (`BASE` vs. `BaseEXT`) und ermöglicht eine sofortige Identifikation des Gruppenzwecks. Zusätzlich wird eine strikte Namensgebung für Benutzerkonten etabliert, um privilegierte Zugriffe und Dienstkonten klar von Standard-Benutzern zu trennen und Zero-Trust-Prinzipien auf Identitätsebene durchzusetzen.

---

## 1. Zielsetzung

Das primäre Ziel ist die Etablierung einer einheitlichen, skalierbaren und logischen Namenskonvention für Entra ID-Gruppen und Benutzer. Dies ermöglicht eine klare Struktur, vereinfacht die tägliche Verwaltung und bildet die Grundlage für automatisierte Provisionierungs- und Deprovisionierungsprozesse. Eine standardisierte Benennung minimiert Fehlkonfigurationen bei der Zuweisung von Berechtigungen, Applikationen und Richtlinien in Microsoft Intune und Conditional Access.

---

## 2. Naming Convention Struktur für Gruppen

### 2.1 Grundmuster

```text
[Hybrid]-[Scope]-[System]-[SubSystem]-[Function]-[TEST/PILOT]
```

> **Hinweis:** Nicht benötigte Segmente entfallen. Das Geo-Suffix bei `BaseEXT` ersetzt keinen Block, sondern ist Teil des Scope-Segments. Die produktive Umgebung (PROD) ist der Standard und wird nicht explizit im Namen aufgeführt.

### 2.2 Komponenten-Definition

#### Hybrid-Indikator
Nur in hybriden Umgebungen. In Cloud-Only Umgebungen entfällt dieser Block.

| Wert | Beschreibung |
| :--- | :--- |
| `AAD` | Cloud-Only Objekt (existiert nur in Entra ID) |
| `AD` | Vom lokalen Active Directory synchronisiertes Objekt |

#### Scope
| Wert | Beschreibung |
| :--- | :--- |
| `BASE` | Globale Blueprint-Grundkonfiguration — gilt für alle |
| `BaseEXT` | Globale Erweiterung — kein Geo = gilt überall |
| `BaseEXT_DE` | Länderspezifische Erweiterung (z.B. DE, AT, CH) |
| `BaseEXT_Munich` | Stadtspezifische Erweiterung |
| `BaseEXT_DACH` | Regionale Erweiterung für mehrere Länder |

> **Regel:** Fehlt das Geo-Suffix → gilt die Gruppe global.

#### System
| Wert | Beschreibung |
| :--- | :--- |
| `IAM` | Identity & Access Management — immer User-bezogen |
| `MDM` | Mobile Device Management — immer Device-bezogen |
| `M365` | Microsoft 365 Services (Teams, SharePoint, Lizenzen) |
| `CAP` | Conditional Access Policies — folgt separatem Schema |

#### SubSystem (optional)
| Wert | Beschreibung |
| :--- | :--- |
| `PIM` | Privileged Identity Management |
| `ADM` | Administrative Konten |

#### Function (3-Zeichen Code)
Für IAM und M365 Systeme definiert dies die Abteilung oder Funktion. Für MDM Systeme definiert dieser Block primär die OS-Plattform (z.B. `WIN`, `MAC`). Bei PIM-Gruppen wird hier abweichend von der 3-Zeichen-Regel der volle Rollenname (z.B. `GlobalAdmin`) verwendet.

| Code | Bedeutung | Beschreibung |
| :--- | :--- | :--- |
| `STD` | Standard | Standard-Konfiguration |
| `ALL` | All | Alle Objekte der Kategorie |
| `HRx` | Human Resources | Human Resources |
| `FIN` | Finance | Finanzen |
| `ITx` | IT | IT-Abteilung |
| `SAL` | Sales | Vertrieb |
| `LEG` | Legal | Rechtsabteilung |
| `MGT` | Management | Geschäftsführung |
| `SMB` | Shared Mailbox | Shared Mailbox Zugriff |
| `DST` | Distribution List | Verteilergruppe |
| `TMS` | Teams | Microsoft Teams |
| `SPO` | SharePoint Online | SharePoint Online |
| `LIC` | License | Lizenzzuweisung |
| `APR` | Approver | PIM Genehmiger |
| `ELG` | Eligible | PIM Eligible Assignment |
| `ACT` | Active | PIM Active Assignment |
| `WIN` | Windows | Windows OS (für MDM) |
| `MAC` | macOS | macOS (für MDM) |
| `IOS` | iOS | Apple iOS (für MDM) |
| `AND` | Android | Android OS (für MDM) |

#### Environment-Suffix (optional)
Wird ans **Ende** des Gruppennamens angehängt — kennzeichnet eine Test- oder Pilotversion einer bestehenden Gruppe. Fehlt das Suffix, handelt es sich um eine produktive Gruppe.

| Wert | Beschreibung |
| :--- | :--- |
| `TEST` | Testgruppe ohne produktiven Impact |
| `PILOT` | Kontrollierter Rollout in der Produktion |

---

## 3. Naming Convention für Benutzerkonten

| Prefix | Typ | Beschreibung | Beispiel |
| :--- | :--- | :--- | :--- |
| *(kein Prefix)* | Standard User | Reguläres Konto, keine administrativen Berechtigungen | `m.mustermann@365solution.de` |
| `adm-` | Admin User | Dediziertes Admin-Konto, idealerweise mit PIM | `adm-m.mustermann@365solution.de` |
| `srv-` | Service Account | Dienstkonten für Apps, Automation, Drucker. Kein interaktiver Login | `srv-backup@365solution.de` |
| `ext-` | External Member | Externe B2B-Konten die als Member provisioniert werden | `ext-m.mustermann@365solution.de` |
| `tst-` | Test Account | Testkonten ohne produktiven Zugriff | `tst-m.mustermann@365solution.de` |
| `res-` | Resource Account | Funktionale Konten für Räume oder Equipment | `res-meetingroom-munich@365solution.de` |
| `agt-` | Agent Account | Konten für AI Agents oder Copilot Automations | `agt-copilot-hrx@365solution.de` |
| `smb-` | Shared Mailbox | Funktionale Postfächer ohne persönliche Zuordnung | `smb-support@365solution.de` |

### Break-Glass Konten
Break-Glass Notfallkonten erhalten **keinen sprechenden Namen**. Der Kontoname basiert auf der Seriennummer des zugewiesenen YubiKeys (z.B. `28491837@365solution.de`). Dies verhindert gezielte Angriffe auf Notfallkonten.

### Kiosk-Szenarien
Kiosk-Arbeitsplätze erhalten **kein dediziertes Benutzerkonto**. Der Zugriff wird ausschließlich über das Gerät abgebildet — via Intune Autopilot Self-Deploying Mode mit gerätegebundenem Kiosk-Profil. Authentifizierung und Zugriffskontrolle erfolgen auf Device-Ebene, nicht auf User-Ebene.

---

## 4. Gruppenkategorien & Praxisbeispiele

### 4.1 Cloud-Only vs. Hybrid (IAM)

| Gruppenname | Beschreibung |
| :--- | :--- |
| `BASE-IAM-STD` | Cloud-Only: Globale Blueprint-Standardgruppe |
| `AAD-BASE-IAM-STD` | Hybrid: Cloud-Only Standardgruppe |
| `AD-BASE-IAM-STD` | Hybrid: AD-synchronisierte Standardgruppe |

### 4.2 Scope & Geo Beispiele

| Gruppenname | Beschreibung |
| :--- | :--- |
| `BaseEXT-IAM-HRx` | Globale Erweiterung HR (kein Geo = gilt überall) |
| `BaseEXT_DE-IAM-HRx` | HR-Benutzer Deutschland |
| `BaseEXT_AT-IAM-HRx` | HR-Benutzer Österreich |
| `BaseEXT_DACH-IAM-HRx` | HR-Benutzer DACH-Region |
| `BaseEXT_Munich-MDM-WIN` | Windows-Geräte Standort München |

### 4.3 Mobile Device Management (MDM)

| Gruppenname | Beschreibung |
| :--- | :--- |
| `BASE-MDM-WIN` | Alle Windows-Geräte der 365solution AG |
| `BASE-MDM-MAC` | Alle macOS-Geräte der 365solution AG |
| `BASE-MDM-IOS` | Alle iOS-Geräte der 365solution AG |
| `BASE-MDM-AND` | Alle Android-Geräte der 365solution AG |
| `BASE-MDM-APL-USR` | Autopilot User-Driven Deployments |
| `BASE-MDM-WIN-TEST` | Testgruppe neue Windows-Konfiguration |
| `BASE-MDM-WIN-PILOT` | Pilotgruppe Windows-Rollout |
| `BaseEXT_Munich-MDM-WIN` | Windows-Geräte Standort München |

### 4.4 Identity & Access Management (IAM)

| Gruppenname | Beschreibung |
| :--- | :--- |
| `BASE-IAM-STD` | Alle Standard-Benutzer der 365solution AG |
| `BASE-IAM-ADM-ITx` | Admin-Konten (`adm-`) des IT-Teams |
| `BASE-IAM-PIM-ELG-GlobalAdmin` | PIM Eligible Assignment Global Admin |
| `BASE-IAM-PIM-ACT-GlobalAdmin` | PIM Active Assignment Global Admin |
| `BASE-IAM-PIM-APR-GlobalAdmin` | Genehmiger für Global Admin Aktivierung |
| `BASE-IAM-PIM-ELG-GlobalAdmin-TEST` | Testgruppe PIM Eligible Global Admin |
| `BaseEXT_DE-IAM-HRx` | HR-Benutzer Deutschland |
| `BaseEXT_DACH-IAM-FIN` | Finance-Benutzer DACH-Region |

### 4.5 Microsoft 365 (M365)

| Gruppenname | Beschreibung |
| :--- | :--- |
| `BASE-M365-LIC-STD` | Standard M365 Lizenzzuweisung |
| `BASE-M365-TMS-STD` | Standard Teams Zuweisung |
| `BASE-M365-SPO-STD` | Standard SharePoint Zuweisung |
| `BASE-M365-SMB-HRx` | Shared Mailbox HR |
| `BASE-M365-SMB-FIN` | Shared Mailbox Finance |
| `BaseEXT_DE-M365-SPO-HRx` | SharePoint HR Deutschland |
| `BaseEXT-M365-DST-SAL` | Globale Verteilergruppe Sales |

---

## 5. Dynamic Membership Rules

Alle Entra ID Gruppen der 365solution AG werden wo möglich als **Dynamic Groups** konfiguriert. Dies stellt sicher dass Mitgliedschaften automatisch durch Entra ID gepflegt werden und manuelle Eingriffe auf Ausnahmen reduziert werden.

### 5.1 Grundprinzip

| Gruppentyp | Membership |
| :--- | :--- |
| `BASE-*` | Dynamic — Rule basiert auf User/Device Attributen |
| `BaseEXT_[Geo]-*` | Dynamic — Rule kombiniert Geo + weitere Attribute |
| `BaseEXT-*` | Dynamic — Rule ohne Geo-Einschränkung |
| Break-Glass Konten | Static — manuelle Zuweisung, keine Dynamic Rule möglich |
| PIM Gruppen | Static — Mitgliedschaft wird über PIM Workflow gesteuert |

### 5.2 User-basierte Rules (IAM)

| Gruppe | Dynamic Membership Rule |
| :--- | :--- |
| `BASE-IAM-STD` | `(user.userType -eq "Member")` |
| `BASE-IAM-ADM-ITx` | `(user.userPrincipalName -startsWith "adm-")` |
| `BaseEXT-IAM-HRx` | `(user.department -eq "HR")` |
| `BaseEXT_DE-IAM-HRx` | `(user.country -eq "DE") AND (user.department -eq "HR")` |
| `BaseEXT_DACH-IAM-FIN` | `(user.country -eq "DE" OR user.country -eq "AT" OR user.country -eq "CH") AND (user.department -eq "Finance")` |
| `BaseEXT-IAM-EXT` | `(user.userPrincipalName -startsWith "ext-")` |

### 5.3 Device-basierte Rules (MDM)

| Gruppe | Dynamic Membership Rule |
| :--- | :--- |
| `BASE-MDM-WIN` | `(device.deviceOSType -eq "Windows")` |
| `BASE-MDM-MAC` | `(device.deviceOSType -eq "MacOS")` |
| `BASE-MDM-IOS` | `(device.deviceOSType -eq "IOS")` |
| `BASE-MDM-AND` | `(device.deviceOSType -eq "Android")` |
| `BASE-MDM-APL-USR` | `(device.devicePhysicalIds -any _ -eq "[OrderID]:AutopilotUserDriven")` |
| `BaseEXT_Munich-MDM-WIN` | `(device.deviceOSType -eq "Windows") AND (device.devicePhysicalIds -any _ -eq "[OrderID]:Munich")` |
| `BaseEXT_Munich-MDM-APL` | `(device.devicePhysicalIds -any _ -eq "[OrderID]:Munich")` |

### 5.4 M365-basierte Rules

| Gruppe | Dynamic Membership Rule |
| :--- | :--- |
| `BASE-M365-LIC-STD` | `(user.userType -eq "Member")` |
| `BASE-M365-SMB-HRx` | `(user.department -eq "HR")` |
| `BaseEXT_DE-M365-SPO-HRx` | `(user.country -eq "DE") AND (user.department -eq "HR")` |

### 5.5 Statische Gruppen (Ausnahmen)

Folgende Gruppen werden bewusst als statische Gruppen geführt:

- **Break-Glass Konten** — manuelle Zuweisung, keine Dynamic Rule möglich
- **PIM Gruppen** (`ELG`, `ACT`, `APR`) — Mitgliedschaft wird ausschließlich über den PIM Workflow gesteuert

---

## 6. Vorteile der Struktur

### 6.1 Klarheit & Lesbarkeit
- Sofortige Erkennbarkeit von Scope, System, Funktion und Geo-Zugehörigkeit durch konsistentes Namensschema
- 3-Zeichen Function-Codes ermöglichen schnelles Scannen auch bei langen Gruppenlisten
- `BASE` vs. `BaseEXT` Unterscheidung auf den ersten Blick erkennbar — kein Standard wird versehentlich als Erweiterung behandelt

### 6.2 Zero Trust
- Klare Trennung von Standard- (`STD`), Admin- (`adm-`), Service- (`srv-`) und externen Konten (`ext-`) auf Identitätsebene
- Break-Glass Konten ohne sprechenden Namen schützen Notfallzugänge vor gezielten Angriffen
- Kiosk-Szenarien werden konsequent auf Device-Ebene abgebildet — kein geteiltes Benutzerkonto

### 6.3 Skalierbarkeit
- Einfache Erweiterung um neue Geo-Regionen via `BaseEXT_[Geo]` ohne Strukturänderung
- Neue Abteilungen oder Funktionen durch Ergänzung der 3-Zeichen Code Tabelle
- Konsistente Struktur über Cloud-Only und Hybrid-Umgebungen hinweg (`AAD`/`AD`)

### 6.4 Automatisierung
- Dynamic Membership Rules befüllen Gruppen automatisch — kein manueller Pflegeaufwand
- Maschinenlesbare, vorhersagbare Namensmuster für PowerShell & Graph API
- User-Prefix (`adm-`, `srv-`, `ext-` etc.) direkt als Basis für Dynamic Rules nutzbar

### 6.5 Wartbarkeit
- `ARCHIVE-` Präfix ermöglicht sauberen Lifecycle ohne sofortige Löschung
- PIM Gruppen klar als statische Gruppen definiert — kein Risiko ungewollter Dynamic Rule Eingriffe
- Namenskonvention ist selbstdokumentierend — reduziert Abhängigkeit von externer Dokumentation

---

## 7. Migration

### 7.1 Voraussetzungen

- Alle User-Attribute in Entra ID sind gepflegt (`country`, `department`, `userPrincipalName`)
- Dynamic Group Feature ist im Tenant lizenziert (Entra ID P1 oder P2)
- Bestehende Gruppen und ihre Zuweisungen sind dokumentiert

### 7.2 Risikohinweise

- **Dynamic Rules** erst nach vollständiger Validierung der User-Attribute aktivieren — unvollständige Attribute führen zu falscher Gruppenbefüllung
- **PIM Gruppen** nie als Dynamic Group konfigurieren — Mitgliedschaft muss kontrolliert bleiben
- **Break-Glass Konten** vom Migrationsprozess ausschliessen — manuelle Pflege bleibt bestehen

### 7.3 Durchführung

Die Migration kann eigenständig durch das interne IT-Team der 365solution AG durchgeführt werden oder in Begleitung des Providers. Bei komplexen Umgebungen, bestehenden Hybrid-Strukturen oder fehlenden internen Ressourcen empfiehlt sich eine begleitete Migration durch den Provider.

**Phase 1 — Vorbereitung**
- [ ] Neue Gruppen nach Konvention erstellen
- [ ] Dynamic Membership Rules konfigurieren und Mitgliedschaft validieren
- [ ] Benutzerkonten nach neuem Prefix-Schema provisionieren (`adm-`, `srv-`, `ext-` etc.)

**Phase 2 — Transition**
- [ ] Bestehende Zuweisungen (Intune, CAP, M365) schrittweise auf neue Gruppen umstellen
- [ ] Parallelbetrieb alter und neuer Gruppen während der Übergangsphase sicherstellen
- [ ] Validierung je Zuweisung vor Abschaltung der alten Gruppe durchführen

**Phase 3 — Validierung**
- [ ] Funktionalität aller Zuweisungen auf neuen Gruppen bestätigen
- [ ] Dynamic Rules auf korrekte Befüllung prüfen
- [ ] Alte Gruppen mit `ARCHIVE-` Präfix versehen — noch keine Löschung

**Phase 4 — Cleanup**
- [ ] Archivierte Gruppen nach definierter Karenzzeit (empfohlen: 90 Tage) im regulären IAM-Review entfernen
- [ ] Abschlussdokumentation aktualisieren

---

## 8. Governance & Standards

**Schreibweise als funktionales Unterscheidungsmerkmal:**
- `BASE` — Vollständig in Großbuchstaben, kennzeichnet die globale Blueprint-Grundkonfiguration
- `BaseEXT` — CamelCase, kennzeichnet bewusst eine Erweiterung. Die gemischte Schreibweise signalisiert sofort: *"Das ist kein Standard, sondern eine Ergänzung."*
- Alle weiteren Segmente (`IAM`, `MDM`, `PIM`, `ADM` etc.) — konsequent in **Großbuchstaben**
- Function-Codes — immer **3 Zeichen**, konsequent in **Großbuchstaben** (Ausnahme: `HRx`, `ITx` als bewusste Platzhalter)

**Trennzeichen:**
- Segmente → **Bindestrich** (`-`)
- Geo-Suffix bei BaseEXT → **Unterstrich** (`_`): `BaseEXT_DE`, `BaseEXT_Munich`
- Keine Leerzeichen oder Sonderzeichen (`@`, `#`, `!`)

**Sprache:** Englische Begriffe sind verbindlich. Ausnahme: Eigennamen bei Geo-Angaben (`BaseEXT_Munich` ist zulässig).

**Lifecycle:**
- Aktive Gruppen → normale Benennung
- Nicht mehr genutzte Gruppen → Präfix `ARCHIVE-` (z.B. `ARCHIVE-BASE-IAM-STD`)
- Entfernung nach Karenzzeit im regulären IAM-Review

**Verantwortlichkeit:** Das IAM-Team der 365solution AG überwacht die Einhaltung der Konvention und ist alleinige Instanz für Ausnahmen.

---

**Version:** 3.0 | **Autor:** IAM Team — 365solution AG
