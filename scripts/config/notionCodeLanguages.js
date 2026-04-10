/**
 * Notion Code 語言相關共享常數
 *
 * 供 Content / Background 兩端共用，避免語言白名單與 fallback 分散。
 */

/**
 * Code language hint 最大長度
 *
 * @constant {number}
 */
export const MAX_CODE_LANGUAGE_HINT_LENGTH = 64;

/**
 * Notion API 語言值：Objective-C
 *
 * @constant {string}
 */
export const NOTION_CODE_LANGUAGE_OBJECTIVE_C = 'objective-c';

/**
 * Notion API 語言值：Plain Text
 *
 * @constant {string}
 */
export const NOTION_CODE_LANGUAGE_PLAIN_TEXT = 'plain text';

/**
 * Notion API 支援的所有程式語言值（白名單）
 * 來源：Notion API validation_error 回應中列出的完整清單
 *
 * @constant {Set<string>}
 */
export const NOTION_SUPPORTED_LANGUAGES = new Set([
  'abap',
  'abc',
  'agda',
  'arduino',
  'ascii art',
  'assembly',
  'bash',
  'basic',
  'bnf',
  'c',
  'c#',
  'c++',
  'clojure',
  'coffeescript',
  'coq',
  'css',
  'dart',
  'dhall',
  'diff',
  'docker',
  'ebnf',
  'elixir',
  'elm',
  'erlang',
  'f#',
  'flow',
  'fortran',
  'gherkin',
  'glsl',
  'go',
  'graphql',
  'groovy',
  'haskell',
  'hcl',
  'html',
  'idris',
  'java',
  'javascript',
  'json',
  'julia',
  'kotlin',
  'latex',
  'less',
  'lisp',
  'livescript',
  'llvm ir',
  'lua',
  'makefile',
  'markdown',
  'markup',
  'matlab',
  'mathematica',
  'mermaid',
  'nix',
  'notion formula',
  NOTION_CODE_LANGUAGE_OBJECTIVE_C,
  'ocaml',
  'pascal',
  'perl',
  'php',
  NOTION_CODE_LANGUAGE_PLAIN_TEXT,
  'powershell',
  'prolog',
  'protobuf',
  'purescript',
  'python',
  'r',
  'racket',
  'reason',
  'ruby',
  'rust',
  'sass',
  'scala',
  'scheme',
  'scss',
  'shell',
  'smalltalk',
  'solidity',
  'sql',
  'swift',
  'toml',
  'typescript',
  'vb.net',
  'verilog',
  'vhdl',
  'visual basic',
  'webassembly',
  'xml',
  'yaml',
  // Notion 官方文件與 validation_error 都將此值視為合法 enum，不可視為誤植後刪除。
  'java/c/c++/c#',
]);
