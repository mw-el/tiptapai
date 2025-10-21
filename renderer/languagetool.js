// LanguageTool API Client
// Sprint 2.1

// Lokale LanguageTool-Instanz (läuft auf Port 8081)
const LANGUAGETOOL_API = 'http://localhost:8081/v2/check';
const MAX_CHUNK_SIZE = 50000; // ~25 pages per chunk

// Split text into chunks at paragraph boundaries
function splitIntoChunks(text, maxChars = MAX_CHUNK_SIZE) {
  // Split by double newline (paragraph boundary)
  const paragraphs = text.split('\n\n');
  const chunks = [];
  let currentChunk = '';
  let currentOffset = 0;

  for (const para of paragraphs) {
    const paraWithSeparator = (currentChunk ? '\n\n' : '') + para;

    // If adding this paragraph exceeds limit AND we have content, start new chunk
    if (currentChunk.length + paraWithSeparator.length > maxChars && currentChunk) {
      chunks.push({
        text: currentChunk,
        offset: currentOffset,
      });
      currentOffset += currentChunk.length;
      currentChunk = para;
    } else {
      currentChunk += paraWithSeparator;
    }
  }

  // Add remaining chunk
  if (currentChunk) {
    chunks.push({
      text: currentChunk,
      offset: currentOffset,
    });
  }

  console.log(`📦 Split text into ${chunks.length} chunks:`, chunks.map(c => `${c.text.length} chars @ offset ${c.offset}`));

  return chunks;
}

// LanguageTool API aufrufen (einzelner Chunk)
async function checkTextChunk(text, language = 'de-CH') {
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
    return data.matches;
  } catch (error) {
    console.error('LanguageTool API error:', error);
    return [];
  }
}

// LanguageTool API aufrufen (mit automatischem Chunking für große Texte)
export async function checkText(text, language = 'de-CH') {
  // Kleine Texte: Direkt prüfen
  if (text.length <= MAX_CHUNK_SIZE) {
    console.log(`Checking ${text.length} chars with LanguageTool (single chunk)`);
    const matches = await checkTextChunk(text, language);
    console.log('LanguageTool matches:', matches.length);

    // DEBUG: Log erste 3 Matches mit RAW-Offsets
    if (matches.length > 0) {
      console.log('=== RAW LanguageTool Response (first 3) ===');
      matches.slice(0, 3).forEach((match, i) => {
        const errorText = text.substring(match.offset, match.offset + match.length);
        console.log(`Match ${i + 1}: offset=${match.offset}, length=${match.length}, text="${errorText}", rule=${match.rule.id}, category=${match.rule.category.id}`);
      });
    }

    return matches;
  }

  // Große Texte: In Chunks aufteilen
  console.log(`📚 Checking ${text.length} chars with LanguageTool (chunked)`);
  const chunks = splitIntoChunks(text, MAX_CHUNK_SIZE);
  const allMatches = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`  📄 Checking chunk ${i + 1}/${chunks.length} (${chunk.text.length} chars, offset ${chunk.offset})`);

    const matches = await checkTextChunk(chunk.text, language);
    console.log(`  ✅ Chunk ${i + 1}: ${matches.length} matches`);

    // Adjust offsets to absolute positions in full text
    const adjustedMatches = matches.map(match => ({
      ...match,
      offset: match.offset + chunk.offset,
    }));

    allMatches.push(...adjustedMatches);
  }

  console.log(`✅ Total matches across all chunks: ${allMatches.length}`);

  // DEBUG: Log erste 3 Matches mit absoluten Offsets
  if (allMatches.length > 0) {
    console.log('=== RAW LanguageTool Response (first 3, absolute offsets) ===');
    allMatches.slice(0, 3).forEach((match, i) => {
      const errorText = text.substring(match.offset, match.offset + match.length);
      console.log(`Match ${i + 1}: offset=${match.offset}, length=${match.length}, text="${errorText}", rule=${match.rule.id}, category=${match.rule.category.id}`);
    });
  }

  return allMatches;
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
