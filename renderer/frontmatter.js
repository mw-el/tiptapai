// TipTap AI - Frontmatter Parser
// Sprint 1.2: YAML Frontmatter Handling

import yaml from 'js-yaml';

/**
 * Parst Markdown-Datei mit YAML Frontmatter
 * @param {string} fileContent - Vollständiger Dateiinhalt
 * @returns {{metadata: object, content: string}}
 */
export function parseFile(fileContent) {
  // Regex für Frontmatter: ---\nYAML\n---\n
  const match = fileContent.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);

  if (!match) {
    // Keine Frontmatter vorhanden
    return {
      metadata: {},
      content: fileContent
    };
  }

  try {
    return {
      metadata: yaml.load(match[1]) || {},
      content: match[2]
    };
  } catch (error) {
    console.error('Error parsing frontmatter YAML:', error);
    // Bei Fehler: Frontmatter ignorieren und ganzen Content zurückgeben
    return {
      metadata: {},
      content: fileContent
    };
  }
}

/**
 * Kombiniert Metadaten und Content zu Markdown mit Frontmatter
 * @param {object} metadata - YAML-Metadaten
 * @param {string} content - Markdown-Content
 * @returns {string} - Vollständiger Dateiinhalt
 */
export function stringifyFile(metadata, content) {
  // Wenn keine Metadaten, nur Content zurückgeben
  if (!metadata || Object.keys(metadata).length === 0) {
    return content;
  }

  try {
    const yamlStr = yaml.dump(metadata, {
      indent: 2,
      lineWidth: -1, // Keine automatischen Umbrüche
      noRefs: true,  // Keine Referenzen
    });

    return `---\n${yamlStr}---\n\n${content}`;
  } catch (error) {
    console.error('Error stringifying frontmatter YAML:', error);
    // Bei Fehler: Nur Content zurückgeben
    return content;
  }
}
