/**
 * Technical terms rule definitions for page complexity detection.
 *
 * Config 模組只 export pure data；regex 建構邏輯由 consumer 負責。
 */

export const TYPE_WORD = 'word';
export const TYPE_SPECIAL_CHAR = 'special-char';

export const GROUP_PROGRAMMING = 'programming';
export const GROUP_API_WEB = 'api-web';
export const GROUP_TOOLS_CLI = 'tools-cli';
export const GROUP_LANGUAGES_FRAMEWORKS = 'languages-frameworks';
export const GROUP_DOCUMENTATION = 'documentation';

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
  { term: 'function', type: TYPE_WORD, group: GROUP_PROGRAMMING },
  { term: 'class', type: TYPE_WORD, group: GROUP_PROGRAMMING },
  { term: 'method', type: TYPE_WORD, group: GROUP_PROGRAMMING },
  { term: 'variable', type: TYPE_WORD, group: GROUP_PROGRAMMING },
  { term: 'constant', type: TYPE_WORD, group: GROUP_PROGRAMMING },
  { term: 'interface', type: TYPE_WORD, group: GROUP_PROGRAMMING },
  { term: 'callback', type: TYPE_WORD, group: GROUP_PROGRAMMING },
  { term: 'async', type: TYPE_WORD, group: GROUP_PROGRAMMING },
  { term: 'await', type: TYPE_WORD, group: GROUP_PROGRAMMING },
  { term: 'syntax', type: TYPE_WORD, group: GROUP_PROGRAMMING },
  { term: 'parameter', type: TYPE_WORD, group: GROUP_PROGRAMMING },
  { term: 'argument', type: TYPE_WORD, group: GROUP_PROGRAMMING },
  { term: 'return', type: TYPE_WORD, group: GROUP_PROGRAMMING },
  { term: 'exception', type: TYPE_WORD, group: GROUP_PROGRAMMING },
  {
    term: 'error',
    type: TYPE_WORD,
    group: GROUP_PROGRAMMING,
    note: '常見英文詞，但在技術文檔中高頻出現',
  },
  // ── API & Web ──
  { term: 'api', type: TYPE_WORD, group: GROUP_API_WEB },
  { term: 'endpoint', type: TYPE_WORD, group: GROUP_API_WEB },
  { term: 'request', type: TYPE_WORD, group: GROUP_API_WEB },
  { term: 'response', type: TYPE_WORD, group: GROUP_API_WEB },
  { term: 'header', type: TYPE_WORD, group: GROUP_API_WEB },
  { term: 'json', type: TYPE_WORD, group: GROUP_API_WEB },
  { term: 'xml', type: TYPE_WORD, group: GROUP_API_WEB },
  { term: 'yaml', type: TYPE_WORD, group: GROUP_API_WEB },
  { term: 'http', type: TYPE_WORD, group: GROUP_API_WEB },
  { term: 'https', type: TYPE_WORD, group: GROUP_API_WEB },
  { term: 'rest', type: TYPE_WORD, group: GROUP_API_WEB },
  { term: 'graphql', type: TYPE_WORD, group: GROUP_API_WEB },
  // ── 工具 & CLI ──
  { term: 'cli', type: TYPE_WORD, group: GROUP_TOOLS_CLI },
  { term: 'command', type: TYPE_WORD, group: GROUP_TOOLS_CLI },
  { term: 'option', type: TYPE_WORD, group: GROUP_TOOLS_CLI },
  { term: 'flag', type: TYPE_WORD, group: GROUP_TOOLS_CLI },
  { term: 'usage', type: TYPE_WORD, group: GROUP_TOOLS_CLI },
  { term: 'install', type: TYPE_WORD, group: GROUP_TOOLS_CLI },
  { term: 'configure', type: TYPE_WORD, group: GROUP_TOOLS_CLI },
  { term: 'build', type: TYPE_WORD, group: GROUP_TOOLS_CLI },
  { term: 'deploy', type: TYPE_WORD, group: GROUP_TOOLS_CLI },
  { term: 'npm', type: TYPE_WORD, group: GROUP_TOOLS_CLI },
  { term: 'git', type: TYPE_WORD, group: GROUP_TOOLS_CLI },
  { term: 'docker', type: TYPE_WORD, group: GROUP_TOOLS_CLI },
  { term: 'kubernetes', type: TYPE_WORD, group: GROUP_TOOLS_CLI },
  { term: 'sdk', type: TYPE_WORD, group: GROUP_TOOLS_CLI },
  // ── 語言 & 框架 ──
  { term: 'javascript', type: TYPE_WORD, group: GROUP_LANGUAGES_FRAMEWORKS },
  { term: 'python', type: TYPE_WORD, group: GROUP_LANGUAGES_FRAMEWORKS },
  { term: 'java', type: TYPE_WORD, group: GROUP_LANGUAGES_FRAMEWORKS },
  { term: 'go', type: TYPE_WORD, group: GROUP_LANGUAGES_FRAMEWORKS },
  { term: 'rust', type: TYPE_WORD, group: GROUP_LANGUAGES_FRAMEWORKS },
  {
    term: 'c++',
    type: TYPE_SPECIAL_CHAR,
    group: GROUP_LANGUAGES_FRAMEWORKS,
    note: '含 + 符號，需 special-char boundary 而非 word boundary',
  },
  { term: 'typescript', type: TYPE_WORD, group: GROUP_LANGUAGES_FRAMEWORKS },
  { term: 'react', type: TYPE_WORD, group: GROUP_LANGUAGES_FRAMEWORKS },
  { term: 'vue', type: TYPE_WORD, group: GROUP_LANGUAGES_FRAMEWORKS },
  { term: 'angular', type: TYPE_WORD, group: GROUP_LANGUAGES_FRAMEWORKS },
  { term: 'node', type: TYPE_WORD, group: GROUP_LANGUAGES_FRAMEWORKS },
  { term: 'express', type: TYPE_WORD, group: GROUP_LANGUAGES_FRAMEWORKS },
  { term: 'django', type: TYPE_WORD, group: GROUP_LANGUAGES_FRAMEWORKS },
  { term: 'flask', type: TYPE_WORD, group: GROUP_LANGUAGES_FRAMEWORKS },
  { term: 'spring', type: TYPE_WORD, group: GROUP_LANGUAGES_FRAMEWORKS },
  // ── 文檔特定 ──
  { term: 'example', type: TYPE_WORD, group: GROUP_DOCUMENTATION },
  { term: 'tutorial', type: TYPE_WORD, group: GROUP_DOCUMENTATION },
  { term: 'guide', type: TYPE_WORD, group: GROUP_DOCUMENTATION },
  { term: 'reference', type: TYPE_WORD, group: GROUP_DOCUMENTATION },
  { term: 'deprecated', type: TYPE_WORD, group: GROUP_DOCUMENTATION },
  { term: 'version', type: TYPE_WORD, group: GROUP_DOCUMENTATION },
];

export const TECHNICAL_TERM_GROUPS = [
  GROUP_PROGRAMMING,
  GROUP_API_WEB,
  GROUP_TOOLS_CLI,
  GROUP_LANGUAGES_FRAMEWORKS,
  GROUP_DOCUMENTATION,
];
