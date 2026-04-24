# LiX Reference Files

Diese Dateien sind ein bewusst kleiner, lokal vendorter Referenzsatz aus dem
LiX-Repository. Sie werden in TipTapAI nicht direkt kompiliert, sondern dienen
als fachliche Vorlage fuer Titelei, Frontmatter und Buchklassen-Verhalten.

## Herkunft

- Upstream-Repository:
  [NicklasVraa/LiX](https://github.com/NicklasVraa/LiX/tree/master)
- Lokale Begleitnotiz im Repo:
  [../lix-readme.md](/Users/erlkoenig/Documents/AA/_AA_TipTapAi/Typesetting/lix-readme.md:1)
- Importiert am: `2026-04-23`

## Importierte Dateien

- `lix.sty`
  Zentrale LiX-Makros, unter anderem `\wrap`, `\addMetadata`,
  `\addFormalPage` und `\addEpigraph`.
- `novel.cls`
  Referenz fuer Roman-Titelei mit Frontcover, Formal Page und Epigraph.
- `textbook.cls`
  Referenz fuer Sachbuch-/Lehrbuch-Frontmatter mit Formal Page.
- `novella.cls`
  Referenz fuer kompaktere Kurzroman-Titelei.
- `poem.cls`
  Referenz fuer Gedichtband-Frontmatter.

## Upstream-Quellen

- [lix.sty](https://raw.githubusercontent.com/NicklasVraa/LiX/master/lix.sty)
- [novel.cls](https://raw.githubusercontent.com/NicklasVraa/LiX/master/classes/custom_classes/novel.cls)
- [textbook.cls](https://raw.githubusercontent.com/NicklasVraa/LiX/master/classes/custom_classes/textbook.cls)
- [novella.cls](https://raw.githubusercontent.com/NicklasVraa/LiX/master/classes/custom_classes/novella.cls)
- [poem.cls](https://raw.githubusercontent.com/NicklasVraa/LiX/master/classes/custom_classes/poem.cls)

## Wofuer diese Referenzen aktuell benutzt werden

- Ableitung der Reihenfolge und Rollen von Frontmatter-Bausteinen.
- Abgleich, welche Angaben im Buchkontext erwartet werden:
  Cover, Titel, Metadaten, Formal Page, Widmung, Epigraph, ISBN, Lizenz.
- Testbare Referenz dafuer, dass der Import aus LiX nicht nur behauptet,
  sondern lokal nachvollziehbar vorliegt.

## Schnelltest fuer den Importzustand

Die Referenz gilt als sauber importiert, wenn:

- alle fünf Dateien in diesem Ordner vorhanden sind
- `lix.sty` die Makros `\wrap`, `\addMetadata`, `\addFormalPage`,
  `\addEpigraph` enthaelt
- `novel.cls` und `textbook.cls` die Frontmatter-Hooks in ihrer `\wrap`-Logik
  referenzieren

Beispielpruefung:

```bash
rg -n "addFormalPage|addEpigraph|addMetadata|wrap" "Typesetting/Lix Reference Files"
```
