/**
 * DEBUG: Test verschiedene Editor APIs um herauszufinden,
 * wie wir am besten die Markdown-Quelle bekommen
 *
 * Kopiere diesen Code und führe ihn in der Browser-Console aus:
 * F12 → Console → Paste und Enter
 */

console.log('='.repeat(70));
console.log('EDITOR API EXPLORATION');
console.log('='.repeat(70));

// 1. Prüfe ob currentEditor existiert
console.log('\n1. IST currentEditor verfügbar?');
console.log('-'.repeat(70));
if (typeof currentEditor !== 'undefined') {
  console.log('✓ currentEditor existiert');
  console.log('  Type:', typeof currentEditor);
} else {
  console.log('✗ currentEditor nicht gefunden');
}

// 2. Prüfe verfügbare Methoden
console.log('\n2. VERFÜGBARE METHODEN:');
console.log('-'.repeat(70));

const methods = [
  'getHTML',
  'getText',
  'getJSON',
  'getMarkdown',
  'getDoc',
  'getState',
];

methods.forEach(method => {
  const hasMethod = typeof currentEditor[method] === 'function';
  console.log(`${hasMethod ? '✓' : '✗'} editor.${method}()`);
  if (hasMethod) {
    try {
      const result = currentEditor[method]();
      const preview = typeof result === 'string'
        ? result.substring(0, 100) + (result.length > 100 ? '...' : '')
        : JSON.stringify(result).substring(0, 100) + '...';
      console.log(`    → ${preview}`);
    } catch (e) {
      console.log(`    → ERROR: ${e.message}`);
    }
  }
});

// 3. Prüfe storage
console.log('\n3. STORAGE PROPERTIES:');
console.log('-'.repeat(70));
if (currentEditor.storage) {
  console.log('✓ editor.storage existiert');
  console.log('  Keys:', Object.keys(currentEditor.storage));

  Object.keys(currentEditor.storage).forEach(key => {
    console.log(`\n  storage.${key}:`, currentEditor.storage[key]);
    if (typeof currentEditor.storage[key] === 'object') {
      console.log(`    Sub-keys:`, Object.keys(currentEditor.storage[key]));
    }
  });
} else {
  console.log('✗ editor.storage nicht vorhanden');
}

// 4. Prüfe extensionManager
console.log('\n4. EXTENSION MANAGER:');
console.log('-'.repeat(70));
if (currentEditor.extensionManager) {
  console.log('✓ editor.extensionManager existiert');
  const extensions = currentEditor.extensionManager.extensions || [];
  console.log('  Installed extensions:');
  extensions.forEach(ext => {
    console.log(`    - ${ext.name}`);
  });
}

// 5. Vergleiche die outputs
console.log('\n5. VERGLEICH getText() vs getHTML():');
console.log('-'.repeat(70));

try {
  const html = currentEditor.getHTML();
  const text = currentEditor.getText();

  console.log(`HTML length: ${html.length} chars`);
  console.log(`TEXT length: ${text.length} chars`);
  console.log(`\nHTML (first 200 chars):\n${html.substring(0, 200)}`);
  console.log(`\nTEXT (first 200 chars):\n${text.substring(0, 200)}`);

  console.log('\nProbleme mit getText():');
  console.log('- Struktur-Informationen fehlen');
  console.log('- List markers (-) sind weg');
  console.log('- Heading markers (#) sind weg');
  console.log('- LanguageTool Offsets sind damit falsch!');
} catch (e) {
  console.log('ERROR:', e.message);
}

// 6. Strategie-Empfehlung
console.log('\n6. EMPFOHLENE STRATEGIE:');
console.log('-'.repeat(70));
console.log(`
Basierend auf den Tests oben:

Option A: Wenn editor.getMarkdown() existiert
  → Nutze das direkt!
  → Offsets sind 100% korrekt

Option B: Wenn nicht, nutze HTML→Markdown
  → getHTML() → htmlToMarkdown() → Markdown
  → Aber teste ob htmlToMarkdown() korrekt ist!

Option C: Nutze getJSON() + custom JSON→Markdown
  → Komplex, aber sehr kontrollierbar

WICHTIG: Teste mit einem Dokument mit Listen!
         Dort sieht man die Probleme am deutlichsten.
`);

console.log('\n' + '='.repeat(70));
console.log('NÄCHSTER SCHRITT:');
console.log('='.repeat(70));
console.log('1. Kopiere die Ergebnisse oben');
console.log('2. Zeige sie dem Entwickler');
console.log('3. Basierend darauf implementieren wir die Lösung');
console.log('='.repeat(70));
