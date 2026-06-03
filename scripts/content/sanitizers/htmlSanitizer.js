/* eslint-disable sonarjs/dompurify-unsafe-config */
// Runtime boundary: content bundle only. Background service workers must not import this module,
// because DOMPurify and entity decoding rely on DOM APIs that are unavailable in MV3 workers.
import DOMPurify from 'dompurify';

// 允許的文章 HTML 標籤
export const ARTICLE_HTML_ALLOWED_TAGS = [
  'article',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'div',
  'section',
  'main',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'a',
  'strong',
  'b',
  'ins',
  'em',
  'i',
  'u',
  's',
  'del',
  'strike',
  'kbd',
  'samp',
  'tt',
  'img',
  'figure',
  'figcaption',
  'hr',
  'br',
];

// 允許的文章 HTML 屬性
export const ARTICLE_HTML_ALLOWED_ATTR = ['href', 'src', 'alt', 'title'];

// 允許的 AI 輸出 HTML 標籤
export const AI_OUTPUT_ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'a',
];

// 允許的 AI 輸出 HTML 屬性
export const AI_OUTPUT_ALLOWED_ATTR = ['href'];

// 禁用標籤，確保安全防線
const FORBIDDEN_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'base',
  'link',
  'meta',
];

// 禁用屬性，確保安全防線
const FORBIDDEN_ATTR = ['style', 'srcset', 'formaction', 'action'];

// 僅允許 http, https、安全 data: 協定（如 image/*, application/pdf）與相對路徑的 URI 正規表達式
const SAFE_URI_REGEXP =
  /^https?:|^data:(?:image\/(?:jpeg|png|gif|webp|svg\+xml)|application\/pdf)[;,]|^(?![a-z][-a-z0-9+.]*:)/i;

const EMPTY_HTML_INPUTS = new Set([null, undefined, '']);

function isEmptyHtmlInput(html) {
  return EMPTY_HTML_INPUTS.has(html);
}

function isUnsafeDataUri(value) {
  return Boolean(value && value.toLowerCase().startsWith('data:') && !SAFE_URI_REGEXP.test(value));
}

function removeUnsafeDataUriAttribute(node, attributeName) {
  const value = node.getAttribute(attributeName);

  if (isUnsafeDataUri(value)) {
    node.removeAttribute(attributeName);
  }
}

// 註冊 hook 以對 data: URI 進行更嚴格、更安全的縱深防禦過濾（避免 DOMPurify 預設對 img src 放行 data:text/html 等不安全類型）
DOMPurify.addHook('afterSanitizeAttributes', node => {
  removeUnsafeDataUriAttribute(node, 'src');
  removeUnsafeDataUriAttribute(node, 'href');
});

/**
 * 消毒文章 HTML 字串
 *
 * @param {string} html - 原始 HTML 字串
 * @returns {string} 消毒後的 HTML 字串
 */
export function sanitizeArticleHtml(html) {
  if (isEmptyHtmlInput(html)) {
    return '';
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ARTICLE_HTML_ALLOWED_TAGS,
    ALLOWED_ATTR: ARTICLE_HTML_ALLOWED_ATTR,
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: FORBIDDEN_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
    RETURN_TRUSTED_TYPE: false, // 確保返回純字串
  });
}

/**
 * 驗證並消毒 AI 輸出的 HTML 字串
 *
 * @param {string} html - 原始 HTML 字串
 * @param {object} [options] - 驗證設定選項
 * @param {number} [options.maxLength=100000] - 最大允許字元長度
 * @returns {object} 驗證結果物件
 */
export function sanitizeAiOutputHtml(html, options = {}) {
  const maxLength = options.maxLength || 100_000;

  if (isEmptyHtmlInput(html)) {
    return {
      success: false,
      reason: 'empty',
      html: '',
    };
  }

  if (html.length > maxLength) {
    return {
      success: false,
      reason: 'too_long',
      html: '',
    };
  }

  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: AI_OUTPUT_ALLOWED_TAGS,
    ALLOWED_ATTR: AI_OUTPUT_ALLOWED_ATTR,
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: FORBIDDEN_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
    RETURN_TRUSTED_TYPE: false,
  });

  if (sanitized === '') {
    return {
      success: false,
      reason: 'sanitized_empty',
      html: '',
    };
  }

  return {
    success: true,
    html: sanitized,
  };
}

/**
 * 僅在 fallback 時，將 HTML 轉為安全純文字
 *
 * @param {string} html - 原始 HTML 字串
 * @returns {string} 純文字字串
 */
export function sanitizeHtmlToText(html) {
  if (isEmptyHtmlInput(html)) {
    return '';
  }

  // 先使用 DOMPurify 去除所有標籤（同時也會安全清除 script/style 內文）
  const cleanHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: FORBIDDEN_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_TRUSTED_TYPE: false,
  });

  // 透過 temp 節點解析解碼 HTML entities
  const temp = document.createElement('div');
  temp.innerHTML = cleanHtml;
  return temp.textContent || '';
}
