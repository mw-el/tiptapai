---
name: webp-bildumwandlung
description: "Converts all non-WebP images in a folder to WebP using ImageMagick, deletes originals, and updates references in .slid files."
---

# WebP-Bildumwandlung

## Ziel

Alle Bilder in einem Assets-Ordner (PNG, JPG, JPEG, HEIC, AVIF, GIF, TIFF) in WebP
umwandeln, Originale löschen und Referenzen in verknüpften `.slid`-Dateien aktualisieren.

## Trigger

- «Konvertiere die Bilder zu WebP»
- «Wandle den Assets-Ordner um»
- «WebP-Umwandlung»

## Harte Regeln

- Nur `magick` verwenden (`/opt/homebrew/bin/magick`), nicht das veraltete `convert`.
- Originale erst löschen, nachdem die WebP-Datei erfolgreich erstellt wurde.
- Bereits vorhandene `.webp`-Dateien nicht erneut konvertieren.
- Nach der Konvertierung alle `.slid`-Dateien im selben Verzeichnis auf `.png`/`.jpg`-Referenzen prüfen und auf `.webp` umstellen.

## Ausführung

1. Nutze den Prompt in `prompts/default-prompts.md`.
2. Ermittle den Assets-Ordner (aus Kontext oder Nutzerangabe).
3. Konvertiere, lösche, aktualisiere – in dieser Reihenfolge.
4. Berichte Ergebnis: Anzahl konvertierter Dateien, aktualisierte Referenzen.
