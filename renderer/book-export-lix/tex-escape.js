// renderer/book-export-lix/tex-escape.js
//
// LaTeX-Escaping fuer die LiX-Pipeline.
//
// Zwei Ebenen:
//   - escapeTex(s)      : reiner Text → LaTeX-sicher (&, %, $, _, #, ~, ^, \, {, })
//   - inlineMarkdownToLix(s) : Markdown-Inline (**bold**, *ital*, `code`, [t](u), ~~s~~, $m$)
//                              → LiX-Makros (\b{...}, \i{...}, \c{...}, \url{u}{t}, \s{...}, \m{...})
//
// Designprinzip: Erst Markdown-Tokens extrahieren, dann die Nicht-Markup-Stuecke
// escapen. Sonst wuerde escapeTex() die Markdown-Sterne und Backticks zerstoeren.

const LATEX_SPECIALS = /[\\{}$&#^_%~]/g;

export function escapeTex(s) {
  if (s == null) return '';
  return String(s).replace(LATEX_SPECIALS, (ch) => {
    switch (ch) {
      case '\\': return '\\textbackslash{}';
      case '{':  return '\\{';
      case '}':  return '\\}';
      case '$':  return '\\$';
      case '&':  return '\\&';
      case '#':  return '\\#';
      case '^':  return '\\textasciicircum{}';
      case '_':  return '\\_';
      case '%':  return '\\%';
      case '~':  return '\\textasciitilde{}';
      default:   return ch;
    }
  });
}

// Token-Scanner fuer Markdown-Inline. Reihenfolge = Prioritaet.
// Gross genug fuer die Faelle, die der Parser in paragraph.text produziert.
const INLINE_RULES = [
  // Inline-Code (greift vor bold/italic, damit `*` in Code nicht als Markup gilt)
  { re: /`([^`\n]+)`/,                       to: (m) => `\\c{${escapeTex(m[1])}}` },
  // Bold + Italic: ***text***
  { re: /\*\*\*([^*\n]+)\*\*\*/,             to: (m) => `\\b{\\i{${escapeTex(m[1])}}}` },
  // Bold: **text**
  { re: /\*\*([^*\n]+)\*\*/,                 to: (m) => `\\b{${escapeTex(m[1])}}` },
  // Italic: *text*   (Underscore-Variante unten — vermeidet Konflikt mit snake_case)
  { re: /(^|[\s(])\*([^*\n]+)\*/,            to: (m) => `${m[1]}\\i{${escapeTex(m[2])}}` },
  // Strikethrough: ~~text~~
  { re: /~~([^~\n]+)~~/,                     to: (m) => `\\s{${escapeTex(m[1])}}` },
  // Inline-Math: $...$   (keine Zeilenumbrueche)
  { re: /\$([^$\n]+)\$/,                     to: (m) => `\\m{${m[1]}}` }, // NICHT escapen — Mathe
  // Link: [text](url)
  { re: /\[([^\]\n]+)\]\(([^)\n]+)\)/,       to: (m) => `\\url{${m[2]}}{${escapeTex(m[1])}}` },
];

export function inlineMarkdownToLix(text) {
  if (!text) return '';
  let out = '';
  let rest = String(text);

  outer: while (rest.length > 0) {
    let earliest = null;
    for (const rule of INLINE_RULES) {
      const m = rest.match(rule.re);
      if (m && (earliest === null || m.index < earliest.match.index)) {
        earliest = { rule, match: m };
      }
    }
    if (!earliest) {
      out += escapeTex(rest);
      break outer;
    }
    const { rule, match } = earliest;
    out += escapeTex(rest.slice(0, match.index));
    out += rule.to(match);
    rest = rest.slice(match.index + match[0].length);
  }
  return out;
}
