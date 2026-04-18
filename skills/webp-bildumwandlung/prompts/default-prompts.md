# WebP-Bildumwandlung – Ausführungs-Prompt

## Schritt 1 – Assets-Ordner bestimmen

Ermittle den Ordner aus dem Kontext (CLAUDE.md, geöffnete `.slid`-Datei) oder frage den Nutzer.
Format: `<stem>-assets/` neben der `.slid`-Datei.

## Schritt 2 – Bilder konvertieren

Für jede Datei mit Endung `.png`, `.jpg`, `.jpeg`, `.heic`, `.avif`, `.gif`, `.tiff`:

```bash
# Erst konvertieren
/opt/homebrew/bin/magick "<quelldatei>" "<basis>.webp"
# Dann erst das Original löschen
rm "<quelldatei>"
```

Bereits vorhandene `.webp`-Dateien überspringen.

## Schritt 3 – Referenzen in .slid aktualisieren

Alle `.slid`-Dateien im selben Verzeichnis prüfen:

```bash
sed -i '' \
  's|\(<assets-ordner>/[^"]*\)\.png|\1.webp|g' \
  's|\(<assets-ordner>/[^"]*\)\.jpg|\1.webp|g' \
  's|\(<assets-ordner>/[^"]*\)\.jpeg|\1.webp|g' \
  's|\(<assets-ordner>/[^"]*\)\.heic|\1.webp|g' \
  <deck>.slid
```

## Schritt 4 – Ergebnis berichten

Ausgabe:
- Anzahl konvertierter Bilder (mit Dateinamen)
- Anzahl aktualisierter Referenzen in `.slid`-Dateien
- Etwaige Fehler
