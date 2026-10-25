# Monetarisierung „Nexus.365 – AI Usage" (Stand 2026-10-25)

Kurzfassung: Über den Elgato Marketplace kommen pro verkauftem Euro 70 Cent an. Damit **1 € ausgezahlt** wird, muss das Plugin **1,43 €** kosten. Soll 1 € **nach Umsatzsteuer** bleiben, sind es **1,70 €**; soll 1 € **nach Unternehmenssteuern** in der UG bleiben, **2,46 €**. Elgato empfiehlt Preispunkte wie 3,99 $ oder 9,00 $; bei 3,99 $ bleiben 2,79 $ Auszahlung.
Der größere Hebel liegt nicht im Verkauf des Plugins, sondern in der Nutzung als Türöffner für Nexus.365 und als Baustein im M365-Copilot-Lizenzmonitoring für Kunden.

## 1. Was pro Verkauf übrig bleibt

| Weg | Gebühr | Umsatzsteuer | Preis für 1 € Auszahlung |
|---|---|---|---|
| Elgato Marketplace | 30 % Plattformanteil, Auszahlung per Stripe Connect | ungeklärt, ob Elgato Merchant of Record ist (Maker Agreement lesen) | **1,43 €** (1 / 0,70) |
| Lemon Squeezy | 5 % + 0,50 $, +1,5 % Nicht-US-Käufer | Plattform ist Merchant of Record, VAT kommt auf den Preis obendrauf | **1,61 €** |
| Gumroad | 10 % + 0,50 $ | Merchant of Record | **1,67 €** |
| Stripe Payment Link (selbst verkaufen) | 1,5 % + 0,25 € (EWR-Karte) | 19 % selbst abführen, OSS ab 10.000 € EU-Umsatz | **1,52 €** brutto |

Rechenweg Marketplace, falls die UG die Umsatzsteuer aus der Auszahlung bedienen muss:
1 € netto → 1,19 € Auszahlung → 1,19 / 0,70 = **1,70 €** Verkaufspreis.
Nach Unternehmenssteuern (Körperschaftsteuer 15 % + Soli, Gewerbesteuer bei Hebesatz 435 %, zusammen 31 %):
1 € nach Steuern → 1,45 € Gewinn vor Steuern → 1,72 € mit USt → 1,72 / 0,70 = **2,46 €** Verkaufspreis.

Bei Elgatos Preispunkten:

| Preis | Auszahlung (70 %) | davon netto ohne 19 % USt |
|---|---|---|
| 3,99 $ | 2,79 $ | 2,35 $ |
| 9,00 $ | 6,30 $ | 5,29 $ |

Für 1.000 € Auszahlung im Jahr braucht es bei 3,99 $ rund 360 Verkäufe, bei 9,00 $ rund 160. Verkaufszahlen vergleichbarer Plugins veröffentlicht Elgato nicht; die direkten Wettbewerber (AI Coding Usage Meter, Agent Vitals, Claude Peak Ticker) sind kostenlos.

## 2. Drei Wege, geordnet nach Ertrag

### A. Türöffner für Nexus.365 (empfohlen)
Plugin kostenlos im Marketplace unter dem Namen „Nexus.365 – AI Usage". Jede Installation ist Markenkontakt bei genau der Zielgruppe (Leute, die mehrere KI-Abos zahlen). In der Taste „Übersicht" und im README ein Verweis auf farpoint.tech. Ertrag entsteht über Beratung und Retainer, nicht über das Plugin. Kosten: null Vertrieb, kein Zahlungsabwickler, keine USt-Fragen. Risiko: keines, das es nicht ohnehin gibt (siehe Abschnitt 3).

### B. Free + Pro im Marketplace
- Free: Claude-, Codex-, GitHub-Copilot-Abo-Prozent (das bieten die Gratis-Wettbewerber auch).
- Pro, 9,00 $ einmalig: Token-Zähler, Kosten, „Nächste Resets" mit Blinken, Microsoft-365-Copilot-Lizenz, Wochen-Historie, fertige Profilseite.
- Elgato verbietet externe Paywalls und verlangt gleiche Preise auf allen Kanälen. Abo-Modell ist im Marketplace nicht dokumentiert, also einmalig verkaufen.
- Ab welcher Stückzahl sich das lohnt, hängt von der Entwicklungszeit ab; die ist bisher nicht erfasst. Erst erfassen, dann rechnen.

### C. B2B: M365-Copilot-Lizenzmonitor für Kunden
Der neue M365-Copilot-Provider liest Lizenz, Verlängerungsdatum und Nutzung je App aus Graph. Daraus wird ein Kundenprodukt: „Zahlt ihr Copilot-Lizenzen, die niemand nutzt?" Als Bestandteil des Nexus.365-Retainers oder als Scan-Paket. Das Stream Deck ist dabei nur Anzeige; das Reporting läuft als Skript. Preis orientiert sich an Beratungsstunden, nicht an Plugin-Preisen.

## 3. Risiken, die den Verkauf bremsen
- **Endpunkte ohne Dokumentation.** Claude (`api/oauth/usage`), Codex (`wham/usage`) und GitHub (`copilot_internal/user`) sind interne Schnittstellen. Anthropics Verbraucherbedingungen (Archivfassung 2025) verbieten automatisierten Zugriff außerhalb der API. Ein bezahltes Produkt auf dieser Basis kann jederzeit ausfallen oder entfernt werden. Für Weg A tragbar, für Weg B ein Haftungs- und Erstattungsrisiko (14 Tage Rückgaberecht im Marketplace).
- **Marketplace-Regeln.** Kein „Official" im Namen, keine Markenlogos der Anbieter, Datenschutzerklärung und Löschweg nötig, keine Telemetrie ohne Einwilligung. Das Plugin sendet heute nichts nach außen außer an die Anbieter selbst; das in der Erklärung so festhalten.
- **Steuern.** Ob Elgato Merchant of Record ist, steht nicht in der Doku. Davon hängt ab, ob die UG 19 % aus der Auszahlung abführt oder nicht. Vor dem ersten Verkauf klären.

## 4. Empfehlung
Weg A sofort, Weg C als Produkt im Nexus.365-Katalog aufbauen. Weg B nur, wenn nach drei Monaten Weg A messbare Installationen zeigt und die Rechtsfrage zu den Endpunkten geklärt ist.

## TODO
- [ ] Maker Agreement im Maker Console lesen: Merchant of Record, USt, Auszahlungsrhythmus (Philipp, hoch)
- [ ] Anwalt: aktuelle Nutzungsbedingungen von Anthropic, OpenAI, GitHub zu den Usage-Endpunkten (Philipp/Recht, hoch)
- [ ] Steuerberater: Behandlung der Marketplace-Auszahlung bei der USt (Steuerberater, mittel)
- [ ] Entwicklungszeit nachtragen, Break-even für Weg B rechnen (Philipp, mittel)
- [ ] Marketplace-Listing vorbereiten: Name, Screenshots, Datenschutzerklärung, Löschweg (Philipp, mittel)
- [ ] Weg C als Scan-Paket im Nexus.365-Katalog beschreiben (Philipp, niedrig)

Quellen: docs.elgato.com/monetization/revenue-share · docs.elgato.com/guidelines/products · docs.elgato.com/monetization/stripe · docs.lemonsqueezy.com/help/getting-started/fees · gumroad.com/pricing · stripe.com/de/pricing · ihk.de (OSS, §3c UStG) · whk-controlling.de (Steuern GmbH) · anthropic.com/legal/archive (Consumer Terms 2025)
