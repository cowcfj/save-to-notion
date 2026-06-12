/**
 * Range 序列化與反序列化模組
 * 提供 DOM Range 的持久化功能
 */

import { getNodePath, getNodeByPath } from '../utils/path.js';
import { findTextInPage, HIGHLIGHT_ANCHORING } from '../utils/textSearch.js';
import { waitForDOMStability } from '../utils/domStability.js';

const { CONTEXT_LENGTH } = HIGHLIGHT_ANCHORING;
const CONTEXT_DIRECTION = {
  PREFIX: 'prefix',
  SUFFIX: 'suffix',
};

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

function extractTextContext(text, offset, direction) {
  if (direction === CONTEXT_DIRECTION.PREFIX) {
    return text.slice(Math.max(0, offset - CONTEXT_LENGTH), offset);
  }
  return text.slice(offset, Math.min(text.length, offset + CONTEXT_LENGTH));
}

function extractElementContext(container, offset, direction) {
  if (direction === CONTEXT_DIRECTION.PREFIX) {
    return extractElementPrefix(container, offset);
  }
  return extractElementSuffix(container, offset);
}

function extractRangeContext(container, offset, direction) {
  if (container.nodeType === Node.TEXT_NODE) {
    return extractTextContext(container.textContent, offset, direction);
  }
  try {
    return extractElementContext(container, offset, direction);
  } catch {
    return '';
  }
}

/**
 * 序列化 Range 對象
 *
 * @param {Range} range - DOM Range
 * @returns {object} 序列化的 Range 資訊
 */
export function serializeRange(range) {
  return {
    startContainerPath: getNodePath(range.startContainer),
    startOffset: range.startOffset,
    endContainerPath: getNodePath(range.endContainer),
    endOffset: range.endOffset,
    prefix: extractRangeContext(range.startContainer, range.startOffset, CONTEXT_DIRECTION.PREFIX), // 新增：用於模糊匹配消歧義
    suffix: extractRangeContext(range.endContainer, range.endOffset, CONTEXT_DIRECTION.SUFFIX), // 新增：用於模糊匹配消歧義
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
 * 在 DOM 穩定後重試反序列化 Range
 *
 * @param {object} rangeInfo - Range 資訊
 * @param {string} text - 文本內容
 * @returns {Promise<Range|null>}
 */
async function retryDeserializeAfterDOMStability(rangeInfo, text) {
  const isStable = await waitForDOMStability({
    stabilityThresholdMs: 150,
    maxWaitMs: 2000,
  });

  if (!isStable) {
    return null;
  }

  return deserializeRange(rangeInfo, text);
}

/**
 * 使用序列化的上下文查找 Range
 *
 * @param {object} rangeInfo - Range 資訊
 * @param {string} text - 文本內容
 * @returns {Range|null}
 */
function findRangeByTextWithSerializedContext(rangeInfo, text) {
  return findTextInPage(text, {
    prefix: rangeInfo?.prefix,
    suffix: rangeInfo?.suffix,
  });
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
  const range = deserializeRange(rangeInfo, text);
  if (range) {
    return range;
  }

  // 等待 DOM 穩定後重試
  for (let i = 0; i < maxRetries; i++) {
    const retriedRange = await retryDeserializeAfterDOMStability(rangeInfo, text);
    if (retriedRange) {
      return retriedRange;
    }

    // 最後嘗試：使用文本搜索（傳入上下文交由 findTextInPage 處理）
    if (i === maxRetries - 1) {
      const fallbackRange = findRangeByTextWithSerializedContext(rangeInfo, text);
      if (fallbackRange) {
        return fallbackRange;
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
