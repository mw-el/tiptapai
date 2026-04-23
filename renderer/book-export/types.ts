/**
 * BookIR Model - Complete TypeScript Type Definitions
 * Intermediate representation for book export pipeline
 *
 * Markdown + YAML → BookIR → PDF (Paragraf) / EPUB
 */

// ============ Type Aliases ============

export type BookType = 'novel' | 'textbook' | 'novella' | 'poetry' | 'news-twocol';
export type ProfileId = BookType;
export type TrimSize = '5x8' | '6x9' | 'a5' | 'a4' | 'letter';
export type PrintProfile = 'kdp' | 'tolino' | 'generic';
export type EbookProfile = 'kdp-epub' | 'kobo-epub' | 'generic-epub';

// ============ Author & Publisher ============

export interface Author {
  name: string;
  email?: string;
}

export interface Imprint {
  name?: string;
  address?: string;
  website?: string;
}

// ============ Metadata (from YAML frontmatter) ============

export interface License {
  type: 'CC' | 'MIT' | 'GPL' | 'Apache' | string;
  modifiers: string[];
  version: string;
  holder?: string;
}

export interface ISBNInfo {
  print?: string;
  ebook?: string;
}

export interface CoverInfo {
  front?: string;
  back?: string;
}

export interface BookMetadata {
  title: string;
  subtitle?: string;
  authors: Author[];
  language: string;
  bookType: BookType;
  edition?: number;
  publishedYear?: number;
  publisher?: string;
  imprint?: Imprint;

  license?: License;
  isbn?: ISBNInfo;
  cover?: CoverInfo;
  epigraph?: string;
  dedication?: string;
}

// ============ Layout Configuration ============

export interface Margins {
  top: number;
  bottom: number;
  inner: number;
  outer: number;
}

export interface LayoutConfig {
  trimSize: TrimSize;
  margins: Margins;
  rectoChapterStart: boolean;
  dropcaps: boolean;
  columns?: 1 | 2;
}

// ============ Content Blocks ============

export interface ParagraphBlock {
  type: 'paragraph';
  text: string;
}

export interface HeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3 | 4;
  text: string;
}

export interface ImageBlock {
  type: 'image';
  alt: string;
  path: string;
}

export interface CodeBlock {
  type: 'code';
  language: string;
  code: string;
}

export interface MathBlock {
  type: 'math';
  display: boolean;
  content: string;
}

export interface BlockquoteBlock {
  type: 'blockquote';
  text: string;
}

export interface TheoremBlock {
  type: 'theorem';
  title?: string;
  content: string;
}

export interface DefinitionBlock {
  type: 'definition';
  term: string;
  definition: string;
}

export interface AlgorithmBlock {
  type: 'algorithm';
  title?: string;
  steps: string[];
}

export interface PoemBlock {
  type: 'poem';
  lines: string[];
}

export interface HrBlock {
  type: 'hr';
}

export interface PagebreakBlock {
  type: 'pagebreak';
}

export type Block =
  | ParagraphBlock
  | HeadingBlock
  | ImageBlock
  | CodeBlock
  | MathBlock
  | BlockquoteBlock
  | TheoremBlock
  | DefinitionBlock
  | AlgorithmBlock
  | PoemBlock
  | HrBlock
  | PagebreakBlock;

// ============ Chapter Structure ============

export interface Chapter {
  title: string;
  number: number;
  blocks: Block[];
}

// ============ Complete BookIR ============

export interface BookIR {
  metadata: BookMetadata;
  layout: LayoutConfig;
  frontmatter: Block[];
  chapters: Chapter[];
  backmatter: Block[];
}

// ============ Font Configuration ============

export interface FontFamily {
  regular: string;
  bold?: string;
  italic?: string;
  boldItalic?: string;
}

export interface FontConfig {
  serif: FontFamily;
  sansSerif?: FontFamily;
  monospace?: FontFamily;
}

// ============ Profile Interface ============

export interface Profile {
  id: ProfileId;
  displayName: string;
  defaultLayout: LayoutConfig;

  buildParagrafTemplate(
    book: BookIR,
    fonts: FontConfig
  ): Promise<Record<string, any>>;

  buildEpubCss?(
    book: BookIR
  ): string;
}

// ============ Export Options ============

export interface BookExportOptions {
  profileId: ProfileId;
  printProfile: PrintProfile;
  ebookProfile: EbookProfile;
  fonts: FontConfig;
  outputDir: string;
  formats: ('pdf' | 'epub')[];
}

// ============ Frontmatter Config (TT_bookConfig) ============

export interface BookFeatures {
  dropcaps: boolean;
  recto_chapter_start: boolean;
  auto_toc: boolean;
  force_recto_blank: boolean;
}

export interface BookConfig {
  book_type: BookType;
  trim_size: TrimSize;
  print_profile?: PrintProfile;
  ebook_profile?: EbookProfile;
  margins: Margins;
  cover?: CoverInfo;
  isbn?: ISBNInfo;
  license?: License;
  epigraph?: string;
  dedication?: string;
  features?: Partial<BookFeatures>;
}

// ============ Validation Results ============

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  errors: Record<string, string>;
}

export interface BookExportValidation {
  success: boolean;
  missing: string[];
  hasConfig: boolean;
}

export interface BookExportResult {
  success: boolean;
  files?: {
    pdf?: string;
    epub?: string;
  };
  error?: string;
}

// ============ Font Discovery ============

export interface FontDiscoveryResult {
  success: boolean;
  fonts?: FontConfig;
  error?: string;
}
