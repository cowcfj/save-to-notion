/**
 * 文本搜索工具模組
 * 提供在頁面中查找文本並返回 Range 的功能
 */

export const HIGHLIGHT_ANCHORING = {
  CONTEXT_LENGTH: 32, // Number of characters to extract from context for serialization
};

// 上下文比對的最大字元數，設定為 Range 擷取長度的 2 倍以容忍一定程度的偏移
const CONTEXT_SEARCH_WINDOW = HIGHLIGHT_ANCHORING.CONTEXT_LENGTH * 2;
// 局部片段匹配的字元長度
const PARTIAL_MATCH_LENGTH = 10;
// 跨節點比對的最大節點數量
const MAX_COMBINED_NODES = 5;

const SEARCH_LOG_TAG = '[textSearch]';
const SKIPPED_SEARCH_PARENT_TAGS = new Set(['SCRIPT', 'STYLE']);

/**
 * 記錄 text search 錯誤
 *
 * @param {string} action - 發生錯誤的搜尋動作
 * @param {string} message - 錯誤訊息
 * @param {Error} error - 原始錯誤
 */
function logTextSearchError(action, message, error) {
  if (globalThis.Logger !== undefined) {
    globalThis.Logger?.error(`${SEARCH_LOG_TAG} ${message}`, {
      action,
      result: 'failed',
      error,
    });
  }
}

/**
 * 在頁面中查找文本並返回 Range
 * 使用多種策略：window.find()、TreeWalker、模糊匹配
 *
 * @param {string} textToFind - 要查找的文本
 * @param {object} [context={}] - 上下文資訊，包含 prefix 和 suffix 用於消歧義
 * @returns {Range|null} 找到的 Range 或 null
 * @example
 * const range = findTextInPage('Hello World');
 * if (range) {
 *   // 使用 range
 * }
 */
/**
 * 檢查是否包含上下文資訊
 *
 * @param {object} context - 上下文
 * @returns {boolean}
 */
function hasContextAnchors(context) {
  if (!context) {
    return false;
  }
  if (context.prefix) {
    return true;
  }
  return Boolean(context.suffix);
}

/**
 * 使用 window.find() API 查找文本並清理選區副作用
 *
 * @param {string} cleanText - 已清理的文本
 * @returns {Range|null}
 */
function findTextWithWindowSelection(cleanText) {
  let selection = null;

  try {
    if (typeof globalThis.getSelection !== 'function') {
      return null;
    }

    selection = globalThis.getSelection();
    if (!selection) {
      return null;
    }

    clearSelection(selection);

    if (typeof globalThis.find !== 'function') {
      return null;
    }

    const found = globalThis.find(cleanText, false, false, false, false, true, false);
    if (!found) {
      return null;
    }
    if (selection.rangeCount === 0) {
      return null;
    }
    return selection.getRangeAt(0).cloneRange();
  } catch {
    return null;
  } finally {
    // 覆蓋 getRangeAt/cloneRange 例外與一般路徑，確保選區副作用被清理
    clearSelection(selection);
  }
}

function clearSelection(selection) {
  try {
    selection?.removeAllRanges?.();
  } catch {
    // Selection cleanup failure should not block the fallback search chain.
  }
}

/**
 * 當有上下文時的尋找策略：先模糊，後 TreeWalker 跨節點
 *
 * @param {string} cleanText - 已清理的文本
 * @param {object} context - 上下文
 * @returns {Range|null}
 */
function findTextWithContextFallback(cleanText, context) {
  const fuzzyRange = findTextFuzzy(cleanText, context);
  if (fuzzyRange) {
    return fuzzyRange;
  }
  // 若模糊匹配無法找到（例如因正則無法跨多個文字節點），則退回到 TreeWalker 的跨節點匹配
  return findTextWithTreeWalker(cleanText);
}

/**
 * 當無上下文時的尋找策略：先 window.find，次 TreeWalker，後模糊匹配
 *
 * @param {string} cleanText - 已清理的文本
 * @param {object} context - 上下文
 * @returns {Range|null}
 */
function findTextWithoutContextFallback(cleanText, context) {
  // 方法1：使用 window.find() API（最快，但可能不夠精確）
  const matchedRange = findTextWithWindowSelection(cleanText);
  if (matchedRange) {
    return matchedRange;
  }

  // 方法2：使用 TreeWalker 精確查找
  const range = findTextWithTreeWalker(cleanText);
  if (range) {
    return range;
  }

  // 方法3：模糊匹配（處理空白字符差異），如果有多個匹配，使用上下文消歧義
  return findTextFuzzy(cleanText, context);
}

export function findTextInPage(textToFind, context = {}) {
  try {
    // 清理文本（移除多餘空白）
    const cleanText = textToFind.trim().replaceAll(/\s+/g, ' ');

    // 空字符串直接返回 null
    if (!cleanText) {
      return null;
    }

    if (hasContextAnchors(context)) {
      return findTextWithContextFallback(cleanText, context);
    }

    return findTextWithoutContextFallback(cleanText, context);
  } catch (error) {
    logTextSearchError('findTextInPage', '查找文本失敗:', error);
    return null;
  }
}

/**
 * 用於文本搜索的通用節點過濾器
 * 跳過腳本(SCRIPT)和樣式(STYLE)標籤，避免匹配到隱藏的原始碼內容
 */
const SEARCH_NODE_FILTER = {
  acceptNode(node) {
    if (shouldSkipSearchTextNode(node)) {
      return NodeFilter.FILTER_SKIP;
    }
    return NodeFilter.FILTER_ACCEPT;
  },
};

/**
 * 判斷文字節點是否位於不應搜尋的父元素中
 *
 * @param {Node} node - 文字節點
 * @returns {boolean}
 */
function shouldSkipSearchTextNode(node) {
  const parent = node.parentElement;
  if (!parent) {
    return false;
  }
  return SKIPPED_SEARCH_PARENT_TAGS.has(parent.tagName);
}

/**
 * 獲取頁面中用於搜索的所有文本節點，過濾掉不需要的元素
 *
 * @returns {Node[]} 文本節點陣列
 */
function getTextNodesForSearch() {
  if (!document.body) {
    return [];
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, SEARCH_NODE_FILTER);

  let node = null;
  const textNodes = [];

  while ((node = walker.nextNode()) !== null) {
    if (node.textContent.trim().length > 0) {
      textNodes.push(node);
    }
  }

  return textNodes;
}

/**
 * 在單個文本節點中查找文本
 *
 * @param {string} textToFind - 要查找的文本
 * @param {Node[]} textNodes - 文本節點陣列
 * @returns {Range|null}
 */
function findTextInSingleNode(textToFind, textNodes) {
  for (const textNode of textNodes) {
    const text = textNode.textContent;
    const index = text.indexOf(textToFind);

    if (index !== -1) {
      const range = document.createRange();
      range.setStart(textNode, index);
      range.setEnd(textNode, index + textToFind.length);
      return range;
    }
  }
  return null;
}

/**
 * 根據目標偏移量尋找對應的文本節點與其內部偏移
 *
 * @param {Node[]} nodesInRange - 範圍內的節點陣列
 * @param {number} targetOffset - 從合併字串起算的目標位置
 * @returns {object|null} 包含 node 和 offset 的物件，若無則回傳 null
 */
function findNodeForOffset(nodesInRange, targetOffset) {
  let currentLength = 0;

  for (const node of nodesInRange) {
    const nodeLength = node.textContent.length;
    // 如果加入這個節點的長度後超過或剛好等於目標偏移，代表落在這個節點（或邊界）
    if (currentLength + nodeLength >= targetOffset) {
      // 例外處理：若要求開始位置剛好等於節點開頭，或者結束位置剛好壓在節點結尾
      // 在嚴格的大於判斷下可以微調，這裡採取統一計算：偏移 = 總目標 - 已走過長度
      const offset = targetOffset - currentLength;
      // 確保偏移不會超過節點內容，或為負數
      if (isOffsetWithinNode(offset, nodeLength)) {
        return { node, offset };
      }
    }
    currentLength += nodeLength;
  }
  return null;
}

/**
 * 判斷偏移量是否位於單一文字節點範圍內
 *
 * @param {number} offset - 節點內偏移量
 * @param {number} nodeLength - 節點文字長度
 * @returns {boolean}
 */
function isOffsetWithinNode(offset, nodeLength) {
  if (offset < 0) {
    return false;
  }
  return offset <= nodeLength;
}

/**
 * 創建跨節點的 Range
 *
 * @param {Node[]} nodesInRange - 範圍內的節點陣列
 * @param {number} matchIndex - 匹配起始位置
 * @param {number} textLength - 要匹配的文本長度
 * @returns {Range|null}
 */
function createRangeFromNodesMatch(nodesInRange, matchIndex, textLength) {
  const endIndex = matchIndex + textLength;

  const start = findNodeForOffset(nodesInRange, matchIndex);
  if (!start) {
    return null;
  }

  const end = findNodeForOffset(nodesInRange, endIndex);
  if (!end) {
    return null;
  }
  const range = document.createRange();

  try {
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  } catch (error) {
    if (globalThis.Logger !== undefined) {
      globalThis.Logger?.warn(SEARCH_LOG_TAG, '創建跨節點 Range 失敗:', error);
    }
    return null;
  }
}

/**
 * 跨多個文本節點查找文本
 *
 * @param {string} textToFind - 要查找的文本
 * @param {Node[]} textNodes - 文本節點陣列
 * @returns {Range|null}
 */
function findRangeAcrossNodes(textToFind, textNodes) {
  for (let i = 0; i < textNodes.length; i++) {
    const range = findRangeStartingAtNode(textToFind, textNodes, i);
    if (range) {
      return range;
    }
  }
  return null;
}

/**
 * 從指定文字節點開始嘗試建立跨節點 Range
 *
 * @param {string} textToFind - 要查找的文本
 * @param {Node[]} textNodes - 文本節點陣列
 * @param {number} startIndex - 起始節點索引
 * @returns {Range|null}
 */
function findRangeStartingAtNode(textToFind, textNodes, startIndex) {
  let combinedText = '';
  const nodesInRange = [];
  const endIndex = Math.min(startIndex + MAX_COMBINED_NODES, textNodes.length);

  for (let nodeIndex = startIndex; nodeIndex < endIndex; nodeIndex++) {
    combinedText += textNodes[nodeIndex].textContent;
    nodesInRange.push(textNodes[nodeIndex]);

    const range = createRangeFromCombinedText(textToFind, nodesInRange, combinedText);
    if (range) {
      return range;
    }
  }

  return null;
}

/**
 * 從合併文字建立匹配 Range
 *
 * @param {string} textToFind - 要查找的文本
 * @param {Node[]} nodesInRange - 範圍內的節點陣列
 * @param {string} combinedText - 已合併的節點文字
 * @returns {Range|null}
 */
function createRangeFromCombinedText(textToFind, nodesInRange, combinedText) {
  const matchIndex = combinedText.indexOf(textToFind);
  if (matchIndex === -1) {
    return null;
  }
  return createRangeFromNodesMatch(nodesInRange, matchIndex, textToFind.length);
}

/**
 * 使用 TreeWalker 精確查找文本
 *
 * @param {string} textToFind - 要查找的文本
 * @returns {Range|null} 找到的 Range 或 null
 * @example
 * const range = findTextWithTreeWalker('Hello');
 */
export function findTextWithTreeWalker(textToFind) {
  try {
    if (!document.body) {
      return null;
    }
    const textNodes = getTextNodesForSearch();

    // 在單個文本節點中查找
    const singleNodeRange = findTextInSingleNode(textToFind, textNodes);
    if (singleNodeRange) {
      return singleNodeRange;
    }

    // 嘗試跨文本節點匹配
    return findRangeAcrossNodes(textToFind, textNodes);
  } catch (error) {
    logTextSearchError('findTextWithTreeWalker', 'findTextWithTreeWalker error:', error);
    return null;
  }
}

/**
 * 尋找正則表達式在所有文本節點中的匹配候選者
 *
 * @param {RegExp} regex - 匹配的正則表達式
 * @param {Text[]} textNodes - 預先計算的文本節點陣列
 * @returns {Array} 候選者陣列
 */
function findRegexCandidates(regex, textNodes) {
  const candidates = [];

  for (const [nodeIndex, node] of textNodes.entries()) {
    const textContent = node.textContent;
    regex.lastIndex = 0; // 重置正則表達式狀態

    let match;
    while ((match = regex.exec(textContent)) !== null) {
      const index = match.index;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + match[0].length);

      candidates.push({
        range,
        node,
        nodeIndex,
        nodeText: textContent,
        matchIndex: index,
        matchLength: match[0].length,
      });
    }
  }

  return candidates;
}

/**
 * 透過文本節點陣列往前取得更多的前綴文字
 *
 * @param {Text[]} textNodes - 所有文本節點的陣列
 * @param {number} nodeIndex - 候選者節點在陣列中的索引
 * @param {string} initialText - 候選者節點內已取得的初始前綴
 * @returns {string} 擴展後的前綴文本
 */
function getPrefixFromNodes(textNodes, nodeIndex, initialText) {
  let prefixText = initialText;
  let idx = nodeIndex - 1;

  while (prefixText.length < CONTEXT_SEARCH_WINDOW) {
    if (idx < 0) {
      break;
    }
    const nodeText = textNodes[idx].textContent;
    const missingLength = CONTEXT_SEARCH_WINDOW - prefixText.length;
    prefixText =
      (nodeText.length > missingLength ? nodeText.slice(-missingLength) : nodeText) + prefixText;
    idx--;
  }

  return prefixText;
}

/**
 * 透過文本節點陣列往後取得更多的後綴文字
 *
 * @param {Text[]} textNodes - 所有文本節點的陣列
 * @param {number} nodeIndex - 候選者節點在陣列中的索引
 * @param {string} initialText - 候選者節點內已取得的初始後綴
 * @returns {string} 擴展後的後綴文本
 */
function getSuffixFromNodes(textNodes, nodeIndex, initialText) {
  let suffixText = initialText;
  let idx = nodeIndex + 1;

  while (suffixText.length < CONTEXT_SEARCH_WINDOW) {
    if (idx >= textNodes.length) {
      break;
    }
    const nodeText = textNodes[idx].textContent;
    const missingLength = CONTEXT_SEARCH_WINDOW - suffixText.length;
    suffixText += nodeText.length > missingLength ? nodeText.slice(0, missingLength) : nodeText;
    idx++;
  }

  return suffixText;
}

/**
 * 計算單一方向（前綴或後綴）上下文的匹配分數
 *
 * @param {string} contextText - 上下文常規文字 (prefix 或 suffix)
 * @param {string} nodeContextText - 擷取自節點鏈的上下文文字
 * @param {string} direction - 'prefix' 或 'suffix'
 * @returns {number} 分數 (0, 1, 2)
 */
function calculateSingleContextScore(contextText, nodeContextText, direction) {
  if (!contextText) {
    return 0;
  }

  const lowerContextText = contextText.toLowerCase();
  const lowerNodeContextText = nodeContextText.toLowerCase();

  const isPrefix = direction === 'prefix';
  const isExactMatch = isPrefix
    ? lowerNodeContextText.endsWith(lowerContextText)
    : lowerNodeContextText.startsWith(lowerContextText);

  if (isExactMatch) {
    return 2; // 精確匹配
  }

  const windowHalf = Math.floor(CONTEXT_SEARCH_WINDOW / 2);
  const nodePart = isPrefix
    ? lowerNodeContextText.slice(-windowHalf)
    : lowerNodeContextText.slice(0, windowHalf);
  const contextPart = isPrefix
    ? lowerContextText.slice(-PARTIAL_MATCH_LENGTH)
    : lowerContextText.slice(0, PARTIAL_MATCH_LENGTH);

  if (nodePart.includes(contextPart)) {
    return 1; // 局部匹配
  }

  return 0;
}

/**
 * 計算單個候選匹配項基於上下文的評分
 *
 * @param {object} candidate - 候選匹配項
 * @param {object} context - 上下文（prefix, suffix）
 * @param {Text[]} textNodes - 預先計算的文本節點陣列
 * @returns {number} 評分分數
 */
function calculateCandidateScore(candidate, context, textNodes) {
  let score = 0;

  if (context.prefix) {
    const initialPrefix = candidate.nodeText.slice(
      Math.max(0, candidate.matchIndex - CONTEXT_SEARCH_WINDOW),
      candidate.matchIndex
    );
    const nodePrefixText = getPrefixFromNodes(textNodes, candidate.nodeIndex, initialPrefix);
    score += calculateSingleContextScore(context.prefix, nodePrefixText, 'prefix');
  }

  if (context.suffix) {
    const initialSuffix = candidate.nodeText.slice(
      candidate.matchIndex + candidate.matchLength,
      candidate.matchIndex + candidate.matchLength + CONTEXT_SEARCH_WINDOW
    );
    const nodeSuffixText = getSuffixFromNodes(textNodes, candidate.nodeIndex, initialSuffix);
    score += calculateSingleContextScore(context.suffix, nodeSuffixText, 'suffix');
  }

  return score;
}

/**
 * 模糊查找文本（處理空白字符差異並支援上下文消歧義）
 *
 * @param {string} textToFind - 要查找的文本
 * @param {object} [context={}] - 包含 prefix 和 suffix
 * @returns {Range|null} 找到的最佳 Range 或 null
 */
/**
 * 建立具備空白字元彈性的正則表達式
 *
 * @param {string} cleanText - 清理過後的文本
 * @returns {RegExp}
 */
function createWhitespaceFlexibleRegex(cleanText) {
  // 首先轉義所有正則表達式元字符，使其被當作普通字符處理
  const escapedText = cleanText.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);

  // 然後將連續的空白字符轉換為 \s+ 以實現寬鬆匹配
  const normalizedSearch = escapedText.replaceAll(/\s+/g, String.raw`\s+`);
  // eslint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(normalizedSearch, 'ig'); // 改為全域比對
}

/**
 * 判斷是否直接使用第一個候選者（只有一個候選者，或完全無上下文時）
 *
 * @param {Array} candidates - 候選者陣列
 * @param {object} context - 上下文
 * @returns {boolean}
 */
function shouldUseFirstFuzzyCandidate(candidates, context) {
  if (candidates.length === 1) {
    return true;
  }
  return !hasContextAnchors(context);
}

/**
 * 從多個候選者中評分並選出最佳的候選者
 *
 * @param {Array} candidates - 候選者陣列
 * @param {object} context - 上下文
 * @param {Text[]} textNodes - 文本節點
 * @returns {object} 包含 bestCandidate 與 maxScore
 */
function selectBestFuzzyCandidate(candidates, context, textNodes) {
  let bestCandidate = candidates[0];
  let maxScore = -1;

  for (const candidate of candidates) {
    const score = calculateCandidateScore(candidate, context, textNodes);
    if (score > maxScore) {
      maxScore = score;
      bestCandidate = candidate;
    }
  }

  return { bestCandidate, maxScore };
}

/**
 * 判斷是否應回報模糊匹配消歧義失敗
 *
 * @param {number} maxScore - 最高分
 * @param {object} context - 上下文
 * @returns {boolean}
 */
function shouldReportFuzzyDisambiguationFailure(maxScore, context) {
  if (maxScore > 0) {
    return false;
  }
  if (!hasContextAnchors(context)) {
    return false;
  }
  return globalThis.Logger !== undefined;
}

/**
 * 取得可選上下文文字長度
 *
 * @param {string|undefined} text - 上下文文字
 * @returns {number}
 */
function getOptionalTextLength(text) {
  return text ? text.length : 0;
}

/**
 * 取得最佳候選者 Range 文字長度
 *
 * @param {object} bestCandidate - 最佳候選者
 * @returns {number}
 */
function getBestCandidateRangeLength(bestCandidate) {
  const range = bestCandidate.range;
  if (!range) {
    return 0;
  }
  if (typeof range.toString !== 'function') {
    return 0;
  }
  return range.toString().length;
}

/**
 * 建立候選者偵錯摘要
 *
 * @param {object} candidateInfo - 候選者
 * @returns {object}
 */
function buildCandidateDebugInfo(candidateInfo) {
  return {
    matchIndex: candidateInfo.matchIndex,
  };
}

/**
 * 記錄模糊匹配消歧義失敗的偵錯日誌
 *
 * @param {Array} candidates - 候選者
 * @param {object} bestCandidate - 最佳候選者
 * @param {number} maxScore - 最高分
 * @param {object} context - 上下文
 */
function logFuzzyDisambiguationFailure(candidates, bestCandidate, maxScore, context) {
  globalThis.Logger?.debug(
    `${SEARCH_LOG_TAG} calculateCandidateScore failed to disambiguate. maxScore <= 0.`,
    {
      action: 'findTextFuzzy',
      result: 'disambiguation_failed',
      prefixLength: getOptionalTextLength(context.prefix),
      suffixLength: getOptionalTextLength(context.suffix),
      candidateCount: candidates.length,
      bestCandidateRangeLength: getBestCandidateRangeLength(bestCandidate),
      maxScore,
      scoringFunction: calculateCandidateScore.name,
      candidatesInfo: candidates.map(candidateInfo => buildCandidateDebugInfo(candidateInfo)),
    }
  );
}

export function findTextFuzzy(textToFind, context = {}) {
  try {
    if (!document.body) {
      return null;
    }

    const cleanText = textToFind.trim();
    if (!cleanText) {
      return null;
    }

    // 取得所有文字節點（唯一一次 DOM 掃描）
    const textNodes = getTextNodesForSearch();

    const regex = createWhitespaceFlexibleRegex(cleanText);
    const candidates = findRegexCandidates(regex, textNodes);

    if (candidates.length === 0) {
      return null;
    }

    if (shouldUseFirstFuzzyCandidate(candidates, context)) {
      return candidates[0].range; // 只有一個候選者或無上下文，直接返回
    }

    // 多候選情況下的消歧義打分
    const { bestCandidate, maxScore } = selectBestFuzzyCandidate(candidates, context, textNodes);

    if (shouldReportFuzzyDisambiguationFailure(maxScore, context)) {
      logFuzzyDisambiguationFailure(candidates, bestCandidate, maxScore, context);
    }

    return bestCandidate.range;
  } catch (error) {
    logTextSearchError('findTextFuzzy', 'findTextFuzzy error:', error);
    return null;
  }
}
