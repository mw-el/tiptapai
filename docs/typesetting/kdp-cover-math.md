# Amazon Cover-Berechnung

## Überblick
Diese Datei enthält alle Formeln und Parameter zur Berechnung von KDP (Kindle Direct Publishing) Buchcovern für:
- E-Books
- Paperback (Softcover)
- Hardcover

---

## Eingabeparameter

- trim_width (inch)
- trim_height (inch)
- page_count
- paper_type: white | cream | color
- binding_type: paperback | hardcover | ebook
- bleed: true/false

---

## Beschnitt (Bleed)

Bleed = 0.125 inch

Wenn aktiv:
total_width += 2 × bleed  
total_height += 2 × bleed  

---

## Rückenbreite (Spine)

spine_width = page_count × paper_thickness

Papierdicken:
- white: 0.002252
- cream: 0.0025
- color: 0.002347

---

## Paperback

total_width = (2 × trim_width) + spine_width + (2 × bleed)  
total_height = trim_height + (2 × bleed)

---

## Hardcover

hinge = 0.375  
wrap = 0.51  

total_width = (2 × trim_width) + spine_width + (2 × hinge) + (2 × wrap) + (2 × bleed)  
total_height = trim_height + (2 × wrap) + (2 × bleed)

---

## E-Book

height = width × 1.6  

Empfohlen:
1600 × 2560 px

---

## Safe Zones

safe_margin = 0.25 inch  

min_spine_width_for_text = 0.25 inch  

---

## Beispiel

6x9 inch, 300 Seiten, cream:

spine = 300 × 0.0025 = 0.75  

total_width = 13 inch  
total_height = 9.25 inch  

---

## PDF Export

- PDF/X-1a oder X-3
- CMYK
- 300 DPI
- Schriften eingebettet

---

## Hinweise

- Rundung auf 0.001 inch
- Barcode-Bereich freihalten (~2" × 1.2")
- Bei dünnem Spine keinen Text platzieren
