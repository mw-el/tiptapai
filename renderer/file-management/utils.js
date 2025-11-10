export function ensureMarkdownExtension(name = '') {
  const trimmed = name.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`;
}

export function stripFrontmatterFromMarkdown(markdown = '') {
  let cleaned = markdown;
  cleaned = cleaned.replace(/^```(?:yaml)?\n---\n[\s\S]*?\n---\n```\n*/m, '');
  cleaned = cleaned.replace(/^---\n[\s\S]*?\n---\n*/m, '');
  return cleaned.trimStart();
}
