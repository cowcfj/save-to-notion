/**
 * Range 模組 Testable 版本
 */

// 更新導入：使用源代碼替代已刪除的 testable 文件
const { getNodePath, getNodeByPath } = require('../../../../scripts/highlighter/utils/path.js');
const { findTextInPage } = require('../../../../scripts/highlighter/utils/textSearch.js');
const { waitForDOMStability } = require('../../../../scripts/highlighter/utils/domStability.js');

function serializeRange(range) {
  return {
    startContainerPath: getNodePath(range.startContainer),
    startOffset: range.startOffset,
    endContainerPath: getNodePath(range.endContainer),
    endOffset: range.endOffset,
  };
}

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

function findRangeByTextContent(targetText) {
  if (!targetText || typeof targetText !== 'string') {
    return null;
  }

  return findTextInPage(targetText);
}

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
