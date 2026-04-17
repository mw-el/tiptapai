---
name: folien-erstellen
description: "Baut aus einem Markdown-Text oder einer URL ein Vortragsfolien-Set als .slid-Präsentation mit Sprechertext pro Folie, ohne Lernziele und ohne Übungen. Trigger (Spracheingabe-tolerant, Gross-/Kleinschreibung, Bindestriche und Wortabstände spielen keine Rolle): 'Folien erstellen', 'folien erstellen', 'Folie erstellen', 'Foliensatz erstellen', 'Folienset erstellen', 'Folien bauen/machen/anlegen/generieren', 'Präsentation erstellen', 'Präsi erstellen', 'Slides erstellen', 'Vortragsfolien', 'Vortrag aus Text', 'Slides aus URL', 'Slide-Deck aus Artikel'."
---

# Skill: Folien erstellen (Vortragsfolien)

Dieser Skill ist **in der MW-Slides-App gepflegt**, damit es nur eine Quelle der Wahrheit gibt. Der eigentliche Skill-Inhalt liegt dort — improvisiere nicht, sondern finde und lies die kanonische Datei.

Matche den Skill grosszügig: Gross-/Kleinschreibung, Bindestriche, Leer-/Trennzeichen und leichte Wortformvarianten (Singular/Plural, Verbflexion) spielen keine Rolle. Spracheingabe-Transkripte wie „folien erstellen" oder „folie erstellen" gehören hierher.

Wenn ein Kursmodul mit Lernzielen, Übungen und Feedback gewünscht ist, nutze stattdessen den Skill `kursfolien-erstellen`.

## Finde die kanonische Skill-Datei (robust, beide OS, tolerant)

Die Datei heisst `.claude/skills/folien-erstellen/skill.md` im `_AA_Slides`-Repo. Führe die folgende Bash-Suche aus. Sie prüft bekannte Pfade, Installationsspuren, macOS-Spotlight/Linux-locate, begrenzte systemweite Suche mit Namensvarianten und – als letzten Prüfschritt vor dem Datei-Dialog – einen **Anker-Weg über den Skill-Ordnernamen selbst** (unabhängig vom Namen des äusseren App-Ordners).

```bash
SKILL="folien-erstellen"
FOUND=""

# Hilfsfunktion: bestätigt, dass der Pfad wirklich das Slides-Repo ist
# (und nicht z. B. ein Pointer-Stub in TipTapAi). Marker: design/themes/.
is_slides_repo() {
  local p="$1"
  [ -n "$p" ] \
    && [ -f "$p/.claude/skills/$SKILL/skill.md" ] \
    && [ -d "$p/design/themes" ]
}

# 1) Environment-Override
if is_slides_repo "$MW_SLIDES_ROOT"; then FOUND="$MW_SLIDES_ROOT"; fi

# 2) Bekannte Installations-/Entwicklungspfade
if [ -z "$FOUND" ]; then
  for p in \
    "/Users/erlkoenig/Documents/AA/_AA_Slides" \
    "/home/matthias/_AA_Slides" \
    "$HOME/Documents/AA/_AA_Slides" \
    "$HOME/AA/_AA_Slides" \
    "$HOME/_AA_Slides" \
    "$HOME/Projects/_AA_Slides" \
    "$HOME/Desktop/_AA_Slides" \
    "/opt/_AA_Slides" \
    "/opt/mw-slides"; do
    if is_slides_repo "$p"; then FOUND="$p"; break; fi
  done
fi

# 3) Linux: .desktop-Eintrag von install.sh parsen (Path=...)
if [ -z "$FOUND" ]; then
  for f in "$HOME/.local/share/applications/mw-slides.desktop" \
           "/usr/share/applications/mw-slides.desktop" \
           "/usr/local/share/applications/mw-slides.desktop"; do
    [ -f "$f" ] || continue
    p=$(awk -F= '/^Path=/{sub(/^Path=/,""); print; exit}' "$f")
    if is_slides_repo "$p"; then FOUND="$p"; break; fi
  done
fi

# 4) macOS: Spotlight – direkt nach dem Skill-Ordner suchen
if [ -z "$FOUND" ] && command -v mdfind >/dev/null 2>&1; then
  while IFS= read -r skillDir; do
    parent="$(cd "$skillDir/../../.." 2>/dev/null && pwd)"
    if is_slides_repo "$parent"; then FOUND="$parent"; break; fi
  done < <(mdfind -name "$SKILL" 2>/dev/null | head -10)
  if [ -z "$FOUND" ]; then
    for term in "_AA_Slides" "AA_Slides" "AA-Slides" "mw-slides" "mw_slides"; do
      while IFS= read -r p; do
        if is_slides_repo "$p"; then FOUND="$p"; break; fi
      done < <(mdfind -name "$term" 2>/dev/null | head -10)
      [ -n "$FOUND" ] && break
    done
  fi
fi

# 5) Linux: locate – analog
if [ -z "$FOUND" ] && command -v locate >/dev/null 2>&1; then
  while IFS= read -r skillDir; do
    [ -d "$skillDir" ] || continue
    parent="$(cd "$skillDir/../../.." 2>/dev/null && pwd)"
    if is_slides_repo "$parent"; then FOUND="$parent"; break; fi
  done < <(locate -b -i -- "$SKILL" 2>/dev/null | head -20)
  if [ -z "$FOUND" ]; then
    for term in "_AA_Slides" "AA_Slides" "AA-Slides" "mw-slides" "mw_slides"; do
      while IFS= read -r p; do
        if is_slides_repo "$p"; then FOUND="$p"; break; fi
      done < <(locate -b -i -- "$term" 2>/dev/null | head -20)
      [ -n "$FOUND" ] && break
    done
  fi
fi

# 6) Begrenzte systemweite Suche (case-insensitive, mehrere App-Ordnernamen)
if [ -z "$FOUND" ]; then
  for root in /home /Users /opt /usr/local /mnt /media /Volumes /Applications; do
    [ -d "$root" ] || continue
    while IFS= read -r p; do
      if is_slides_repo "$p"; then FOUND="$p"; break; fi
    done < <(find "$root" -maxdepth 6 -type d \
      \( -iname "_AA_Slides" -o -iname "_AA-Slides" \
         -o -iname "AA_Slides" -o -iname "AA-Slides" \
         -o -iname "mw-slides" -o -iname "mw_slides" \) \
      2>/dev/null | head -20)
    [ -n "$FOUND" ] && break
  done
fi

# 7) Anker-Suche: finde den Skill-Ordner selbst (robust gegen Umbenennung des App-Ordners)
if [ -z "$FOUND" ]; then
  for root in /home /Users /opt /usr/local /mnt /media /Volumes; do
    [ -d "$root" ] || continue
    while IFS= read -r skillDir; do
      parent="$(cd "$skillDir/../../.." 2>/dev/null && pwd)"
      if is_slides_repo "$parent"; then FOUND="$parent"; break; fi
    done < <(find "$root" -maxdepth 8 -type d -iname "$SKILL" 2>/dev/null | head -10)
    [ -n "$FOUND" ] && break
  done
fi

if [ -n "$FOUND" ]; then
  echo "FOUND: $FOUND/.claude/skills/$SKILL/skill.md"
else
  echo "NOT_FOUND"
fi
```

## Wenn `NOT_FOUND`: Datei-Dialog als Rückfall

Versuche auf diesem System einen nativen Datei-Dialog. Erster erfolgreicher Weg gewinnt – Ausgabe ist der absolute Pfad zur `skill.md`:

```bash
# macOS
if command -v osascript >/dev/null 2>&1; then
  osascript -e 'try
POSIX path of (choose file with prompt "skill.md der MW-Slides-App auswählen (folien-erstellen/skill.md)" of type {"public.plain-text","net.daringfireball.markdown","public.data"})
end try' 2>/dev/null
fi

# Linux: zenity, kdialog, yad
if command -v zenity >/dev/null 2>&1; then
  zenity --file-selection --title="skill.md der MW-Slides-App auswählen" --file-filter="*.md" 2>/dev/null
elif command -v kdialog >/dev/null 2>&1; then
  kdialog --getopenfilename "$HOME" "*.md" --title "skill.md der MW-Slides-App auswählen" 2>/dev/null
elif command -v yad >/dev/null 2>&1; then
  yad --file --title="skill.md der MW-Slides-App auswählen" --file-filter="*.md" 2>/dev/null
fi
```

## Wenn auch der Dialog scheitert

Frage den Nutzer direkt nach dem absoluten Pfad zur `skill.md` (z. B. „Bitte gib den absoluten Pfad zur Datei `folien-erstellen/skill.md` im `_AA_Slides`-Repo ein."). Improvisiere den Skill-Inhalt nicht.

## Nach dem Finden

Lies die gefundene `skill.md` mit dem Read-Tool und folge ihren Anweisungen vollständig. Der gesamte Skill-Inhalt – Prozess, Layouts, `speakerText`-Regeln, Folienstruktur, Checkliste – steht dort.
