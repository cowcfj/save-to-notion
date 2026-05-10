/**
 * Technical terms rule definitions for page complexity detection.
 *
 * Config 模組只 export pure data；regex 建構邏輯由 consumer 負責。
 */

/**
 * @typedef {object} TechnicalTermRule
 * @property {string} term
 * @property {'word' | 'special-char'} type
 * @property {string} group - 語義分組標識
 * @property {string} [note] - 僅在用途不明顯時填寫
 */

/** @type {TechnicalTermRule[]} */
export const TECHNICAL_TERM_RULES = [
  // ── 編程概念 ──
  { term: 'function', type: 'word', group: 'programming' },
  { term: 'class', type: 'word', group: 'programming' },
  { term: 'method', type: 'word', group: 'programming' },
  { term: 'variable', type: 'word', group: 'programming' },
  { term: 'constant', type: 'word', group: 'programming' },
  { term: 'interface', type: 'word', group: 'programming' },
  { term: 'callback', type: 'word', group: 'programming' },
  { term: 'async', type: 'word', group: 'programming' },
  { term: 'await', type: 'word', group: 'programming' },
  { term: 'syntax', type: 'word', group: 'programming' },
  { term: 'parameter', type: 'word', group: 'programming' },
  { term: 'argument', type: 'word', group: 'programming' },
  { term: 'return', type: 'word', group: 'programming' },
  { term: 'exception', type: 'word', group: 'programming' },
  { term: 'error', type: 'word', group: 'programming', note: '常見英文詞，但在技術文檔中高頻出現' },
  // ── API & Web ──
  { term: 'api', type: 'word', group: 'api-web' },
  { term: 'endpoint', type: 'word', group: 'api-web' },
  { term: 'request', type: 'word', group: 'api-web' },
  { term: 'response', type: 'word', group: 'api-web' },
  { term: 'header', type: 'word', group: 'api-web' },
  { term: 'json', type: 'word', group: 'api-web' },
  { term: 'xml', type: 'word', group: 'api-web' },
  { term: 'yaml', type: 'word', group: 'api-web' },
  { term: 'http', type: 'word', group: 'api-web' },
  { term: 'https', type: 'word', group: 'api-web' },
  { term: 'rest', type: 'word', group: 'api-web' },
  { term: 'graphql', type: 'word', group: 'api-web' },
  // ── 工具 & CLI ──
  { term: 'cli', type: 'word', group: 'tools-cli' },
  { term: 'command', type: 'word', group: 'tools-cli' },
  { term: 'option', type: 'word', group: 'tools-cli' },
  { term: 'flag', type: 'word', group: 'tools-cli' },
  { term: 'usage', type: 'word', group: 'tools-cli' },
  { term: 'install', type: 'word', group: 'tools-cli' },
  { term: 'configure', type: 'word', group: 'tools-cli' },
  { term: 'build', type: 'word', group: 'tools-cli' },
  { term: 'deploy', type: 'word', group: 'tools-cli' },
  { term: 'npm', type: 'word', group: 'tools-cli' },
  { term: 'git', type: 'word', group: 'tools-cli' },
  { term: 'docker', type: 'word', group: 'tools-cli' },
  { term: 'kubernetes', type: 'word', group: 'tools-cli' },
  { term: 'sdk', type: 'word', group: 'tools-cli' },
  // ── 語言 & 框架 ──
  { term: 'javascript', type: 'word', group: 'languages-frameworks' },
  { term: 'python', type: 'word', group: 'languages-frameworks' },
  { term: 'java', type: 'word', group: 'languages-frameworks' },
  { term: 'go', type: 'word', group: 'languages-frameworks' },
  { term: 'rust', type: 'word', group: 'languages-frameworks' },
  {
    term: 'c++',
    type: 'special-char',
    group: 'languages-frameworks',
    note: '含 + 符號，需 special-char boundary 而非 word boundary',
  },
  { term: 'typescript', type: 'word', group: 'languages-frameworks' },
  { term: 'react', type: 'word', group: 'languages-frameworks' },
  { term: 'vue', type: 'word', group: 'languages-frameworks' },
  { term: 'angular', type: 'word', group: 'languages-frameworks' },
  { term: 'node', type: 'word', group: 'languages-frameworks' },
  { term: 'express', type: 'word', group: 'languages-frameworks' },
  { term: 'django', type: 'word', group: 'languages-frameworks' },
  { term: 'flask', type: 'word', group: 'languages-frameworks' },
  { term: 'spring', type: 'word', group: 'languages-frameworks' },
  // ── 文檔特定 ──
  { term: 'example', type: 'word', group: 'documentation' },
  { term: 'tutorial', type: 'word', group: 'documentation' },
  { term: 'guide', type: 'word', group: 'documentation' },
  { term: 'reference', type: 'word', group: 'documentation' },
  { term: 'deprecated', type: 'word', group: 'documentation' },
  { term: 'version', type: 'word', group: 'documentation' },
];

export const TECHNICAL_TERM_GROUPS = [
  'programming',
  'api-web',
  'tools-cli',
  'languages-frameworks',
  'documentation',
];
