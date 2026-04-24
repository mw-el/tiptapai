# Bundled Fonts for Book Export Pipeline

This directory contains the fonts used by the book export pipeline.
These font files are vendored in the repository so book exports stay stable across machines.

## Required Fonts

### Serif (Body Text)

**Source Serif 4** by Adobe (SIL Open Font License 1.1)
- Download: https://fonts.google.com/specimen/Source+Serif+4
- Files needed:
  - `SourceSerif4-Regular.ttf`
  - `SourceSerif4-Bold.ttf`
  - `SourceSerif4-Italic.ttf`
  - `SourceSerif4-BoldItalic.ttf`

### Sans-Serif (Headings)

**Inter** by Rasmus Andersson (SIL Open Font License 1.1)
- Download: https://fonts.google.com/specimen/Inter
- Files needed:
  - `Inter-Regular.ttf`
  - `Inter-Bold.ttf`

### Monospace (Code Blocks)

**Source Code Pro** by Adobe (SIL Open Font License 1.1)
- Download: https://fonts.google.com/specimen/Source+Code+Pro
- Files needed:
  - `SourceCodePro-Regular.ttf`

## Repository State

The repository includes these files directly:
- `SourceSerif4-Regular.ttf`
- `SourceSerif4-Bold.ttf`
- `SourceSerif4-Italic.ttf`
- `SourceSerif4-BoldItalic.ttf`
- `Inter-Regular.ttf`
- `Inter-Bold.ttf`
- `SourceCodePro-Regular.ttf`

The matching upstream license texts are included as:
- `LICENSE-SourceSerif4.txt`
- `LICENSE-Inter.txt`
- `LICENSE-SourceCodePro.txt`

## Recovery

If this folder is ever pruned locally, run:

```bash
./install-book-fonts.sh
```

That script first keeps existing bundled fonts untouched. Only if the files are missing does it try to restore the exact open-source families from local font installations.

## License

All recommended fonts are licensed under the SIL Open Font License 1.1, which permits bundling with applications.
