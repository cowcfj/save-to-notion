/**
 * 文本搜索工具模組
 * 提供在頁面中查找文本並返回 Range 的功能
 */

/** 上下文搜索窗口：為序列化上下文長度 (CONTEXT_LENGTH=32) 的 2 倍，以容許 DOM 結構變動後的文字偏移 */
const CONTEXT_SEARCH_WINDOW = 64;

/** 局部匹配時取前後文的字元數 */
const PARTIAL_MATCH_LENGTH = 10;

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
      return findTextFuzzy(cleanText, context);
    }

    // 方法1：使用 window.find() API（最快，但可能不夠精確）
    const selection = globalThis.getSelection();
    selection.removeAllRanges();

    const found = globalThis.find(cleanText, false, false, false, false, true, false);

    if (found && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0).cloneRange();
      selection.removeAllRanges();
      return range;
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
      globalThis.Logger?.error('[textSearch]', '查找文本失敗:', error);
    }
    return null;
  }
}

/**
 * 用於文本搜索的通用節點過濾器
 * 跳過腳本(SCRIPT)和樣式(STYLE)標籤，避免匹配到隱藏的原始碼內容
 */
const SEARCH_NODE_FILTER = {
  acceptNode: node => {
    const parent = node.parentElement;
    if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
      return NodeFilter.FILTER_REJECT;
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
      globalThis.Logger?.warn('[textSearch]', '創建跨節點 Range 失敗:', error);
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

    for (let j = i; j < Math.min(i + 5, textNodes.length); j++) {
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
  const textNodes = getTextNodesForSearch();

  // 在單個文本節點中查找
  const singleNodeRange = findTextInSingleNode(textToFind, textNodes);
  if (singleNodeRange) {
    return singleNodeRange;
  }

  // 嘗試跨文本節點匹配
  return findRangeAcrossNodes(textToFind, textNodes);
}

/**
 * 尋找正則表達式在所有文本節點中的匹配候選者
 *
 * @param {RegExp} regex - 匹配的正則表達式
 * @returns {Array} 候選者陣列
 */
function findRegexCandidates(regex) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, SEARCH_NODE_FILTER);
  const candidates = [];
  let node = null;

  while ((node = walker.nextNode()) !== null) {
    const textContent = node.textContent;
    let match;
    regex.lastIndex = 0; // 重置正則表達式狀態

    while ((match = regex.exec(textContent)) !== null) {
      const index = match.index;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + match[0].length);

      candidates.push({
        range,
        node,
        nodeText: textContent,
        matchIndex: index,
        matchLength: match[0].length,
      });
    }
  }

  return candidates;
}

/**
 * 使用 TreeWalker 往前回溯取得更多的前綴文字
 *
 * @param {Node} node - 起始節點
 * @param {string} initialText - 初始文本
 * @returns {string} 擴展後的前綴文本
 */
function getPrefixTextWithWalker(node, initialText) {
  let prefixText = initialText;
  if (prefixText.length < CONTEXT_SEARCH_WINDOW && node) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      SEARCH_NODE_FILTER
    );
    walker.currentNode = node;
    while (prefixText.length < CONTEXT_SEARCH_WINDOW && walker.previousNode()) {
      const textNode = walker.currentNode;
      const missingLength = CONTEXT_SEARCH_WINDOW - prefixText.length;
      const nodeText = textNode.textContent;
      prefixText =
        (nodeText.length > missingLength ? nodeText.slice(-missingLength) : nodeText) + prefixText;
    }
  }
  return prefixText;
}

/**
 * 使用 TreeWalker 往後回溯取得更多的後綴文字
 *
 * @param {Node} node - 起始節點
 * @param {string} initialText - 初始文本
 * @returns {string} 擴展後的後綴文本
 */
function getSuffixTextWithWalker(node, initialText) {
  let suffixText = initialText;
  if (suffixText.length < CONTEXT_SEARCH_WINDOW && node) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      SEARCH_NODE_FILTER
    );
    walker.currentNode = node;
    while (suffixText.length < CONTEXT_SEARCH_WINDOW && walker.nextNode()) {
      const textNode = walker.currentNode;
      const missingLength = CONTEXT_SEARCH_WINDOW - suffixText.length;
      const nodeText = textNode.textContent;
      suffixText += nodeText.length > missingLength ? nodeText.slice(0, missingLength) : nodeText;
    }
  }
  return suffixText;
}

/**
 * 計算單個候選匹配項基於上下文的評分
 *
 * @param {object} candidate - 候選匹配項
 * @param {object} context - 上下文（prefix, suffix）
 * @returns {number} 評分分數
 */
function calculateCandidateScore(candidate, context) {
  let score = 0;

  if (context.prefix) {
    const initialPrefix = candidate.nodeText.slice(
      Math.max(0, candidate.matchIndex - CONTEXT_SEARCH_WINDOW),
      candidate.matchIndex
    );
    const nodePrefixText = getPrefixTextWithWalker(candidate.node, initialPrefix);

    if (nodePrefixText.endsWith(context.prefix)) {
      score += 2; // 精確匹配
    } else if (nodePrefixText.includes(context.prefix.slice(-PARTIAL_MATCH_LENGTH))) {
      score += 1; // 局部匹配
    }
  }

  if (context.suffix) {
    const initialSuffix = candidate.nodeText.slice(
      candidate.matchIndex + candidate.matchLength,
      candidate.matchIndex + candidate.matchLength + CONTEXT_SEARCH_WINDOW
    );
    const nodeSuffixText = getSuffixTextWithWalker(candidate.node, initialSuffix);

    if (nodeSuffixText.startsWith(context.suffix)) {
      score += 2; // 精確匹配
    } else if (nodeSuffixText.includes(context.suffix.slice(0, PARTIAL_MATCH_LENGTH))) {
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
  // 首先轉義所有正則表達式元字符，使其被當作普通字符處理
  const escapedText = textToFind.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);

  // 然後將連續的空白字符轉換為 \s+ 以實現寬鬆匹配
  const normalizedSearch = escapedText.replaceAll(/\s+/g, String.raw`\s+`);
  // eslint-disable-next-line security/detect-non-literal-regexp
  const regex = new RegExp(normalizedSearch, 'ig'); // 改為全域比對

  const candidates = findRegexCandidates(regex);

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
    const score = calculateCandidateScore(candidate, context);
    if (score > maxScore) {
      maxScore = score;
      bestCandidate = candidate;
    }
  }

  return bestCandidate.range;
}
