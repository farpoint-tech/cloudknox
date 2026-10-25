# Stream-Deck-Profilformat (Stand 2026-10-25, Stream Deck 7.5.0 auf diesem Mac)

Grundlage für `tools/make-profile.mjs`. Jede Aussage hat ihre Quelle; was nicht belegt ist, steht unter „Annahmen“.

## Quellen

1. **Eigene Installation, nur gelesen:** `~/Library/Application Support/com.elgato.StreamDeck/ProfilesV3/` (zwei Profile, acht Seiten). App-Version laut `Info.plist`: 7.5.0.
2. **Elgato-Exporte:** `Plugins/com.elgato.tutorial.sdPlugin/profiles/Tutorial*.streamDeckProfile` (von Elgato ausgeliefert, Stand 2022).
3. **Elgato-Doku:** [Profiles-Guide](https://docs.elgato.com/streamdeck/sdk/guides/profiles), [Manifest-Referenz](https://docs.elgato.com/sdk/plugins/manifest) (DeviceType-Liste). Das interne Dateiformat dokumentiert Elgato nicht.

## Belegt

**Ablage auf der Platte (Quelle 1)**

```
<PROFIL-UUID>.sdProfile/
  manifest.json                      Profil
  Images/
  Profiles/<SEITEN-UUID>/            Ordnername GROSS
    manifest.json                    Seite
    Images/
```

Profil-`manifest.json`:

```json
{"Device":{"Model":"20GBL9901","UUID":"<Geräte-ID der App>"},"Name":"Default Profile",
 "Pages":{"Current":"<uuid>","Default":"<uuid>","Pages":["<uuid>", "..."]},"Version":"3.0"}
```

- Seiten-UUIDs stehen im Manifest klein, die Ordner heißen gleich, aber groß.
- `Pages.Default` zeigt auf eine eigene, leere Seite, die nicht in `Pages.Pages` steht: `{"Controllers":[{"Actions":null,"Type":"Keypad"}],"Icon":"","Name":""}`. In beiden vorhandenen Profilen so.
- Ordner-Seiten („Create Folder“) liegen ebenfalls unter `Profiles/`, stehen aber nicht in `Pages.Pages`.

Seiten-`manifest.json`:

```json
{"Controllers":[{"Actions":{"<spalte>,<zeile>":{ ...Aktion... }},"Type":"Keypad"}],"Icon":"","Name":""}
```

- Schlüssel `"spalte,zeile"`, nullbasiert, Spalte zuerst. Belegt durch `"4,0"` und `"3,2"` auf einer 5×3-Seite.
- Leere Tasten fehlen einfach im Objekt.

Eine Aktion (Felder wie bei Fremd-Plugins in Quelle 1):

```json
{"ActionID":"<uuid klein>","LinkedTitle":true,"Name":"<Action-Name>",
 "Plugin":{"Name":"<Plugin-Name>","UUID":"<Plugin-UUID>","Version":"<Plugin-Version>"},
 "Resources":null,"Settings":{...},"State":0,
 "States":[{"FontFamily":"","FontSize":12,"FontStyle":"","FontUnderline":false,"OutlineThickness":2,
            "ShowTitle":false,"TitleAlignment":"middle","TitleColor":"#ffffff"}],
 "UUID":"<Action-UUID>"}
```

Ohne `Image` im State nimmt die App das Bild aus dem Plugin-Manifest; unser Plugin übermalt es per `setImage`.

**Export-Datei (Quelle 2)**

- `.streamDeckProfile` ist ein normales ZIP (`file`: „Zip archive data … deflate“).
- Im ZIP liegt auf oberster Ebene genau ein Ordner `<UUID>.sdProfile/` mit Verzeichniseinträgen.
- Diese Exporte sind das alte Format 1.0 (flaches `Actions`, `DeviceModel` statt `Device`, Ordner je Taste).

**Gerätemodelle**

| DeviceType (Doku) | Gerät | Modellcode | Quelle |
|---|---|---|---|
| 0 | Stream Deck (15 Tasten) | `20GBL9901` | Quelle 1, das Gerät dieses Macs (USB 4057/165) |
| 0 | Stream Deck MK.2 | `20GBA9901` | Quelle 2 |
| 1 | Stream Deck Mini | `20GAI9901` | Quelle 2 |
| 2 | Stream Deck XL (8×4) | `20GAT9901` | Quelle 2 |

Die im Auftrag genannte ID `be7a7fe2a6771733a2d9c173192e5e9c` ist die Geräte-ID, die die App an Plugins meldet. Sie taucht in `ProfilesV3` nicht auf; dort steht als `Device.UUID` eine andere, seriennummernartige Kennung. Der Generator schreibt `Device.UUID` deshalb leer (überschreibbar mit `--device-uuid`).

## Annahmen (nicht geprüft)

- **Inhalt eines aktuellen 7.x-Exports.** Es gab auf diesem Mac keinen Export im 3.0-Format. Der Generator packt die Ablage aus Quelle 1 so ins ZIP, wie Quelle 2 es tut: `<UUID>.sdProfile/` auf oberster Ebene, darin Profil- und Seitenmanifeste im Format 3.0. Ob 7.x beim Export zusätzlich eine Datei wie `package.json` erwartet, ist offen. Gegenprobe: in der App ein beliebiges Profil exportieren und `unzip -l` darauf laufen lassen.
- **Leere `Device.UUID`.** Der Import fragt nach dem Zielgerät; dass ein leerer Wert dabei akzeptiert wird, ist nicht getestet.
- **Modellcode bei anderem Gerätetyp.** Ob die App ein Profil mit Modell `20GBL9901` auf ein MK.2 (`20GBA9901`) importiert, ist nicht getestet. Bei Problemen `--model 20GBA9901`.

## Erster Test

1. `npm run profile`
2. Doppelklick auf `tools/Nexus365-AI-Usage.streamDeckProfile`
3. Klappt der Import nicht: in der App ein Profil exportieren, mit `unzip -l` vergleichen und die Abweichung hier nachtragen.

## TODO

- [ ] Import in Stream Deck 7.5.0 per Doppelklick prüfen (Philipp, hoch)
- [ ] Ein echtes 7.x-Export-ZIP mit `unzip -l` ansehen und Abschnitt „Annahmen“ bestätigen oder korrigieren (Philipp, hoch)
- [ ] Nach dem Import prüfen, ob alle 13 Tasten ihre Einstellungen im Property Inspector zeigen (Philipp, mittel)
