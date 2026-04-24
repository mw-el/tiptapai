#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
kdp_cover_calculator.py
================================================================================

ZWECK:
------
Dieses Modul berechnet die exakten Cover-Dimensionen fuer Buecher, die ueber
Amazon KDP (Kindle Direct Publishing) als Paperback, Hardcover oder E-Book
(Kindle) publiziert werden sollen.

Grundlage sind die offiziellen KDP-Formeln und Richtlinien:
  - https://kdp.amazon.com/help/topic/G201953020  (Paperback Cover)
  - https://kdp.amazon.com/help/topic/G201834180  (Print Options / Papiertypen)
  - https://kdp.amazon.com/help/topic/GVBQ3CMEQW3W2VL6 (Trim Size & Bleed)

Das Modul berechnet auf Basis von:
  1. Trim-Groesse (Buchformat, z. B. 5.5" x 8.5")
  2. Seitenzahl (Gesamtanzahl Druckseiten)
  3. Papier- / Tintentyp (4 KDP-Varianten, s. u.)
  4. Buchtyp (Paperback oder Hardcover)

...und liefert:
  - Spine-Breite in Inch, mm und Pixel (300 DPI)
  - Gesamte Cover-Datei-Breite und -Hoehe (inkl. Bleed/Wrap)
  - Masse fuer Vordertitel, Ruecktitel, Spine, Safe Zone
  - Optional: Exportiert eine SVG-Vorlage mit Hilfslinien sowie eine PNG-Vorschau

PAPIERTYPEN (KDP):
------------------
  "bw_white"    Schwarz/Weiss auf weissem Papier    – 0.002252" pro Seite
  "bw_cream"    Schwarz/Weiss auf Cremepapier        – 0.0025"   pro Seite
  "std_color"   Standard-Farbdruck (nur Paperback)   – 0.002252" pro Seite
  "prem_color"  Premium-Farbdruck (PB + HC)          – 0.002347" pro Seite

BUCHTYPEN:
----------
  "paperback"   Bleed: 0.125" rundum, Spine-Puffer: +0.06"
  "hardcover"   Wrap:  0.591" rundum, Spine-Puffer: +0.125"

E-BOOK (KINDLE):
----------------
  Nur Front Cover benoetigt: 2560 x 1600 px (Hochformat, 1:1.6).
  Funktion kindle_cover_size() liefert die empfohlenen Abmessungen.

TRIM-GROESSEN (Standard KDP-Formate):
--------------------------------------
  "5x8"         5.000" x 8.000"   (Kleines Taschenbuch)
  "5.06x7.81"   5.060" x 7.810"
  "5.25x8"      5.250" x 8.000"
  "5.5x8.5"     5.500" x 8.500"   (Standard)
  "6x9"         6.000" x 9.000"   (US Trade, sehr verbreitet)
  "6.14x9.21"   6.140" x 9.210"
  "7x10"        7.000" x 10.000"  (Sachbuch / Lehrbuch)
  "8x10"        8.000" x 10.000"
  "8.5x11"      8.500" x 11.000"  (Workbooks)
  Eigene Groessen: (breite, hoehe) als Tupel in Inch uebergeben.

VERWENDUNG:
-----------
  from kdp_cover_calculator import KDPCoverCalculator, kindle_cover_size

  # Dimensionen berechnen
  calc = KDPCoverCalculator(
      trim_size="6x9",
      pages=250,
      paper_type="bw_cream",
      book_type="paperback"
  )
  dims = calc.calculate()
  print(dims.summary())           # Formatierte Uebersicht
  data = dims.as_dict()           # Dictionary fuer programmatische Nutzung

  # SVG-Vorlage mit Hilfslinien exportieren
  calc.export_svg("mein_cover.svg")

  # PNG-Vorschau exportieren (benoetigt: pip install cairosvg)
  calc.export_png("mein_cover_preview.png", scale=0.25)

  # Kindle E-Book Cover-Groesse
  print(kindle_cover_size())

  # Alle Trim-Groessen anzeigen
  from kdp_cover_calculator import list_trim_sizes
  list_trim_sizes()

ABHAENGIGKEITEN:
----------------
  Pflicht:  keine (nur Python-Stdlib)
  Optional: cairosvg  fuer PNG-Export  (pip install cairosvg)

LIZENZ: MIT – frei verwendbar und anpassbar.
================================================================================
"""

import math
from dataclasses import dataclass
from typing import Tuple, Union
from pathlib import Path

# ---------------------------------------------------------------------------
# Konstanten
# ---------------------------------------------------------------------------

DPI = 300

PAPER_THICKNESS = {
    "bw_white":   0.002252,
    "bw_cream":   0.002500,
    "std_color":  0.002252,
    "prem_color": 0.002347,
}

PAPER_LABELS = {
    "bw_white":   "Schwarz/Weiss - Weiss",
    "bw_cream":   "Schwarz/Weiss - Creme",
    "std_color":  "Standard-Farbe - Weiss",
    "prem_color": "Premium-Farbe - Weiss",
}

HARDCOVER_ALLOWED = {"bw_white", "bw_cream", "prem_color"}

TRIM_SIZES = {
    "5x8":       (5.000, 8.000),
    "5.06x7.81": (5.060, 7.810),
    "5.25x8":    (5.250, 8.000),
    "5.5x8.5":   (5.500, 8.500),
    "6x9":       (6.000, 9.000),
    "6.14x9.21": (6.140, 9.210),
    "7x10":      (7.000, 10.000),
    "8x10":      (8.000, 10.000),
    "8.5x11":    (8.500, 11.000),
}

PAPERBACK_BLEED       = 0.125
HARDCOVER_WRAP        = 0.591
PAPERBACK_SPINE_EXTRA = 0.060
HARDCOVER_SPINE_EXTRA = 0.125
SAFE_ZONE             = 0.125
SPINE_TEXT_MIN_PAGES  = 79


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def inch_to_mm(v: float) -> float:
    return round(v * 25.4, 2)

def inch_to_px(v: float, dpi: int = DPI) -> int:
    return round(v * dpi)

def list_trim_sizes():
    """Gibt alle verfuegbaren Standard-Trim-Groessen aus."""
    print("Verfuegbare KDP Trim-Groessen:")
    print(f"  {'Kuerzel':<14} {'Breite':>8}  {'Hoehe':>8}  {'Breite':>12}  {'Hoehe':>10}")
    print("  " + "-" * 60)
    for key, (w, h) in TRIM_SIZES.items():
        print(f"  {key:<14} {w:>7.3f}"  {h:>7.3f}"  {inch_to_mm(w):>10.1f}mm  {inch_to_mm(h):>8.1f}mm")

def kindle_cover_size() -> dict:
    """Empfohlene Dimensionen fuer ein Kindle E-Book-Cover."""
    return {
        "width_px":         1600,
        "height_px":        2560,
        "ratio":            "1:1.6 (Hochformat)",
        "min_long_side_px": 1000,
        "format":           "JPG oder TIFF",
        "color_space":      "RGB",
        "hinweis":          "Nur Front Cover noetig – kein Spine, kein Bleed.",
    }


# ---------------------------------------------------------------------------
# Ergebnis-Datenklasse
# ---------------------------------------------------------------------------

@dataclass
class CoverDimensions:
    book_type:      str
    trim_w:         float
    trim_h:         float
    pages:          int
    paper_type:     str
    spine_width:    float
    bleed_or_wrap:  float
    total_cover_w:  float
    total_cover_h:  float
    safe_zone:      float = SAFE_ZONE

    def summary(self) -> str:
        bt  = "Paperback" if self.book_type == "paperback" else "Hardcover"
        bw  = self.bleed_or_wrap
        sw  = self.spine_width
        tcw = self.total_cover_w
        tch = self.total_cover_h
        lines = [
            "+---------------------------------------------------------+",
            "|  KDP Cover-Dimensionen                                  |",
            "+---------------------------------------------------------+",
            f"|  Buchtyp:      {bt:<41}|",
            f"|  Trim-Groesse: {self.trim_w}" x {self.trim_h}"                              |",
            f"|  Seitenzahl:   {self.pages:<41}|",
            f"|  Papiertyp:    {PAPER_LABELS[self.paper_type]:<41}|",
            "|                                                         |",
            f"|  Spine-Breite: {sw:.4f}"  |  {inch_to_mm(sw):.2f}mm  |  {inch_to_px(sw)}px        |",
            f"|  Spine-Text:   ab {SPINE_TEXT_MIN_PAGES} Seiten empfohlen                    |",
            "|                                                         |",
            "|  Cover-Datei gesamt:                                    |",
            f"|    Breite:     {tcw:.4f}"  |  {inch_to_mm(tcw):.2f}mm  |  {inch_to_px(tcw)}px      |",
            f"|    Hoehe:      {tch:.4f}"  |  {inch_to_mm(tch):.2f}mm  |  {inch_to_px(tch)}px      |",
            "|                                                         |",
            f"|  Bleed/Wrap:   {bw}" rundum                              |",
            f"|  Safe Zone:    {self.safe_zone}" vom Schnittrand innen             |",
            "+---------------------------------------------------------+",
        ]
        return "\n".join(lines)

    def as_dict(self) -> dict:
        return {
            "book_type":        self.book_type,
            "trim_w_in":        self.trim_w,
            "trim_h_in":        self.trim_h,
            "pages":            self.pages,
            "paper_type":       self.paper_type,
            "spine_w_in":       self.spine_width,
            "spine_w_mm":       inch_to_mm(self.spine_width),
            "spine_w_px":       inch_to_px(self.spine_width),
            "bleed_or_wrap_in": self.bleed_or_wrap,
            "total_w_in":       self.total_cover_w,
            "total_h_in":       self.total_cover_h,
            "total_w_mm":       inch_to_mm(self.total_cover_w),
            "total_h_mm":       inch_to_mm(self.total_cover_h),
            "total_w_px":       inch_to_px(self.total_cover_w),
            "total_h_px":       inch_to_px(self.total_cover_h),
            "safe_zone_in":     self.safe_zone,
            "dpi":              DPI,
        }


# ---------------------------------------------------------------------------
# Haupt-Klasse
# ---------------------------------------------------------------------------

class KDPCoverCalculator:
    """
    Berechnet KDP-Cover-Dimensionen und exportiert SVG/PNG-Vorlagen.

    Parameter:
        trim_size  (str | tuple): KDP-Kuerzel z. B. "6x9" oder (6.0, 9.0) in Inch
        pages      (int):         Gesamtanzahl Druckseiten (muss gerade sein, min. 24)
        paper_type (str):         "bw_white" | "bw_cream" | "std_color" | "prem_color"
        book_type  (str):         "paperback" | "hardcover"
    """

    def __init__(
        self,
        trim_size:  Union[str, Tuple[float, float]] = "6x9",
        pages:      int = 200,
        paper_type: str = "bw_cream",
        book_type:  str = "paperback",
    ):
        if isinstance(trim_size, str):
            if trim_size not in TRIM_SIZES:
                raise ValueError(
                    f"Unbekannte Trim-Groesse \'{trim_size}\'. "
                    f"Verfuegbar: {list(TRIM_SIZES.keys())} oder (w, h) Tupel in Inch."
                )
            self.trim_w, self.trim_h = TRIM_SIZES[trim_size]
        else:
            self.trim_w, self.trim_h = float(trim_size[0]), float(trim_size[1])

        if paper_type not in PAPER_THICKNESS:
            raise ValueError(f"Unbekannter Papiertyp \'{paper_type}\'. Erlaubt: {list(PAPER_THICKNESS.keys())}")
        if book_type not in ("paperback", "hardcover"):
            raise ValueError("book_type muss \'paperback\' oder \'hardcover\' sein.")
        if book_type == "hardcover" and paper_type not in HARDCOVER_ALLOWED:
            raise ValueError(
                f"Papiertyp \'{paper_type}\' ist fuer Hardcover nicht verfuegbar. "
                f"Erlaubt: {HARDCOVER_ALLOWED}"
            )
        if pages < 24:
            raise ValueError("KDP benoetigt mindestens 24 Seiten.")
        if pages % 2 != 0:
            raise ValueError("Seitenzahl muss gerade sein.")

        self.pages      = pages
        self.paper_type = paper_type
        self.book_type  = book_type

    def calculate(self) -> CoverDimensions:
        """Berechnet alle Cover-Masse und gibt ein CoverDimensions-Objekt zurueck."""
        thickness = PAPER_THICKNESS[self.paper_type]
        if self.book_type == "paperback":
            spine   = self.pages * thickness + PAPERBACK_SPINE_EXTRA
            bleed   = PAPERBACK_BLEED
        else:
            spine   = self.pages * thickness + HARDCOVER_SPINE_EXTRA
            bleed   = HARDCOVER_WRAP
        total_w = bleed + self.trim_w + spine + self.trim_w + bleed
        total_h = bleed + self.trim_h + bleed
        return CoverDimensions(
            book_type     = self.book_type,
            trim_w        = self.trim_w,
            trim_h        = self.trim_h,
            pages         = self.pages,
            paper_type    = self.paper_type,
            spine_width   = round(spine, 6),
            bleed_or_wrap = bleed,
            total_cover_w = round(total_w, 6),
            total_cover_h = round(total_h, 6),
        )

    def export_svg(self, filepath: str = "kdp_cover_template.svg") -> str:
        """
        Exportiert eine SVG-Vorlage mit farbcodierten Zonen und Hilfslinien:
          Blau  = Ruecktitel | Gruen = Vordertitel | Orange = Spine
          Gestrichelt blau = Safe Zone | Rot gestrichelt = Spine-Mitte
        Gibt den Dateipfad zurueck.
        """
        dims = self.calculate()
        d    = dims.as_dict()

        W  = d["total_w_px"]
        H  = d["total_h_px"]
        b  = inch_to_px(d["bleed_or_wrap_in"])
        sw = d["spine_w_px"]
        tw = inch_to_px(self.trim_w)
        th = inch_to_px(self.trim_h)
        sz = inch_to_px(SAFE_ZONE)

        xs  = b + tw          # Spine-Start X
        xsm = xs + sw // 2    # Spine-Mitte X
        xf  = xs + sw         # Vordertitel-Start X

        title_line = (
            f"KDP Cover-Vorlage | {self.trim_w}x{self.trim_h} | "
            f"{self.pages}S | {PAPER_LABELS[self.paper_type]} | {self.book_type}"
        )
        info_line = (
            f"Gesamt: {d['total_w_mm']}mm x {d['total_h_mm']}mm | "
            f"{d['total_w_px']} x {d['total_h_px']} px @ 300 DPI | "
            f"Spine: {d['spine_w_mm']}mm ({d['spine_w_px']}px)"
        )

        def rect(x,y,w,h,fill,op=1.0,stroke="none",sw2=0,dash=""):
            s = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" opacity="{op}"'
            if stroke != "none":
                s += f' stroke="{stroke}" stroke-width="{sw2}"'
            if dash:
                s += f' stroke-dasharray="{dash}"'
            return s + "/>"

        def line(x1,y1,x2,y2,col,sw2,dash="",op=1.0):
            s = f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{col}" stroke-width="{sw2}" opacity="{op}"'
            if dash:
                s += f' stroke-dasharray="{dash}"'
            return s + "/>"

        def text(x,y,msg,size,fill,anchor="middle",op=1.0,transform=""):
            t = f'<text x="{x}" y="{y}" font-family="Georgia,serif" font-size="{size}" '
            t += f'fill="{fill}" text-anchor="{anchor}" opacity="{op}"'
            if transform:
                t += f' transform="{transform}"'
            return t + f'>{msg}</text>'

        svg_parts = [
            f'<?xml version="1.0" encoding="UTF-8"?>',
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',

            # Hintergrund (Bleed-Zone)
            rect(0, 0, W, H, "#f5ede0", 0.5),

            # Ruecktitel
            rect(b, b, tw, th, "#cce0f5", 0.75),
            # Vordertitel
            rect(xf, b, tw, th, "#d0ecd0", 0.75),
            # Spine
            rect(xs, b, sw, th, "#fde0b8", 0.85),

            # Safe Zones
            rect(b+sz, b+sz, tw-2*sz, th-2*sz, "none", 1, "#2255aa", 4, "14,7"),
            rect(xf+sz, b+sz, tw-2*sz, th-2*sz, "none", 1, "#2255aa", 4, "14,7"),
            rect(xs+sz, b+sz, max(1, sw-2*sz), th-2*sz, "none", 1, "#cc4400", 3, "8,5"),

            # Spine-Mittellinie
            line(xsm, 0, xsm, H, "#cc2200", 3, "8,6", 0.75),

            # Trennlinien Spine
            line(xs, 0, xs, H, "#994400", 2, "", 0.65),
            line(xf, 0, xf, H, "#994400", 2, "", 0.65),

            # Schnittlinie (Trim)
            rect(b, b, W-2*b, H-2*b, "none", 0.9, "#333333", 3),
            # Aeusserer Rahmen (Bleed)
            rect(0, 0, W, H, "none", 0.5, "#aaaaaa", 4),

            # Beschriftung Ruecktitel
            text(b+tw//2, H//2-30, "RUECKTITEL", 52, "#224466", "middle", 0.65),
            text(b+tw//2, H//2+40, f"{inch_to_mm(self.trim_w):.1f}mm x {inch_to_mm(self.trim_h):.1f}mm", 32, "#224466", "middle", 0.5),

            # Beschriftung Vordertitel
            text(xf+tw//2, H//2-30, "VORDERTITEL", 52, "#225522", "middle", 0.65),
            text(xf+tw//2, H//2+40, f"{inch_to_mm(self.trim_w):.1f}mm x {inch_to_mm(self.trim_h):.1f}mm", 32, "#225522", "middle", 0.5),

            # Beschriftung Spine (vertikal)
            text(xsm, H//2, f"SPINE {inch_to_mm(dims.spine_width):.2f}mm",
                 30, "#883300", "middle", 0.85,
                 f"rotate(-90,{xsm},{H//2})"),

            # Kopfzeilen
            text(W//2, 45, title_line, 28, "#333333", "middle", 0.85),
            text(W//2, 85, info_line,  24, "#555555", "middle", 0.75),

            # Legende unten
            '<rect x="20" y="' + str(H-95) + '" width="22" height="22" fill="#cce0f5" opacity="0.9"/>',
            '<text x="50" y="' + str(H-77) + '" font-family="sans-serif" font-size="24" fill="#333">Ruecktitel</text>',
            '<rect x="200" y="' + str(H-95) + '" width="22" height="22" fill="#d0ecd0" opacity="0.9"/>',
            '<text x="230" y="' + str(H-77) + '" font-family="sans-serif" font-size="24" fill="#333">Vordertitel</text>',
            '<rect x="390" y="' + str(H-95) + '" width="22" height="22" fill="#fde0b8" opacity="0.9"/>',
            '<text x="420" y="' + str(H-77) + '" font-family="sans-serif" font-size="24" fill="#333">Spine</text>',
            f'<line x1="520" y1="{H-84}" x2="550" y2="{H-84}" stroke="#2255aa" stroke-width="4" stroke-dasharray="10,5"/>',
            f'<text x="560" y="{H-77}" font-family="sans-serif" font-size="24" fill="#333">Safe Zone</text>',
            f'<line x1="700" y1="{H-84}" x2="730" y2="{H-84}" stroke="#cc2200" stroke-width="3" stroke-dasharray="8,5"/>',
            f'<text x="740" y="{H-77}" font-family="sans-serif" font-size="24" fill="#333">Spine-Mitte</text>',

            "</svg>",
        ]

        svg_str = "\n".join(svg_parts)
        Path(filepath).write_text(svg_str, encoding="utf-8")
        return filepath

    def export_png(self, filepath: str = "kdp_cover_template.png", scale: float = 0.25) -> str:
        """
        Exportiert eine PNG-Vorschau (benoetigt cairosvg: pip install cairosvg).
        scale: Verkleinerungsfaktor relativ zur 300-DPI-Vollgroesse.
        """
        try:
            import cairosvg
        except ImportError:
            raise ImportError("cairosvg nicht installiert. Bitte: pip install cairosvg")
        svg_tmp = filepath.replace(".png", "_tmp_template.svg")
        self.export_svg(svg_tmp)
        d     = self.calculate().as_dict()
        out_w = int(d["total_w_px"] * scale)
        out_h = int(d["total_h_px"] * scale)
        cairosvg.svg2png(
            url=str(Path(svg_tmp).resolve()),
            write_to=filepath,
            output_width=out_w,
            output_height=out_h,
        )
        Path(svg_tmp).unlink(missing_ok=True)
        return filepath


# ---------------------------------------------------------------------------
# CLI-Demo beim direkten Ausfuehren
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("\n=== KDP Cover Calculator – Demo ===\n")
    list_trim_sizes()
    print()

    examples = [
        dict(trim_size="6x9",   pages=250, paper_type="bw_cream",   book_type="paperback"),
        dict(trim_size="5.5x8.5", pages=180, paper_type="prem_color", book_type="hardcover"),
        dict(trim_size="5x8",   pages=120, paper_type="bw_white",   book_type="paperback"),
    ]
    for kw in examples:
        calc = KDPCoverCalculator(**kw)
        print(calc.calculate().summary())
        print()

    print("Kindle E-Book Cover:")
    for k, v in kindle_cover_size().items():
        print(f"  {k}: {v}")
