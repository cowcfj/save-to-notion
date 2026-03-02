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
export function findTextInPage(textToFind, context = {}) {
  try {
    // 清理文本（移除多餘空白）
    const cleanText = textToFind.trim().replaceAll(/\s+/g, ' ');

    // 空字符串直接返回 null
    if (!cleanText) {
      return null;
    }

    if (context.prefix || context.suffix) {
      const fuzzyRange = findTextFuzzy(cleanText, context);
      if (fuzzyRange) {
        return fuzzyRange;
      }
      // 若模糊匹配無法找到（例如因正則無法跨多個文字節點），則退回到 TreeWalker 的跨節點匹配
      return findTextWithTreeWalker(cleanText);
    }

    // 方法1：使用 window.find() API（最快，但可能不夠精確）
    // 副作用說明：window.find() 會修改瀏覽器的選區（Selection），
    // 保留前置清理，並透過 finally 在成功/失敗/例外時統一清理。
    const selection = globalThis.getSelection();
    selection.removeAllRanges();
    let matchedRange = null;

    try {
      const found = globalThis.find(cleanText, false, false, false, false, true, false);
      if (found && selection.rangeCount > 0) {
        matchedRange = selection.getRangeAt(0).cloneRange();
      }
    } finally {
      // 覆蓋 getRangeAt/cloneRange 例外與一般路徑，確保選區副作用被清理
      selection.removeAllRanges();
    }

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
  } catch (error) {
    if (globalThis.Logger !== undefined) {
      globalThis.Logger?.error(SEARCH_LOG_TAG, '查找文本失敗:', error);
    }
    return null;
  }
}

/**
 * 用於文本搜索的通用節點過濾器
 * 跳過腳本(SCRIPT)和樣式(STYLE)標籤，避免匹配到隱藏的原始碼內容
 */
const SEARCH_NODE_FILTER = {
  acceptNode(node) {
    const parent = node.parentElement;
    if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
      return NodeFilter.FILTER_SKIP;
    }
    return NodeFilter.FILTER_ACCEPT;
  },
};

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
      if (offset >= 0 && offset <= nodeLength) {
        return { node, offset };
      }
    }
    currentLength += nodeLength;
  }
  return null;
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
    let combinedText = '';
    const nodesInRange = [];

    for (let j = i; j < Math.min(i + MAX_COMBINED_NODES, textNodes.length); j++) {
      combinedText += textNodes[j].textContent;
      nodesInRange.push(textNodes[j]);

      const matchIndex = combinedText.indexOf(textToFind);
      if (matchIndex !== -1) {
        const range = createRangeFromNodesMatch(nodesInRange, matchIndex, textToFind.length);
        if (range) {
          return range;
        }
      }
    }
  }
  return null;
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
    if (globalThis.Logger !== undefined) {
      globalThis.Logger?.error(SEARCH_LOG_TAG, 'findTextWithTreeWalker error:', error);
    }
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

  while (prefixText.length < CONTEXT_SEARCH_WINDOW && idx >= 0) {
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

  while (suffixText.length < CONTEXT_SEARCH_WINDOW && idx < textNodes.length) {
    const nodeText = textNodes[idx].textContent;
    const missingLength = CONTEXT_SEARCH_WINDOW - suffixText.length;
    suffixText += nodeText.length > missingLength ? nodeText.slice(0, missingLength) : nodeText;
    idx++;
  }

  return suffixText;
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

  const windowHalf = Math.floor(CONTEXT_SEARCH_WINDOW / 2);

  if (context.prefix) {
    const initialPrefix = candidate.nodeText.slice(
      Math.max(0, candidate.matchIndex - CONTEXT_SEARCH_WINDOW),
      candidate.matchIndex
    );
    const nodePrefixText = getPrefixFromNodes(textNodes, candidate.nodeIndex, initialPrefix);

    const lowerContextPrefix = context.prefix.toLowerCase();
    const lowerNodePrefixText = nodePrefixText.toLowerCase();

    if (lowerNodePrefixText.endsWith(lowerContextPrefix)) {
      score += 2; // 精確匹配
    } else if (
      lowerNodePrefixText
        .slice(-windowHalf)
        .includes(lowerContextPrefix.slice(-PARTIAL_MATCH_LENGTH))
    ) {
      score += 1; // 局部匹配
    }
  }

  if (context.suffix) {
    const initialSuffix = candidate.nodeText.slice(
      candidate.matchIndex + candidate.matchLength,
      candidate.matchIndex + candidate.matchLength + CONTEXT_SEARCH_WINDOW
    );
    const nodeSuffixText = getSuffixFromNodes(textNodes, candidate.nodeIndex, initialSuffix);

    const lowerContextSuffix = context.suffix.toLowerCase();
    const lowerNodeSuffixText = nodeSuffixText.toLowerCase();

    if (lowerNodeSuffixText.startsWith(lowerContextSuffix)) {
      score += 2; // 精確匹配
    } else if (
      lowerNodeSuffixText
        .slice(0, windowHalf)
        .includes(lowerContextSuffix.slice(0, PARTIAL_MATCH_LENGTH))
    ) {
      score += 1; // 局部匹配
    }
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

    // 首先轉義所有正則表達式元字符，使其被當作普通字符處理
    const escapedText = cleanText.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);

    // 然後將連續的空白字符轉換為 \s+ 以實現寬鬆匹配
    const normalizedSearch = escapedText.replaceAll(/\s+/g, String.raw`\s+`);
    // eslint-disable-next-line security/detect-non-literal-regexp
    const regex = new RegExp(normalizedSearch, 'ig'); // 改為全域比對

    const candidates = findRegexCandidates(regex, textNodes);

    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1 || !(context.prefix || context.suffix)) {
      return candidates[0].range; // 只有一個候選者或無上下文，直接返回
    }

    // 多候選情況下的消歧義打分
    let bestCandidate = candidates[0];
    let maxScore = -1;

    for (const candidate of candidates) {
      const score = calculateCandidateScore(candidate, context, textNodes);
      if (score > maxScore) {
        maxScore = score;
        bestCandidate = candidate;
      }
    }

    if (maxScore <= 0 && (context.prefix || context.suffix) && globalThis.Logger !== undefined) {
      globalThis.Logger?.debug(
        SEARCH_LOG_TAG,
        'calculateCandidateScore failed to disambiguate. maxScore <= 0.',
        {
          prefixLength: context.prefix?.length || 0,
          suffixLength: context.suffix?.length || 0,
          candidateCount: candidates.length,
          bestCandidateRangeLength: bestCandidate.range?.toString?.()?.length || 0,
          maxScore,
          scoringFunction: calculateCandidateScore.name,
          candidatesInfo: candidates.map(candidateInfo => ({
            matchIndex: candidateInfo.matchIndex,
          })),
        }
      );
    }

    return bestCandidate.range;
  } catch (error) {
    if (globalThis.Logger !== undefined) {
      globalThis.Logger?.error(SEARCH_LOG_TAG, 'findTextFuzzy error:', error);
    }
    return null;
  }
}
