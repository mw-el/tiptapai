# TipTap AI - Auto-Save

**Status:** ✅ Abgeschlossen
**Erstellt:** 2025-10-18 18:36
**Updated:** 2025-10-18 18:42

---

## Ziel

**Sprint 1.3: Auto-Save**

Automatisches Speichern implementieren:
- Speichert 2 Sekunden nach letzter Änderung
- Keine Arbeit geht verloren
- lastPosition wird automatisch aktualisiert
- Visuelles Feedback ("Gespeichert...")

---

## Implementierungsplan

### Sprint 1.3 Schritte

- [✅] Dev Document erstellen (diese Datei)
- [✅] Auto-Save Timer implementieren (debounce 2s)
- [✅] onUpdate Hook in TipTap nutzen
- [✅] Visuelles Feedback ("Speichert...", "Gespeichert")
- [✅] Testen

---

## Implementierung

**Konzept:**
- TipTap `onUpdate` Event nutzen
- Debounce: 2 Sekunden nach letzter Änderung
- Automatisch saveFile() aufrufen
- Status anzeigen im UI

**Code:**
```javascript
let autoSaveTimer = null;

const editor = new Editor({
  onUpdate: ({ editor }) => {
    // Debounce: 2s nach letzter Änderung
    clearTimeout(autoSaveTimer);

    showStatus('Änderungen...');

    autoSaveTimer = setTimeout(() => {
      if (currentFilePath) {
        showStatus('Speichert...');
        saveFile(true); // true = auto-save
      }
    }, 2000);
  },
});
```

---

## Acceptance Criteria

- [✅] Auto-Save nach 2s Pause
- [✅] Status-Anzeige: "Änderungen...", "Speichert...", "Gespeichert"
- [✅] Keine Duplikate beim schnellen Tippen
- [✅] Funktioniert mit Frontmatter

---

**Siehe:** `docs/DEVELOPMENT_PLAN.md`
