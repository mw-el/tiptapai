import { Node } from '@tiptap/core';

// Matches a block-level HTML token that is solely a <video> or <audio> tag.
const MEDIA_RE = /^\s*<(video|audio)\b([^]*?)<\/\1>/i;
// Also matches self-contained single-line variants without children
const MEDIA_SIMPLE_RE = /^\s*<(video|audio)\b([^>]*)(?:\/>|>[\s\S]*?<\/\1>)/i;

function attrVal(attrString, name) {
  const m = attrString.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  if (!m) return '';
  return m[1] ?? m[2] ?? m[3] ?? '';
}

function hasAttr(attrString, name) {
  return new RegExp(`\\b${name}\\b`, 'i').test(attrString);
}

/**
 * Returns true when a raw HTML block token is solely a <video> or <audio> tag.
 */
export const isMediaBlock = (raw = '') => {
  const t = raw.trim();
  return MEDIA_RE.test(t) || MEDIA_SIMPLE_RE.test(t);
};

/**
 * TipTap Node that converts a raw `<video>` or `<audio>` block HTML token
 * into a native HTML5 media element rendered directly by the editor.
 */
export const HtmlMediaBlock = Node.create({
  name: 'htmlMediaBlock',
  group: 'block',
  inline: false,
  atom: true,

  addAttributes() {
    return {
      tag:      { default: 'video' },
      src:      { default: null },
      poster:   { default: null },
      controls: { default: true },
      autoplay: { default: false },
      loop:     { default: false },
      muted:    { default: false },
      rawHtml:  { default: null },   // store original for round-trip
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-html-media-block="true"]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { tag, src, poster, controls, autoplay, loop, muted } = HTMLAttributes;
    const mediaAttrs = {};
    if (src)     mediaAttrs.src     = src;
    if (poster)  mediaAttrs.poster  = poster;
    if (controls) mediaAttrs.controls = '';
    if (autoplay) mediaAttrs.autoplay = '';
    if (loop)     mediaAttrs.loop    = '';
    if (muted)    mediaAttrs.muted   = '';
    mediaAttrs.style = 'max-width:100%;';

    return [
      'div',
      { 'data-html-media-block': 'true', style: 'margin: 0.5em 0;' },
      [tag || 'video', mediaAttrs],
    ];
  },

  parseMarkdown(token, helpers) {
    if (token.type !== 'html' || token.block !== true) return [];
    const raw = (token.raw ?? token.text ?? '').trim();
    const m = raw.match(MEDIA_SIMPLE_RE) || raw.match(MEDIA_RE);
    if (!m) return [];

    const tag      = m[1].toLowerCase();
    const attrStr  = m[2] || '';
    return helpers.createNode(this.name, {
      tag,
      src:      attrVal(attrStr, 'src')      || null,
      poster:   attrVal(attrStr, 'poster')   || null,
      controls: hasAttr(attrStr, 'controls') || true,
      autoplay: hasAttr(attrStr, 'autoplay'),
      loop:     hasAttr(attrStr, 'loop'),
      muted:    hasAttr(attrStr, 'muted'),
      rawHtml:  raw,
    });
  },

  renderMarkdown(node) {
    // Round-trip: emit stored original HTML verbatim
    const raw = node.attrs.rawHtml;
    if (raw) return raw.endsWith('\n') ? raw : `${raw}\n`;

    // Fallback: reconstruct
    const { tag, src, poster, controls, autoplay, loop, muted } = node.attrs;
    const t = tag || 'video';
    let attrs = '';
    if (src)     attrs += ` src="${src}"`;
    if (poster)  attrs += ` poster="${poster}"`;
    if (controls) attrs += ' controls';
    if (autoplay) attrs += ' autoplay';
    if (loop)     attrs += ' loop';
    if (muted)    attrs += ' muted';
    return `<${t}${attrs}></${t}>\n`;
  },
});
