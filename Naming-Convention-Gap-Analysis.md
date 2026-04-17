# Naming Convention Gap-Analyse: Entra ID & Intune

## Management Summary

Diese Gap-Analyse vergleicht drei vorliegende Namenskonventions-Dokumente für Microsoft Entra ID und Microsoft Intune: das konzeptionelle **GoldenTenant 4-Category Concept**, die angewandte **GoldenTenant NAMING-CONVENTION (V2.0)** und die neu erstellte **Azure AD Group Naming Convention (V1.0)**. 

Während die beiden GoldenTenant-Dokumente einen stark Intune- und Policy-getriebenen Ansatz verfolgen (mit Fokus auf `BASE_`, `AAD_`, `IAM_`, `MDM_` und Unterstrichen als Trennzeichen), definiert die neue Azure AD-Konvention eine strikte, 5-teilige Struktur (`Environment-System-Object-Platform-Function`) speziell für Entra ID Gruppen, die Bindestriche nutzt und Umgebungen (`PROD`, `TEST`) in den Vordergrund stellt. Die größte Diskrepanz besteht in der grundlegenden Syntax (Unterstrich vs. Bindestrich) und der Behandlung von Hybrid-Szenarien (explizites `AAD_` Präfix vs. Verzicht darauf). Um einen Wildwuchs zu vermeiden, wird eine Harmonisierung der Präfixe und Trennzeichen für die finale Implementierung empfohlen.

---

## 1. Übersicht der analysierten Dokumente

1. **Final_4_Category_Naming_Concept.md (GoldenTenant Concept)**
   - Ein theoretisches Rahmenwerk, das die Notwendigkeit von vier Hauptkategorien (`BASE`, `AAD_`, `IAM_`, `MDM_`) erklärt.
   - Fokus auf der Unterscheidung zwischen Cloud-Only und Hybrid-Umgebungen.

2. **NAMING-CONVENTION.md (GoldenTenant V2.0)**
   - Die praktische Anwendung des 4-Kategorien-Konzepts auf das GoldenTenant-Repository (191 Policies).
   - Definiert konkrete Namensmuster für Policies, Conditional Access und Gruppen.

3. **Azure-AD-Group-Naming-Convention.md (Azure AD Group V1.0)**
   - Ein dediziertes Konzept **ausschließlich** für Entra ID Gruppen.
   - Nutzt eine starre 5-Block-Struktur mit Fokus auf Umgebungen (`PROD`, `TEST`) und Plattformen.

---

## 2. Abgleich 1: GoldenTenant Concept vs. GoldenTenant Applied (V2.0)

Dieser Abgleich zeigt, wie das theoretische Konzept in die Praxis des GoldenTenant-Repositories umgesetzt wurde.

| Kriterium | Final 4-Category Concept | NAMING-CONVENTION.md (V2.0) | Gap / Unterschied |
| :--- | :--- | :--- | :--- |
| **Fokus** | Theoretische Begründung der 4 Kategorien. | Praktische Zuordnung zu Intune/Entra-Ordnern. | V2.0 liefert konkrete Subkategorien (z.B. `DEVICE_CONFIG`, `USER_GROUPS`), die im Konzept nur angerissen werden. |
| **Conditional Access** | Fällt unter `IAM_`. | Definiert eigenes Muster: `[SCOPE]_IAM_CA_[ID]_[ACTION]_[DESCRIPTION]`. | V2.0 erweitert das Konzept um eine ID- und Action-basierte Logik für CA-Policies. |
| **AAD_ Präfix** | Ausführliche Erklärung der Notwendigkeit für Hybrid-AD. | Klare Regel: "Use ONLY in Hybrid environments". | Kein Gap. V2.0 setzt die Theorie exakt in anwendbare Regeln um. |
| **Struktur** | `[PREFIX][ORG]_[DESC]_[DETAILS]` | `[ORG]_[CATEGORY]_[SUBCATEGORY]_[DESC]` | V2.0 hat die Struktur standardisiert und Subkategorien als festen Bestandteil etabliert. |

**Fazit Abgleich 1:** Die `NAMING-CONVENTION.md` ist die logische, operative Evolution des Konzepts. Es gibt keine Widersprüche, lediglich eine Konkretisierung durch Subkategorien und spezifische CA-Muster.

---

## 3. Abgleich 2: GoldenTenant (V2.0) vs. Azure AD Group Naming Convention

Dieser Abgleich zeigt die deutlichen Unterschiede zwischen der GoldenTenant-Policy-Konvention und der neuen, dedizierten Entra ID Gruppen-Konvention.

### 3.1 Strukturelle Unterschiede

| Kriterium | GoldenTenant (V2.0) | Azure AD Group Convention (V1.0) | Gap / Konflikt |
| :--- | :--- | :--- | :--- |
| **Trennzeichen** | Unterstrich (`_`) | Bindestrich (`-`) | **Kritischer Gap:** Führt zu visuellem Bruch in der Umgebung (z.B. `BASE_IAM_Users` vs. `PROD-IAM-USER-Standard`). |
| **Grundmuster** | `[ORG]_[CAT]_[SUBCAT]_[DESC]` | `[Env]-[System]-[Object]-[Platform]-[Function]` | GoldenTenant ist dynamisch (Länge variiert), Azure AD ist starr (immer 5 Blöcke). |
| **Präfix / Scope** | Organisations-Kürzel (`BASE`, `CONTOSO`) | Umgebungs-Kürzel (`PROD`, `TEST`, `PILOT`) | Azure AD fokussiert sich auf Lifecycle-Umgebungen, GoldenTenant auf Mandantenfähigkeit/Orgas. |
| **Kategorien** | `BASE`, `AAD_`, `IAM_`, `MDM_` | `IAM`, `MDM`, `M365`, `CAP` | Azure AD nutzt `M365` und `CAP` als Hauptsysteme, während GoldenTenant dies als Subkategorien behandelt. |

### 3.2 Fachliche Unterschiede (Gaps)

1. **Behandlung von Hybrid-Umgebungen (Das `AAD_` Problem)**
   - **GoldenTenant:** Nutzt zwingend ein `AAD_` Präfix in Hybrid-Umgebungen, um Cloud-Only-Gruppen von On-Premises-synchronisierten Gruppen zu unterscheiden (z.B. `AAD_SALES_CRM_Cloud_Users`).
   - **Azure AD Convention:** Ignoriert die Hybrid-Thematik vollständig. Es gibt kein Äquivalent zum `AAD_` Indikator.

2. **Umgang mit Conditional Access (CAP)**
   - **GoldenTenant:** Integriert CA-Policies und deren Gruppen in die `IAM_` Kategorie (z.B. `GLOBAL_IAM_CA_1010...`).
   - **Azure AD Convention:** Erhebt `CAP` zu einem eigenen Hauptsystem auf oberster Ebene (z.B. `PROD-CAP-MFA-Excluded`).

3. **Plattform-Spezifizierung**
   - **GoldenTenant:** Die Plattform ist Teil der Description (z.B. `BASE_MDM_DEVICE_CONFIG_Windows_BitLocker`).
   - **Azure AD Convention:** Die Plattform (`Windows`, `MacOS`, `iOS`) hat einen dedizierten, festen Platz im Namensstring.

4. **Groß-/Kleinschreibung**
   - **GoldenTenant:** Mischt UPPERCASE für Kategorien und CamelCase/TitleCase für Beschreibungen (z.B. `BASE_IAM_Global_Administrators`).
   - **Azure AD Convention:** Erlaubt explizit CamelCase/TitleCase für die Funktion/Abteilung zur besseren Lesbarkeit (z.B. `PROD-MDM-DEVICE-Windows-Sales`).

---

## 4. Handlungsempfehlungen (Alignment)

Um eine konsistente Gesamtarchitektur für den Endkunden zu gewährleisten, müssen die beiden Welten (Policies vs. Gruppen) harmonisiert werden. Folgende Entscheidungen müssen getroffen werden:

1. **Trennzeichen-Standardisierung:**
   - Entscheidung treffen zwischen Unterstrich (`_`) und Bindestrich (`-`) für alle Entra ID und Intune Objekte. Bindestriche sind in Azure/M365 historisch verbreiteter und URL-safe.

2. **Das Organisations- vs. Umgebungs-Präfix:**
   - Die Azure AD Gruppenkonvention sollte um den `[ORG]` oder `BASE` Gedanken erweitert werden, wenn Mandantenfähigkeit gefordert ist (z.B. `[ORG]-[Env]-[System]...`).
   - Alternativ: GoldenTenant V2.0 übernimmt den `[Env]` Gedanken (`PROD_BASE_IAM...`).

3. **Hybrid-Indikator in Gruppen:**
   - Die Azure AD Group Convention **muss** um das Konzept des `AAD` Indikators aus dem GoldenTenant-Konzept erweitert werden, falls Hybrid-Umgebungen unterstützt werden sollen (z.B. `PROD-AAD-IAM-USER-Standard`).

4. **Kategorien-Konsolidierung:**
   - `M365` und `CAP` aus der Azure AD Konvention sollten in die GoldenTenant-Dokumentation übernommen werden, um die 4-Kategorien (`BASE`, `AAD`, `IAM`, `MDM`) zu erweitern oder als offizielle Subkategorien zu mappen.
