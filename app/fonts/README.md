# Bundled Fonts for Book Export Pipeline

This directory contains the fonts used by the Paragraf-powered book export pipeline.

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

## Installation

1. Download each font family from the links above (ZIP from Google Fonts)
2. Extract the .ttf files into this directory
3. Rename to match the filenames listed above if necessary

## Font Discovery Fallback

If bundled fonts are missing, `main-book-export.js` will fall back to system fonts:
- macOS: Times/Helvetica/Menlo
- Linux: DejaVu Serif/Sans/Mono or Liberation Serif/Sans/Mono
- Windows: Georgia/Arial/Consolas

This ensures the pipeline works even without bundled fonts, at the cost of reduced visual consistency across systems.

## License

All recommended fonts are licensed under the SIL Open Font License 1.1, which permits bundling with applications.

Include the original license files from each font family alongside the .ttf files.
