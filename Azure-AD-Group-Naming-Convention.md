# Konzept zur Benennungslogik für Microsoft Entra ID Gruppen und Benutzerkonten

**Version:** 4.2
**Organisation:** 365solution AG
**Status:** Arbeitsstand / Entwurf

## Management Summary

Dieses Dokument beschreibt das konzeptionelle Zielbild für die Benennung von Gruppen und Benutzerkonten in Microsoft Entra ID. Es ist bewusst nicht als starre Richtlinie oder operative Arbeitsanweisung formuliert, sondern als gemeinsames Strukturmodell, das die gewünschte Leserichtung, die innere Logik und die spätere Anwendbarkeit im Betrieb erklärt.

Das Ziel ist, dass sowohl neue als auch bestehende Administratoren Namen künftig nicht nur lesen, sondern inhaltlich sofort einordnen können:
- Gehört die Gruppe zur globalen Basiskonfiguration (`BASE`) oder handelt es sich um eine gezielte Erweiterung davon (`BAEX`)?
- In welchem Systembereich bewege ich mich (Identität, Geräte, Services)?
- Bezieht sich die Gruppe auf ein Land, eine Region oder einen Standort?
- Welcher fachliche Kontext ist gemeint?
- Welche konkrete Funktion bildet die Gruppe ab?

Die Benennung soll damit nicht nur formal konsistent sein, sondern vor allem verständlich, lesbar und in der Praxis anschlussfähig.

### Abgrenzung des Dokuments
Dieses Konzept beantwortet ausschließlich die Frage: *Wie heißt ein Objekt, und wie erkenne ich anhand des Namens, was es ist?*
Operative Fragestellungen — etwa wie eine Gruppe technisch konfiguriert wird, welche Policies greifen, wer verantwortlich ist oder wie der Lebenszyklus gesteuert wird — sind bewusst nicht Gegenstand dieses Dokuments. Sie werden in separaten Konzepten behandelt (siehe Kapitel 16).

---

## 1. Zielbild und Rahmenbedingungen

Das Konzept verfolgt das Ziel, Gruppen- und Kontonamen so aufzubauen, dass sie in Entra ID, Intune, Microsoft 365, PowerShell, Graph-Auswertungen und im täglichen Administrationsbetrieb eine klare Leserichtung haben.

Im Vordergrund steht nicht die rein technische Syntax, sondern die Frage:
**Wie denken wir die Struktur, und wie lesen wir einen Namen inhaltlich von links nach rechts?**

Die gewünschte Grundidee ist:
1. Der Anfang eines Namens zeigt den strukturellen Rahmen.
2. Die Mitte beschreibt Einordnung und Kontext.
3. Das Ende zeigt die konkrete Funktion oder eine besondere Ausprägung wie Test oder Pilot.

### Hinweis zur Länge und Lesbarkeit (Best Practice)
Die Namensstruktur ist auf Eindeutigkeit optimiert. Es wird jedoch empfohlen, die Namen so kurz wie möglich und nur so lang wie nötig zu halten.
- In Entra ID sind bis zu 256 Zeichen möglich.
- In Teams- oder SharePoint-Ansichten werden Namen jedoch oft nach ca. 30–40 Zeichen optisch abgeschnitten.
- Bei einem eventuellen Rückschreiben ins lokale AD (Group Writeback) ist das sAMAccountName-Limit von 20 Zeichen zu beachten.

Daher gilt: Segmente wie der Qualifier werden nur genutzt, wenn sie zur Unterscheidung zwingend notwendig sind.

### Beispielhafte Leserichtung
- `BASE_IAM-DE-HRx-DEF`
- `BASE_MDM-MUCx-WIN-DEF`
- `BAEX_365-DACH-SAL-TMS`

Bereits beim ersten Blick wird erkennbar:
- Ist es `BASE` oder `BAEX`?
- Ist es `IAM`, `MDM` oder `365`?
- Welcher Geo-Bezug ist enthalten?
- Welcher fachliche Kontext liegt vor?
- Welche Funktion ist konkret gemeint?

---

## 2. Grundgedanke der Struktur

Die Benennungslogik orientiert sich an einem wiederkehrenden Aufbau, der von links nach rechts gelesen wird.

### Konzeptionelles Grundmuster
```text
[LAD_|ENT_][BASE|BAEX]_[IAM|MDM|365]-[Geo]-[Context]-[Function]-[Qualifier]_[TEST|PILOT]
```

Nicht jedes Segment muss in jedem Fall verwendet werden. Wichtiger als die vollständige Länge ist die lesbare, immer wiederkehrende Struktur.

### Die gedachte Leserichtung
1. **Hybrid-Kontext** (optional, nur in hybriden Umgebungen)
2. **Scope** / Ausgangspunkt
3. **Systembereich**
4. **Geo-Bezug**
5. **Fachlicher oder technischer Kontext**
6. **Konkrete Funktion**
7. **Optionale Spezifizierung** (Qualifier)
8. **Optionale Umgebungskennzeichnung**

### Beispiele
- `BASE_IAM-DE-HRx-DEF`
- `ENT_BASE_IAM-DE-HRx-DEF`
- `LAD_BASE_IAM-DE-ITx-ADM`
- `BASE_MDM-WIEN-APL-USR`
- `BAEX_365-DACH-SAL-TMS`

---

## 3. Die gedachte Logik von links nach rechts

### 3.1 Hybrid-Kontext (optional)
In hybriden Szenarien kann zu Beginn erkennbar gemacht werden, aus welchem technischen Kontext ein Objekt stammt. Hierfür stehen optional die Präfixe:

- `ENT_` — Entra ID, cloud-nativ (ehemals Azure AD / AAD)
- `LAD_` — lokales Active Directory, on-premises synchronisiert

Beide Codes sind konsequent dreistellig und vermeiden das veraltete Naming-Schema `AAD`. In reinen Cloud-Only-Umgebungen oder wo diese Unterscheidung keinen Mehrwert bringt, entfällt das Präfix vollständig. Vor `BASE` bzw. `BAEX` kommt ausschließlich `ENT_` oder `LAD_` — kein anderer Präfix.

### 3.2 Scope: BASE und BAEX
Der eigentliche strukturelle Rahmen beginnt mit dem Scope:

- `BASE` — globale Basiskonfiguration, gilt für alle (4-stellig)
- `BAEX` — gezielte Erweiterung der Basiskonfiguration, z. B. für bestimmte Regionen, Länder oder Standorte (4-stellig)

Beide Codes sind konsequent vierstellig, was das Namensbild kompakt und gleichmäßig hält.

### 3.3 Systembereich: IAM, MDM und 365
Nach `BASE_` oder `BAEX_` folgt der Bereich, in dem sich die Gruppe bewegt.

- `IAM` — Identity & Access Management: Benutzer, Rollen, App-Zugriffe
- `MDM` — Mobile Device Management: Geräte, Plattformen, Autopilot
- `365` — Microsoft 365 Services: Lizenzen, Teams, SharePoint

---

## 4. Geo als zweiter Orientierungspunkt

Nach dem System folgt der Geo-Bezug zur räumlichen oder organisatorischen Verortung. Die verwendeten Codes orientieren sich an international etablierten Normen.

- **Globale Gültigkeit (`GLOB`)**: Wenn eine Gruppe nicht auf einen Standort beschränkt ist, sondern unternehmensweit gilt.
- **Länder (2-stellig, z.B. `DE`, `AT`, `CH`)**: Nach ISO 3166-1 Alpha-2.
- **Regionen (4-stellig, z.B. `DACH`, `EMEA`)**: Regionale Zusammenfassungen.
- **Städte / Standorte (4-stellig, z.B. `MUCx`, `BERx`, `WIEN`)**: Orientiert am UN/LOCODE-Standard. Wenn ein Standortcode nur drei Zeichen umfasst, wird er mit einem kleinen `x` ergänzt (Füller).

---

## 5. Context als eigentliche Fachlogik

Der Context beantwortet die Frage: In welchem fachlichen oder technischen Zusammenhang bewegt sich die Gruppe? Die Werte sind in der Regel 3-stellig.

- **Im IAM-Kontext**: Meist fachlich oder organisatorisch geprägt (`HRx`, `ITx`, `FIN`, `SAL`, `LEG`, `MGT`, `PIM`, `DEF`).
- **Im MDM-Kontext**: Hier ist die **Plattform ein Pflichtfeld** (siehe Kapitel 6).
- **Im 365-Kontext**: Meist der fachliche Zielbereich (`HRx`, `FIN`, `SAL`, `DEF`).

---

## 6. Plattform-Tag im MDM-Context (Pflichtfeld)

Im MDM-Bereich (Mobile Device Management) ist die Angabe der Plattform im Context-Segment ein **Pflichtfeld** — mit einer einzigen definierten Ausnahme. Dies stellt sicher, dass Intune-Policies und Konfigurationen sofort der richtigen Zielplattform zugeordnet werden können.

| Situation | Context-Segment | Beispiel |
| :--- | :--- | :--- |
| Policy gilt nur für Windows | `WIN` | `BASE_MDM-GLOB-WIN-DEF` |
| Policy gilt nur für macOS | `MAC` | `BASE_MDM-GLOB-MAC-DEF` |
| Policy gilt nur für iOS/iPadOS | `IOS` | `BASE_MDM-GLOB-IOS-DEF` |
| Policy gilt nur für Android | `AND` | `BASE_MDM-GLOB-AND-DEF` |
| Policy gilt für Autopilot (plattformübergreifend) | `APL` | `BASE_MDM-GLOB-APL-USR` |
| **Ausnahme:** Policy gilt explizit für alle Devices | `DEF` oder `GLOB` | `BASE_MDM-GLOB-DEF-USR` |

---

## 7. Function als konkrete Ausprägung

Die Function beschreibt, was die Gruppe konkret tut oder abbildet. Die Werte sind in der Regel 3-stellig.

- `DEF` — Default-Ausprägung
- `ADM` — Administrative Konten
- `EAP` — Enterprise Application / SSO-Zugriff
- `ELG` / `ACT` / `APR` — PIM-Stati
- `USR` — User-Driven (z.B. bei MDM)
- `LIC` — Lizenzzuweisung
- `TMS` — Teams
- `SPO` — SharePoint Online
- `SMB` — Shared Mailbox
- `DST` — Distribution List
- `UPD` — Windows/macOS Update Ring

**Enterprise Applications (EAP):** Wenn eine Gruppe im IAM-Bereich dazu dient, Benutzern den Zugriff auf eine Drittanwendung zu gewähren, wird die Function `EAP` genutzt. Der Name der Applikation folgt dann als Qualifier (z.B. `BASE_IAM-GLOB-DEF-EAP-Salesforce`).

**Windows/macOS Update Rings (UPD):** Gruppen für Update Ringe erhalten die Function `UPD`. Die Ring-Stufe wird als Qualifier angefügt:
- `BASE_MDM-GLOB-WIN-UPD-PILOT` — Windows Pilot-Ring (Early Adopter)
- `BASE_MDM-GLOB-WIN-UPD-LAST` — Windows Last-Ring (konservativ, verzögert)
- `BASE_MDM-GLOB-MAC-UPD-PILOT` — macOS Pilot-Ring
- `BASE_MDM-GLOB-MAC-UPD-LAST` — macOS Last-Ring

---

## 8. Qualifier und Environment-Suffix

**Qualifier:** Manche Gruppen benötigen nach der Function noch eine weitere Spezifizierung.
- `BASE_IAM-DE-PIM-ELG-GlobalAdmin`
- `BASE_IAM-GLOB-DEF-EAP-Workday`

**PILOT als Umgebungs-Suffix:** Wenn eine Gruppe nicht produktiv im Regelbetrieb steht, wird dies am Ende des Namens mit einem Unterstrich sichtbar gemacht.
- `BASE_MDM-MUCx-WIN-DEF_PILOT`
- `BAEX_365-DE-HRx-SPO_PILOT`

> **Hinweis:** `PILOT` und `LAST` als **Qualifier** (mit Bindestrich) kennzeichnen feste Update-Ring-Stufen, z.B. `BASE_MDM-GLOB-WIN-UPD-PILOT`. Als **Suffix** (mit Unterstrich) kennzeichnen sie temporäre Pilotgruppen außerhalb des Regelbetriebs. `_TEST` entfällt — gültige Suffixe sind ausschließlich `_PILOT`.

---

## 9. Wie ein Name gelesen werden soll

Ein Name soll in Zukunft idealerweise wie eine kleine Aussage verstanden werden.

- **`BASE_IAM-DE-HRx-DEF`**
  Globale Basiskonfiguration im Bereich Identity & Access Management, bezogen auf Deutschland, im HR-Kontext, Default-Ausprägung.
- **`BASE_MDM-MUCx-WIN-DEF`**
  Basiskonfiguration für Mobile Device Management, Standort München, Windows-Kontext, Default-Ausprägung.

---

## 10. Benutzerkonten

Neben Gruppen folgt auch die Benennung von Benutzerkonten einer erkennbaren Logik. Hier steht nicht die Segmentstruktur im Vordergrund, sondern der Präfix als Kontotyp. Der Präfix wird vom eigentlichen Benutzernamen durch einen Punkt getrennt.

- `(kein Präfix)` = Standardkonto
- `adm.` = Admin-Konto
- `srv.` = Service-Konto
- `ext.` = externer Benutzer mit Member-Status
- `tst.` = Testkonto
- `res.` = Resource-Konto
- `agt.` = Agent-/Automationskonto
- `smb.` = funktionaler Shared-Mailbox-Bezug

**Best Practice:** Der User Principal Name (UPN) und die primäre SMTP-Adresse werden konsequent in Kleinbuchstaben (lowercase) geschrieben.

*Abgrenzung: Dieses Konzept definiert ausschließlich die Namensgebung der Kontotypen. Operative Fragen — etwa welche Authentifizierungsmethoden ein Kontotyp nutzt, welche Conditional Access Policies greifen, wer Owner ist oder wie der Lebenszyklus gesteuert wird — werden in separaten Governance- und Betriebskonzepten behandelt (siehe Kapitel 16).*

---

## 11. Break-Glass und Sonderfälle

- **Break-Glass Konten:** Sollen keinen sprechenden Namen tragen (z.B. auf Basis einer Seriennummer wie `28491837@365solution.de`).
  *Abgrenzung: Die Aufbewahrung der Zugangsdaten, das Monitoring von Break-Glass-Logins und die Prozesse zur Nutzung im Notfall sind Bestandteil eines separaten Break-Glass-Betriebskonzepts.*
- **Kiosk-Szenarien:** Kein dediziertes Benutzerkonto (`kiosk.x`), stattdessen ein Gerätekontext wie `BASE_MDM-WIEN-WIN-DEF`.
  *Abgrenzung: Die Konfiguration des Kiosk-Profils, der Autopilot-Modus und die Geräterichtlinien sind Bestandteil des MDM-/Intune-Konzepts.*

---

## 12. Lifecycle und Expiration (Best Practice)

Nicht mehr genutzte Gruppen erhalten das Präfix `ARCHIVE-` (z.B. `ARCHIVE-BASE_IAM-DE-HRx-DEF`) und werden nach einer Karenzzeit gelöscht. Für Gruppen im Bereich 365 wird der Lebenszyklus perspektivisch durch automatisierte Expiration Policies unterstützt.

*Abgrenzung: Die konkreten Karenzzeiten, Review-Zyklen, Expiration-Policy-Konfigurationen und Verantwortlichkeiten im Lifecycle-Prozess sind Bestandteil eines separaten Governance-Konzepts.*

---

## 15. Optionaler Vorschlag: Gruppentyp-Kennzeichnung nach dem Geo-Bereich

⚠️ *Dieser Abschnitt ist ein Vorschlag und kein Bestandteil des aktuellen Entwurfs.*
Bei Bedarf kann nach dem Geo-Segment eine Kennzeichnung des technischen Gruppentyps eingefügt werden:
- `SEC` — Security Group
- `365` — Microsoft 365 Group
Beispiel: `BASE_IAM-DE-SEC-HRx-DEF`

---

## 14. Einordnung als Zielbild und nicht als starre Vorschrift

Dieses Dokument versteht sich bewusst als Konzept- und Entwurfspapier. Es beschreibt die angestrebte Benennungslogik, die gewünschte Leserichtung und die fachliche Strukturidee.

Es geht dabei weniger um eine unmittelbare, lückenlose Verpflichtung jedes Einzelobjekts, sondern um ein gemeinsames Modell, an dem sich künftige Strukturen ausrichten sollen.

Das Konzept schafft damit:
- Ein gemeinsames Verständnis
- Ein lesbares Zielbild
- Eine Grundlage für spätere Standardisierung
- Eine bessere Orientierung für Migration und Weiterentwicklung

---

## 16. Offene Fragestellungen und Abgrenzung zur Governance

Dieses Naming-Konzept definiert, wie Objekte heißen. Die folgenden Fragestellungen gehen über die reine Benennung hinaus und müssen in separaten Konzepten adressiert werden:

| Fragestellung | Naming-Konzept | Governance / Betriebskonzept |
| :--- | :---: | :---: |
| Wie heißt ein Objekt? | ✅ | |
| Wie erkenne ich den Typ am Namen? | ✅ | |
| Welche Segmente hat der Name? | ✅ | |
| In welche Gruppe gehört ein Benutzer? | ✅ (Struktur) | ✅ (Zuweisung) |
| Wie wird eine Gruppe technisch konfiguriert? | | ✅ |
| Welche Conditional Access Policies greifen? | | ✅ |
| Wie authentifiziert sich ein Kontotyp? | | ✅ |
| Wer ist Owner einer Gruppe oder eines Kontos? | | ✅ |
| Wie wird der Lebenszyklus gesteuert? | | ✅ |
| Wie werden Berechtigungen zugewiesen? | | ✅ |
| Welche Expiration Policies gelten? | | ✅ |

### 16.2 Offene Fragen nach Kontotyp

**Service Accounts (`srv.`)**
- Gibt es eine Struktur nach dem Präfix? (z.B. `srv.appname@…` vs. `srv.system.funktion@…`)
- Wann wird ein `srv.`-Konto (User-basiert) genutzt vs. eine App Registration oder Managed Identity (ohne UPN)?
- Wie werden Authentifizierungsmethoden gesteuert (Client Secret, Certificate, Managed Identity)?
- Welche Conditional Access Policies greifen für Service Accounts?
- Wer ist verantwortlicher Owner und wie wird Secret-/Zertifikats-Rotation sichergestellt?

**Admin Accounts (`adm.`)**
- Wie wird die Trennung zwischen Standard- und Admin-Konto operativ durchgesetzt?
- Ist PIM für alle `adm.`-Konten verpflichtend?
- Welche Conditional Access Policies greifen spezifisch für Admin-Konten?
- Wie wird der Zugang bei Offboarding zeitnah entzogen?

**External Accounts (`ext.`)**
- Wie werden externe Member provisioniert und wer genehmigt den Zugang?
- Welche Access Reviews greifen für externe Konten?
- Gibt es automatisierte Expiration oder regelmäßige Rezertifizierung?
- Wie unterscheidet sich `ext.` (Member) von B2B Guest Accounts?

**Agent Accounts (`agt.`)**
- Welche Berechtigungen erhalten AI Agents / Copilot Automations?
- Wie wird der Zugriff überwacht und eingeschränkt?
- Wer ist verantwortlicher Owner eines Agent-Kontos?

**Resource Accounts (`res.`)**
- Wie werden Raum- und Equipment-Konten verwaltet?
- Welche Policies gelten für Resource Accounts in Teams/Exchange?

**Shared Mailboxes (`smb.`)**
- Wie wird der Zugriff auf Shared Mailboxes gesteuert und auditiert?
- Gibt es Naming-Regeln für die zugehörigen Berechtigungsgruppen?

**Break-Glass Konten**
- Wo werden die Zugangsdaten aufbewahrt?
- Wie wird die Nutzung überwacht (Monitoring / Alerting)?
- Welcher Prozess gilt für den Einsatz im Notfall?

### 16.3 Offene Fragen nach Systembereich

**IAM — Identity & Access Management**
- Wie werden Dynamic Membership Rules konfiguriert und validiert?
- Welche User-Attribute müssen in Entra ID gepflegt sein, damit die Gruppenlogik funktioniert?
- Wie wird PIM operativ eingesetzt (Eligible vs. Active, Approval Workflows)?

**MDM — Mobile Device Management**
- Welche Intune-Profile und Compliance Policies werden welchen Gruppen zugewiesen?
- Wie werden Autopilot-Szenarien (User-Driven, Self-Deploying, Pre-Provisioning) abgebildet?
- Wie werden Plattform-spezifische Konfigurationen gesteuert?

**365 — Microsoft 365 Services**
- Wie wird die Lizenzzuweisung über Gruppen gesteuert?
- Welche Teams/SharePoint-Governance gilt (Erstellung, Archivierung, Gastzugang)?
- Wie werden Shared Mailboxes und Verteilergruppen operativ verwaltet?

### 16.4 Übergreifende Governance-Fragen

- **Conditional Access:** Welche Policies greifen für welche Kontotypen und Gruppen?
- **Lifecycle Management:** Wie werden Gruppen und Konten erstellt, reviewed und dekommissioniert?
- **Ownership:** Wer ist für welche Gruppen und Konten verantwortlich?
- **Monitoring & Auditierung:** Wie werden Änderungen an Gruppen und Konten nachvollzogen?
- **Migration:** Wie werden bestehende Objekte in die neue Konvention überführt?
- **Automatisierung:** Welche Prozesse (PowerShell, Graph API, Logic Apps) unterstützen die Konvention?
- **Ausnahmemanagement:** Wer entscheidet über Abweichungen von der Konvention?

---

**Version:** 4.2 | **Autor:** IAM Team — 365solution AG

**Änderungen (4.1 → 4.2)**
- Ergänzung von `UPD` als Function-Code für Windows/macOS Update Ringe
- Update Ring Qualifier: `PILOT` und `LAST` als Bindestrich-Qualifier (feste Ring-Stufen)
- `_TEST` als Umgebungs-Suffix entfernt — gültiges Suffix ist ausschließlich `_PILOT`
- Klarstellung: Qualifier (Bindestrich) vs. Umgebungs-Suffix (Unterstrich) für PILOT/LAST

**Änderungen (4.0 → 4.1)**
- Reintegration von Kapitel 14 (Einordnung als Zielbild)
- Vollständige Reintegration der detaillierten Governance-Fragen in Kapitel 16
- Ergänzung der Abgrenzungshinweise in den Kapiteln 10, 11 und 12

**Änderungen (3.9 → 4.0)**
- Integration des Plattform-Tags als Pflichtfeld im MDM-Context (Kapitel 6)
- Definition der Ausnahmeregelung für plattformübergreifende Zuweisungen (`DEF` / `GLOB`)
- Konsolidierung der Dokumentenstruktur
