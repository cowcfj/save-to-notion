/**
 * Range 序列化與反序列化模組
 * 提供 DOM Range 的持久化功能
 */

import { getNodePath, getNodeByPath } from '../utils/path.js';
import { findTextInPage, HIGHLIGHT_ANCHORING } from '../utils/textSearch.js';
import { waitForDOMStability } from '../utils/domStability.js';

const { CONTEXT_LENGTH } = HIGHLIGHT_ANCHORING;

const BLOCK_BOUNDARY_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DETAILS',
  'DIALOG',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'UL',
]);

function isBlockBoundaryNode(node) {
  return node?.nodeType === Node.ELEMENT_NODE && BLOCK_BOUNDARY_TAGS.has(node.tagName);
}

function createBoundaryRange(container, startOffset, endOffset) {
  const boundaryRange = document.createRange();
  boundaryRange.selectNodeContents(container);
  boundaryRange.setStart(container, startOffset);
  boundaryRange.setEnd(container, endOffset);
  return boundaryRange;
}

function extractElementPrefix(container, offset) {
  let startOffset = 0;
  for (let i = offset - 1; i >= 0; i--) {
    if (isBlockBoundaryNode(container.childNodes[i])) {
      startOffset = i + 1;
      break;
    }
  }

  const text = createBoundaryRange(container, startOffset, offset).toString();
  if (text.trim().length === 0) {
    return '';
  }
  return text.slice(Math.max(0, text.length - CONTEXT_LENGTH));
}

function extractElementSuffix(container, offset) {
  let endOffset = container.childNodes.length;
  for (let i = offset; i < container.childNodes.length; i++) {
    if (isBlockBoundaryNode(container.childNodes[i])) {
      endOffset = i;
      break;
    }
  }

  const text = createBoundaryRange(container, offset, endOffset).toString();
  if (text.trim().length === 0) {
    return '';
  }
  return text.slice(0, CONTEXT_LENGTH);
}

/**
 * 序列化 Range 對象
 *
 * @param {Range} range - DOM Range
 * @returns {object} 序列化的 Range 資訊
 */
export function serializeRange(range) {
  let prefix = '';
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const text = range.startContainer.textContent;
    prefix = text.slice(Math.max(0, range.startOffset - CONTEXT_LENGTH), range.startOffset);
  } else {
    // Element-node offsets are child indexes; clip context to the current text run
    // so adjacent block text does not become a misleading prefix.
    try {
      prefix = extractElementPrefix(range.startContainer, range.startOffset);
    } catch {
      prefix = '';
    }
  }

  // 提取後文 (suffix)
  let suffix = '';
  if (range.endContainer.nodeType === Node.TEXT_NODE) {
    const text = range.endContainer.textContent;
    suffix = text.slice(range.endOffset, Math.min(text.length, range.endOffset + CONTEXT_LENGTH));
  } else {
    // Element-node offsets are child indexes; clip context to the current text run
    // so adjacent block text does not become a misleading suffix.
    try {
      suffix = extractElementSuffix(range.endContainer, range.endOffset);
    } catch {
      suffix = '';
    }
  }

  return {
    startContainerPath: getNodePath(range.startContainer),
    startOffset: range.startOffset,
    endContainerPath: getNodePath(range.endContainer),
    endOffset: range.endOffset,
    prefix, // 新增：用於模糊匹配消歧義
    suffix, // 新增：用於模糊匹配消歧義
  };
}

/**
 * 反序列化 Range 對象
 *
 * @param {object} rangeInfo - 序列化的 Range 資訊
 * @param {string} expectedText - 預期的文本內容
 * @returns {Range|null} 恢復的 Range 或 null
 */
export function deserializeRange(rangeInfo, expectedText) {
  if (!rangeInfo) {
    return null;
  }

  try {
    const startNode = getNodeByPath(rangeInfo.startContainerPath);
    const endNode = getNodeByPath(rangeInfo.endContainerPath);

    if (!startNode || !endNode) {
      return null;
    }

    const range = document.createRange();
    range.setStart(startNode, rangeInfo.startOffset);
    range.setEnd(endNode, rangeInfo.endOffset);

    // 驗證文本
    const actualText = range.toString();
    if (actualText !== expectedText) {
      return null;
    }

    return range;
  } catch {
    return null;
  }
}

/**
 * 帶重試機制的 Range 恢復
 *
 * @param {object} rangeInfo - Range 資訊
 * @param {string} text - 文本內容
 * @param {number} maxRetries - 最大重試次數
 * @returns {Promise<Range|null>}
 */
export async function restoreRangeWithRetry(rangeInfo, text, maxRetries = 3) {
  // 嘗試直接反序列化
  let range = deserializeRange(rangeInfo, text);
  if (range) {
    return range;
  }

  // 提取上下文，以便在文本搜索時進行消歧義
  const context = {
    prefix: rangeInfo?.prefix,
    suffix: rangeInfo?.suffix,
  };

  // 等待 DOM 穩定後重試
  for (let i = 0; i < maxRetries; i++) {
    const isStable = await waitForDOMStability({
      stabilityThresholdMs: 150,
      maxWaitMs: 2000,
    });

    if (isStable) {
      range = deserializeRange(rangeInfo, text);
      if (range) {
        return range;
      }
    }

    // 最後嘗試：使用文本搜索（傳入上下文交由 findTextInPage 處理）
    if (i === maxRetries - 1) {
      range = findTextInPage(text, context);
      if (range) {
        return range;
      }
    }
  }

  return null;
}

/**
 * 基於文本內容查找 Range
 *
 * @param {string} targetText - 目標文本
 * @param {object} [context] - 上下文資訊，包含 prefix 和 suffix 用於消歧義
 * @returns {Range|null}
 */
export function findRangeByTextContent(targetText, context = {}) {
  if (!targetText || typeof targetText !== 'string') {
    return null;
  }

  return findTextInPage(targetText, context);
}

/**
 * 驗證 Range 是否有效
 *
 * @param {Range} range - Range 對象
 * @param {string} expectedText - 預期文本
 * @returns {boolean}
 */
export function validateRange(range, expectedText) {
  if (!range) {
    return false;
  }

  try {
    const actualText = range.toString();
    return actualText === expectedText;
  } catch {
    return false;
  }
}
