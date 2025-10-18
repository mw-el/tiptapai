# TipTap AI - LanguageTool Integration

**Status:** 🔄 In Arbeit
**Erstellt:** 2025-10-18 19:14
**Updated:** 2025-10-18 19:14

---

## Ziel

**Sprint 2.1: LanguageTool Integration**

Professionelle Rechtschreib- und Grammatikprüfung:
- LanguageTool API nutzen (öffentliche oder lokale Instanz)
- Fehler im Editor highlighten
- Korrekturvorschläge anzeigen
- Unterstützt Deutsch (DE/CH) und Englisch (US)

---

## Implementierungsplan

### Sprint 2.1 Schritte

- [⏳] Dev Document erstellen (diese Datei)
- [ ] LanguageTool npm package recherchieren
- [ ] API-Client implementieren
- [ ] Text-Extraktion aus TipTap Editor
- [ ] Fehler-Highlighting mit TipTap Marks
- [ ] Korrekturvorschläge-UI (Tooltip/Modal)
- [ ] Debounce für API-Calls (5s nach letzter Änderung)
- [ ] Testen

---

## Implementierung

**Konzept:**
- LanguageTool öffentliche API: `https://api.languagetool.org/v2/check`
- Oder: Lokale LanguageTool-Instanz (später)
- Text aus TipTap extrahieren (Markdown oder Plain Text)
- API-Call mit gewählter Sprache
- Fehler als TipTap Marks highlighten
- Click auf Fehler → Tooltip mit Vorschlägen

**LanguageTool API:**
```javascript
async function checkText(text, language) {
  const response = await fetch('https://api.languagetool.org/v2/check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      text: text,
      language: language, // de-DE, de-CH, en-US
    }),
  });

  const data = await response.json();
  return data.matches; // Array von Fehlern
}
```

**TipTap Extension für LanguageTool:**
- Custom Mark für Fehler-Highlighting
- Speichert Fehler-Info (offset, length, message, suggestions)
- CSS-Klassen: `.lt-error`, `.lt-warning`, `.lt-suggestion`

**UI:**
- Fehler als rote/gelbe Unterstreichung
- Hover/Click → Tooltip mit:
  - Fehlerbeschreibung
  - Korrekturvorschläge (anklickbar)
  - "Ignorieren"-Button

**Debounce:**
- Nur prüfen nach 5s ohne Änderung
- Nicht bei jedem Tastendruck (zu teuer)
- Status anzeigen: "Prüfe Rechtschreibung..."

---

## Technical Details

**LanguageTool Response Format:**
```json
{
  "matches": [
    {
      "message": "Möglicherweise fehlt hier ein Komma.",
      "offset": 15,
      "length": 3,
      "replacements": [
        { "value": "das," }
      ],
      "rule": {
        "id": "COMMA_MISSING",
        "category": { "id": "PUNCTUATION" }
      }
    }
  ]
}
```

**TipTap Custom Mark:**
```javascript
const LanguageToolMark = Mark.create({
  name: 'languagetool',

  addAttributes() {
    return {
      errorId: { default: null },
      message: { default: '' },
      suggestions: { default: [] },
      category: { default: 'error' },
    };
  },

  parseHTML() {
    return [{ tag: 'span.lt-error' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { class: 'lt-error', ...HTMLAttributes }, 0];
  },
});
```

---

## Acceptance Criteria

- [ ] Text wird geprüft (5s nach letzter Änderung)
- [ ] Fehler werden im Editor markiert
- [ ] Klick auf Fehler zeigt Korrekturvorschläge
- [ ] Vorschläge sind anklickbar (ersetzt Text)
- [ ] Funktioniert mit gewählter Sprache (de-DE, de-CH, en-US)
- [ ] Status-Anzeige: "Prüfe...", "Geprüft"

---

## Wichtige Hinweise

**LanguageTool öffentliche API:**
- Rate Limit: 20 Requests/IP/Minute
- Für Produktion: Premium API oder lokale Instanz empfohlen
- Lokale Installation: `java -jar languagetool-server.jar --port 8081`

**Alternative:**
- Später: Lokale LanguageTool-Instanz via Docker
- Besser für Datenschutz (keine Texte an externe API)

---

**Siehe:** `docs/DEVELOPMENT_PLAN.md`
