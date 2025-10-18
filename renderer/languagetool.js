// LanguageTool API Client
// Sprint 2.1

// Lokale LanguageTool-Instanz (läuft auf Port 8081)
const LANGUAGETOOL_API = 'http://localhost:8081/v2/check';

// LanguageTool API aufrufen
export async function checkText(text, language = 'de-CH') {
  try {
    const response = await fetch(LANGUAGETOOL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        text: text,
        language: language, // de-DE, de-CH, en-US
        enabledOnly: 'false',
      }),
    });

    if (!response.ok) {
      throw new Error(`LanguageTool API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('LanguageTool matches:', data.matches.length);
    return data.matches;
  } catch (error) {
    console.error('LanguageTool API error:', error);
    return [];
  }
}

// Fehler-Match in TipTap-Position konvertieren
export function convertMatchToMark(match, text) {
  return {
    from: match.offset,
    to: match.offset + match.length,
    message: match.message,
    suggestions: match.replacements.slice(0, 5).map(r => r.value), // Top 5
    category: match.rule.category.id,
    ruleId: match.rule.id,
  };
}
