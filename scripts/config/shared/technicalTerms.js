/**
 * Technical terms rule definitions for page complexity detection.
 * Config 模組只 export pure data；regex 建構邏輯由 consumer 負責。
 */

export const TYPE_WORD = 'word';
export const TYPE_SPECIAL_CHAR = 'special-char';

export const GROUP_PROGRAMMING = 'programming';
export const GROUP_API_WEB = 'api-web';
export const GROUP_TOOLS_CLI = 'tools-cli';
export const GROUP_LANGUAGES_FRAMEWORKS = 'languages-frameworks';
export const GROUP_DOCUMENTATION = 'documentation';

export const TECHNICAL_TERM_GROUPS = [
  GROUP_PROGRAMMING,
  GROUP_API_WEB,
  GROUP_TOOLS_CLI,
  GROUP_LANGUAGES_FRAMEWORKS,
  GROUP_DOCUMENTATION,
];

const GROUPED_TERMS = {
  [GROUP_PROGRAMMING]: [
    'function',
    'class',
    'method',
    'variable',
    'constant',
    'interface',
    'callback',
    'async',
    'await',
    'syntax',
    'parameter',
    'argument',
    'return',
    'exception',
    'error',
  ],
  [GROUP_API_WEB]: [
    'api',
    'endpoint',
    'request',
    'response',
    'header',
    'json',
    'xml',
    'yaml',
    'http',
    'https',
    'rest',
    'graphql',
  ],
  [GROUP_TOOLS_CLI]: [
    'cli',
    'command',
    'option',
    'flag',
    'usage',
    'install',
    'configure',
    'build',
    'deploy',
    'npm',
    'git',
    'docker',
    'kubernetes',
    'sdk',
  ],
  [GROUP_LANGUAGES_FRAMEWORKS]: [
    'javascript',
    'python',
    'java',
    'rust',
    'typescript',
    'react',
    'vue',
    'angular',
    'node',
    'express',
    'django',
    'flask',
    'spring',
  ],
  [GROUP_DOCUMENTATION]: ['example', 'tutorial', 'guide', 'reference', 'deprecated', 'version'],
};

const SPECIAL_RULES = [
  { term: 'Go', group: GROUP_LANGUAGES_FRAMEWORKS, caseSensitive: true },
  { term: 'c++', type: TYPE_SPECIAL_CHAR, group: GROUP_LANGUAGES_FRAMEWORKS },
];

/** @type {import('./technicalTerms.js').TechnicalTermRule[]} */
export const TECHNICAL_TERM_RULES = Object.entries(GROUPED_TERMS).flatMap(([group, terms]) => [
  ...terms.map(term => ({ term, type: TYPE_WORD, group })),
  ...SPECIAL_RULES.filter(rule => rule.group === group).map(({ type = TYPE_WORD, ...rest }) => ({
    type,
    ...rest,
  })),
]);
