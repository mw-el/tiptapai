#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FONTS_DIR="$SCRIPT_DIR/app/fonts"
REQUIRED_FONTS=(
  "SourceSerif4-Regular.ttf"
  "SourceSerif4-Bold.ttf"
  "SourceSerif4-Italic.ttf"
  "SourceSerif4-BoldItalic.ttf"
  "Inter-Regular.ttf"
  "Inter-Bold.ttf"
  "SourceCodePro-Regular.ttf"
)

mkdir -p "$FONTS_DIR"

all_required_fonts_present() {
  local font
  for font in "${REQUIRED_FONTS[@]}"; do
    if [ ! -f "$FONTS_DIR/$font" ]; then
      return 1
    fi
  done
  return 0
}

copy_first_found() {
  local target="$1"
  shift

  for candidate in "$@"; do
    if [ -f "$candidate" ]; then
      cp -f "$candidate" "$FONTS_DIR/$target"
      echo "Installed $target from $candidate"
      return 0
    fi
  done

  echo "Missing $target" >&2
  return 1
}

install_exact_open_fonts() {
  local platform="$1"
  local failures=0

  if [ "$platform" = "macos" ]; then
    copy_first_found "SourceSerif4-Regular.ttf" \
      "$HOME/Library/Fonts/SourceSerif4-Regular.ttf" \
      "/Library/Fonts/SourceSerif4-Regular.ttf" || failures=1
    copy_first_found "SourceSerif4-Bold.ttf" \
      "$HOME/Library/Fonts/SourceSerif4-Bold.ttf" \
      "/Library/Fonts/SourceSerif4-Bold.ttf" || failures=1
    copy_first_found "SourceSerif4-Italic.ttf" \
      "$HOME/Library/Fonts/SourceSerif4-Italic.ttf" \
      "/Library/Fonts/SourceSerif4-Italic.ttf" || failures=1
    copy_first_found "SourceSerif4-BoldItalic.ttf" \
      "$HOME/Library/Fonts/SourceSerif4-BoldItalic.ttf" \
      "/Library/Fonts/SourceSerif4-BoldItalic.ttf" || failures=1

    copy_first_found "Inter-Regular.ttf" \
      "$HOME/Library/Fonts/Inter-Regular.ttf" \
      "/Library/Fonts/Inter-Regular.ttf" || failures=1
    copy_first_found "Inter-Bold.ttf" \
      "$HOME/Library/Fonts/Inter-Bold.ttf" \
      "/Library/Fonts/Inter-Bold.ttf" || failures=1

    copy_first_found "SourceCodePro-Regular.ttf" \
      "$HOME/Library/Fonts/SourceCodePro-Regular.ttf" \
      "/Library/Fonts/SourceCodePro-Regular.ttf" || failures=1
  else
    copy_first_found "SourceSerif4-Regular.ttf" \
      "$HOME/.local/share/fonts/SourceSerif4-Regular.ttf" \
      "/usr/share/fonts/truetype/adobe-source-serif/SourceSerif4-Regular.ttf" || failures=1
    copy_first_found "SourceSerif4-Bold.ttf" \
      "$HOME/.local/share/fonts/SourceSerif4-Bold.ttf" \
      "/usr/share/fonts/truetype/adobe-source-serif/SourceSerif4-Bold.ttf" || failures=1
    copy_first_found "SourceSerif4-Italic.ttf" \
      "$HOME/.local/share/fonts/SourceSerif4-Italic.ttf" \
      "/usr/share/fonts/truetype/adobe-source-serif/SourceSerif4-Italic.ttf" || failures=1
    copy_first_found "SourceSerif4-BoldItalic.ttf" \
      "$HOME/.local/share/fonts/SourceSerif4-BoldItalic.ttf" \
      "/usr/share/fonts/truetype/adobe-source-serif/SourceSerif4-BoldItalic.ttf" || failures=1

    copy_first_found "Inter-Regular.ttf" \
      "$HOME/.local/share/fonts/Inter-Regular.ttf" \
      "/usr/share/fonts/truetype/inter/Inter-Regular.ttf" || failures=1
    copy_first_found "Inter-Bold.ttf" \
      "$HOME/.local/share/fonts/Inter-Bold.ttf" \
      "/usr/share/fonts/truetype/inter/Inter-Bold.ttf" || failures=1

    copy_first_found "SourceCodePro-Regular.ttf" \
      "$HOME/.local/share/fonts/SourceCodePro-Regular.ttf" \
      "/usr/share/fonts/truetype/adobe-source-code-pro/SourceCodePro-Regular.ttf" || failures=1
  fi

  return "$failures"
}

main() {
  local platform
  case "$(uname -s)" in
    Darwin) platform="macos" ;;
    Linux) platform="linux" ;;
    *)
      echo "Unsupported platform for install-book-fonts.sh: $(uname -s)" >&2
      exit 1
      ;;
  esac

  if all_required_fonts_present; then
    echo "Bundled book export fonts already present in $FONTS_DIR"
    exit 0
  fi

  if install_exact_open_fonts "$platform"; then
    echo "Book export fonts prepared in $FONTS_DIR"
  else
    echo "One or more open-source font files could not be provisioned automatically." >&2
    echo "The repository normally already contains these files." >&2
    echo "See app/fonts/README.md for details." >&2
    exit 1
  fi
}

main "$@"
