/**
 * Highlight 相關常量
 * 注意：此模組必須為純 ES6 模組，不可依賴 window 或 document
 */

export const HIGHLIGHT_COLOR_WHITELIST = Object.freeze(['yellow', 'green', 'blue', 'red']);

export const HIGHLIGHT_MATCH_SCORING = Object.freeze({
  EXACT_CONTEXT_SCORE: 2,
  PARTIAL_CONTEXT_SCORE: 1,
  PARTIAL_CONTEXT_WINDOW: 10,
});
