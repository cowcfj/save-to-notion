/**
 * Range 模組 Testable 版本
 */

// 更新導入：使用源代碼替代已刪除的 testable 文件
const { getNodePath, getNodeByPath } = require('../../../../scripts/highlighter/utils/path.js');
const { findTextInPage } = require('../../../../scripts/highlighter/utils/textSearch.js');
const { waitForDOMStability } = require('../../../../scripts/highlighter/utils/domStability.js');

/**
 * 序列化 Range 對象為可存儲的格式
 * @param {Range} range - DOM Range 對象
 * @returns {Object} 序列化的範圍資訊
 */
function serializeRange(range) {
  return {
    startContainerPath: getNodePath(range.startContainer),
    startOffset: range.startOffset,
    endContainerPath: getNodePath(range.endContainer),
    endOffset: range.endOffset,
  };
}

/**
 * 反序列化範圍資訊為 Range 對象
 * @param {Object} rangeInfo - 序列化的範圍資訊
 * @param {string} expectedText - 預期的文本內容用於驗證
 * @returns {Range|null} 重建的 Range 對象，驗證失敗則返回 null
 */
function deserializeRange(rangeInfo, expectedText) {
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

    const actualText = range.toString();
    if (actualText !== expectedText) {
      return null;
    }

    return range;
  } catch (_error) {
    return null;
  }
}

/**
 * 重試恢復 Range 對象
 * @param {Object} rangeInfo - 序列化的範圍資訊
 * @param {string} text - 預期的文本內容
 * @param {number} [maxRetries=3] - 最大重試次數
 * @returns {Promise<Range|null>} 恢復的 Range 對象或 null
 */
async function restoreRangeWithRetry(rangeInfo, text, maxRetries = 3) {
  let range = deserializeRange(rangeInfo, text);
  if (range) {
    return range;
  }

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

    if (i === maxRetries - 1) {
      range = findTextInPage(text);
      if (range) {
        return range;
      }
    }
  }

  return null;
}

/**
 * 根據文本內容查找 Range 對象
 * @param {string} targetText - 目標文本
 * @returns {Range|null} 找到的 Range 對象或 null
 */
function findRangeByTextContent(targetText) {
  if (!targetText || typeof targetText !== 'string') {
    return null;
  }

  return findTextInPage(targetText);
}

/**
 * 驗證 Range 對象的文本內容
 * @param {Range} range - DOM Range 對象
 * @param {string} expectedText - 預期的文本內容
 * @returns {boolean} 驗證是否通過
 */
function validateRange(range, expectedText) {
  if (!range) {
    return false;
  }

  try {
    const actualText = range.toString();
    return actualText === expectedText;
  } catch (_error) {
    return false;
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    serializeRange,
    deserializeRange,
    restoreRangeWithRetry,
    findRangeByTextContent,
    validateRange,
  };
}
