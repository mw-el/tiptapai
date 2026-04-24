# EPUB Companion Export — Derived from LiX Templates

**Status:** Planning — deferred until LiX templates are refined
**Created:** 2026-04-24
**Owner:** mw
**Related pipeline:** `renderer/book-export-lix/` (LiX / Tectonic PDF)

---

## Goal

Every "Buch" export produces a **print-ready PDF (LiX/LaTeX)** *and* a
**companion EPUB** from the same source markdown, with EPUB aesthetics
derived from the refined LiX templates so print and ebook feel like one
family.

User intent: *"It would be nice to always create a print and an EPUB
version from a text file which has similar aesthetics."*

Reflowable EPUB cannot match typeset PDF exactly. The target is
**aesthetic kinship**, not pixel parity: same font family, same chapter
rhythm, same ornaments, same tone.

---

## Prerequisites

This work is **blocked** until the LiX templates are frozen. The EPUB
CSS will be mechanically derived from decisions made there:

- Final body font choice(s) per profile (currently EB Garamond)
- Chapter-opening style (small caps? rule? drop cap? ornament above?)
- Scene-break glyph / ornament
- Heading hierarchy styling (h1–h4 sizes, weights, spacing)
- Frontmatter layout (half-title, title page, copyright, dedication, toc)
- Backmatter layout (about-the-author, colophon)
- Per-profile deviations (`novel`, `novella`, `textbook`, `poetry`)

→ Once the LiX look is locked in, translate each of the above into the
EPUB CSS. Treat the LiX output as the **reference rendering**; open a
PDF page and its EPUB counterpart side by side while iterating.

---

## Architecture

### Where it hooks in

The existing handler in `main-book-export-lix.js` runs
`book-export-lix-compile`. After the Tectonic run succeeds, an EPUB
step runs in the same tmp workspace and writes `<stem>.epub` alongside
`<stem>.pdf` in the chosen output directory.

Both artifacts come from the **same BookIR** produced by
`renderer/book-export-lix/parser.js`. No second parse, no second
metadata plumbing.

```
 markdown
     │
     ▼
 parser.js  ─▶  BookIR  ─┬─▶  tex-builder.js ─▶  .tex ─▶ Tectonic ─▶ PDF
                         │
                         └─▶  epub-builder.js ─▶ .xhtml+css+opf ─▶ EPUB
```

### New files

| Path | Role |
|---|---|
| `renderer/book-export-lix/epub-builder.js` | BookIR → EPUB (xhtml + opf + ncx) |
| `renderer/book-export-lix/epub.css` | Typography, derived from LiX |
| `renderer/book-export-lix/epub-assets/` | Embedded fonts + ornament SVGs |
| `renderer/book-export-lix/profiles/` *(optional)* | Per-profile CSS overrides |

### Builder options

Two viable routes for assembling the EPUB container:

**Option A — Pandoc-based (fast path)**
- Pass the raw markdown + a derived YAML metadata block + `epub.css` to
  pandoc with `--epub-cover-image`, `--epub-embed-font`, `--toc`.
- Pros: zero new dependencies *if* Pandoc stays mandatory; battle-tested
  EPUB 3 output; handles TOC/nav/OPF automatically.
- Cons: less control over chapter-break semantics; pandoc's internal
  markdown reader diverges slightly from our BookIR (directive blocks
  `::: poem`, theorem boxes etc.).

**Option B — Custom builder over BookIR**
- Emit xhtml per chapter directly from BookIR, write OPF + `nav.xhtml` +
  `content.opf` manually, zip with `jszip` (already a dependency).
- Pros: single source of truth (BookIR), identical block semantics in
  print and EPUB, no reliance on pandoc's markdown flavor.
- Cons: more code to maintain; must implement TOC/nav/cover wiring.

**Recommendation:** start with **A** for the first pass so we have
something shipping. Migrate to **B** when a BookIR block can't be
rendered correctly by pandoc, or when profile-specific chapter logic
diverges too far from generic markdown. Keep `epub-builder.js` as the
single entry point so the internal engine is swappable.

---

## CSS derivation from LiX — mapping table

Fill this in once LiX is frozen. Each LaTeX construct maps to a CSS
equivalent (best-effort for reflowable).

| LiX construct | EPUB equivalent | Notes |
|---|---|---|
| `\documentclass{novel}` body font | `@font-face` EB Garamond + `body { font-family: … }` | Embed via `epub-assets/` |
| Chapter opening (small caps + rule) | `h1.chapter-title { font-variant: small-caps; border-bottom: … }` | |
| Drop cap (`lettrine`) | `p.chapter-opening::first-letter { … }` | Profile-gated: novel/novella yes, textbook no |
| Scene break (`pgfornament`) | `<hr class="scene-break">` with SVG background | Or Unicode `❧` fallback |
| Poem block `::: poem` | `<div class="poem"><pre class="verse">` | Preserve line breaks |
| Theorem block | `<aside class="theorem">` with box styling | |
| Running header / folio | — | Not applicable in reflowable EPUB |
| Recto/verso page rules | — | Not applicable |
| Hyphenation (babel) | `lang` attribute on `<html>` + CSS `hyphens: auto` | Reader-engine-dependent |
| Microtype | — | Not applicable |
| Page geometry (trim size, margins) | — | Not applicable — reflowable |

---

## Metadata flow

Pulled from the same `TT_bookConfig` the PDF uses. No duplication in
the book-frontmatter dialog.

| EPUB metadata | Source |
|---|---|
| `dc:title` | `metadata.title` |
| `dc:creator` | `metadata.authors[*]` |
| `dc:publisher` | `metadata.publisher` |
| `dc:date` | `metadata.publishedYear` |
| `dc:language` | `metadata.language` (BCP-47, kept as-is for EPUB) |
| `dc:rights` / license | `metadata.license` (CC types mapped to rights URL) |
| `dc:identifier` | `metadata.isbn.ebook` if present, else generated UUID |
| Subtitle | `<meta property="title-type">subtitle</meta>` |
| Series | *(future, if added to TT_bookConfig)* |

---

## Cover handling

The book-frontmatter dialog currently collects a **PDF** cover for
LaTeX. EPUB needs a raster image.

**Decision needed (pick at implementation time):**

- **(a)** Skip EPUB cover when only a PDF cover is present. Safe
  fallback, zero UX impact.
- **(b)** Auto-convert cover PDF → PNG at build time via `sips`
  (macOS built-in) or `pdftoppm` (Linux, poppler). Fall back to (a) if
  the tool is missing.
- **(c)** Add an optional "Cover-Bild (EPUB)" field to the
  book-frontmatter dialog. Explicit, no extra tooling.

**Leaning toward (b)** — invisible to the user, leverages what's
already on the box. Falls through to (a) silently if conversion fails,
with a warning in the success dialog.

---

## Font embedding

Reuse the fonts already bundled in `app/fonts/`:

- EB Garamond (body) — licensed OFL, embeddable
- Source Serif 4 (fallback)
- Source Code Pro (code blocks)
- Inter (captions / UI-ish elements, if used)

Verify each font license permits EPUB embedding before release. All
currently in `app/fonts/` are OFL — should be fine.

Embed via `@font-face` inside `epub.css`, ship the font files inside
the EPUB under `OEBPS/fonts/`.

---

## UX decisions

| Question | Proposed default |
|---|---|
| Make EPUB optional? | No — always emitted alongside PDF. Matches the user's stated intent. |
| EPUB version | EPUB 3 (pandoc default). Drop EPUB 2 support — Kindle-classic is not a target. |
| Failure semantics | If EPUB fails but PDF succeeded → report success with warning about missing EPUB. The PDF is the primary artifact. |
| Success dialog | List both paths, offer to reveal **either** in Finder. Current single-file open dialog must grow to two buttons. |
| Filename | `<stem>.pdf` + `<stem>.epub` side by side in the chosen directory. |

---

## Profile mapping

The existing profiles (`novel`, `novella`, `textbook`, `poetry`) need
EPUB counterparts. Start with:

- `novel` / `novella` — drop caps on chapter opens, scene-break
  ornaments, generous chapter spacing
- `textbook` — no drop caps, numbered headings, callout boxes for
  theorems/definitions, tighter spacing
- `poetry` — verse-preserving, centered stanzas optional, no drop caps

One shared `epub.css` with `body.profile-novel`, `body.profile-textbook`
etc. — avoids CSS-file explosion, lets the same stylesheet ship in
every EPUB.

---

## Open questions

- **Drop caps in EPUB:** `::first-letter` support is inconsistent across
  reader engines (Apple Books good, Kindle mediocre, older ADE bad).
  Ship them anyway and let degradation be graceful?
- **SVG ornaments:** reflowable EPUB supports SVG, but some readers
  downscale badly. Provide a PNG fallback?
- **Pandoc availability:** current Pandoc-based plan requires pandoc at
  runtime. Already required for other export formats, so no new
  install. But if we move to custom builder (Option B) we can drop this
  dependency for the book route.
- **Testing matrix:** which readers do we validate against before
  calling it done? Suggest: Apple Books (macOS), Calibre (cross-platform
  reference viewer), Thorium Reader (EPUB 3 reference implementation).

---

## Implementation checklist

When LiX is frozen and we're ready to implement:

- [ ] Lock the CSS derivation table above (fill in concrete values)
- [ ] Create `renderer/book-export-lix/epub-builder.js` (Option A: Pandoc-based)
- [ ] Create `renderer/book-export-lix/epub.css` with profile classes
- [ ] Copy needed fonts into `renderer/book-export-lix/epub-assets/fonts/`
- [ ] Wire EPUB step into `main-book-export-lix.js` after Tectonic success
- [ ] Add cover-conversion helper (PDF → PNG via `sips`/`pdftoppm`)
- [ ] Extend `compileResult.files` to include `epub` path
- [ ] Update `handleBookExport` in `renderer/ui/export-dialog.js` to show
      both paths in the success dialog with two reveal buttons
- [ ] Manual test against Apple Books + Calibre + Thorium
- [ ] Document in README under "Buch-Export"

---

## Non-goals

- Pixel parity with the PDF (impossible in reflowable)
- Complex layouts (multi-column, floats, footnotes-on-page)
- Print-specific features (recto/verso, running heads, folio, crop
  marks, bleed)
- KF8 / `.mobi` / `.azw3` output — EPUB only; users convert to Kindle
  via Calibre if needed
- DRM / encryption
