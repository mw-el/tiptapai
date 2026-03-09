import assert from 'node:assert/strict';

import { ProtectedInline, ProtectedBlock } from '../renderer/editor/protected-markup.js';
import State from '../renderer/editor/editor-state.js';

function createHelpers() {
  return {
    createTextNode(text) {
      return { type: 'text', text };
    },
    createNode(name, attrs, content = []) {
      return { type: name, attrs: attrs || {}, content };
    },
    renderChildren(node) {
      return (node?.content || []).map((child) => child.text || '').join('');
    },
  };
}

function testInlineImageRoundtrip() {
  const rawHtml = '<img src="foto.jpg" alt="Testbild" width="200">';
  const helpers = createHelpers();

  const parsedNode = ProtectedInline.config.parseMarkdown(
    { type: 'html', raw: rawHtml, text: rawHtml, block: false },
    helpers
  );

  assert.equal(parsedNode.type, 'protectedInline');
  assert.equal(parsedNode.attrs.rawHtml, rawHtml);

  const serialized = ProtectedInline.config.renderMarkdown(parsedNode, helpers);
  assert.equal(serialized, rawHtml);
}

function testBlockImageRoundtrip() {
  const rawHtml = '<img src="images/block-bild.jpg" alt="Block Bild">';
  const helpers = createHelpers();

  const parsedNode = ProtectedBlock.config.parseMarkdown(
    { type: 'html', raw: rawHtml, text: rawHtml, block: true },
    helpers
  );

  assert.equal(parsedNode.type, 'protectedBlock');
  assert.equal(parsedNode.attrs.rawHtml, rawHtml);

  const serialized = ProtectedBlock.config.renderMarkdown(parsedNode, helpers);
  assert.equal(serialized, `${rawHtml}\n`);
}

function testInlineImageRenderPathResolution() {
  const previousFilePath = State.currentFilePath;
  State.currentFilePath = '/home/matthias/_AA_TipTapAi/testfiles-markdown/inline-img-test.md';

  try {
    const rawHtml = '<img src="foto.jpg" alt="Testbild">';
    const renderSpec = ProtectedInline.config.renderHTML({
      node: { attrs: { rawHtml } },
      HTMLAttributes: {},
    });

    assert.equal(renderSpec[0], 'span');
    assert.equal(renderSpec[2][0], 'img');
    assert.equal(
      renderSpec[2][1].src,
      'file:///home/matthias/_AA_TipTapAi/testfiles-markdown/foto.jpg'
    );
    assert.equal(renderSpec[2][1].alt, 'Testbild');
  } finally {
    State.currentFilePath = previousFilePath;
  }
}

function main() {
  testInlineImageRoundtrip();
  testBlockImageRoundtrip();
  testInlineImageRenderPathResolution();
  console.log('Image roundtrip tests passed.');
}

main();
