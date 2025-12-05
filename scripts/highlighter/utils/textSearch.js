/**
 * 文本搜索工具模組
 * 提供在頁面中查找文本並返回 Range 的功能
 */

/**
 * 在頁面中查找文本並返回 Range
 * 使用多種策略：window.find()、TreeWalker、模糊匹配
 *
 * @param {string} textToFind - 要查找的文本
 * @returns {Range|null} 找到的 Range 或 null
 *
 * @example
 * const range = findTextInPage('Hello World');
 * if (range) {
 *   // 使用 range
 * }
 */
export function findTextInPage(textToFind) {
  try {
    // 清理文本（移除多餘空白）
    const cleanText = textToFind.trim().replace(/\s+/g, ' ');

    // 空字符串直接返回 null
    if (!cleanText) {
      return null;
    }

    // 方法1：使用 window.find() API（最快，但可能不夠精確）
    const selection = window.getSelection();
    selection.removeAllRanges();

    const found = window.find(cleanText, false, false, false, false, true, false);

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

    // 方法3：模糊匹配（處理空白字符差異）
    return findTextFuzzy(cleanText);
  } catch (error) {
    if (typeof window.Logger !== 'undefined') {
      window.Logger?.error('[textSearch]', '查找文本失敗:', error);
    }
    return null;
  }
}

/**
 * 使用 TreeWalker 精確查找文本
 * @param {string} textToFind - 要查找的文本
 * @returns {Range|null} 找到的 Range 或 null
 *
 * @example
 * const range = findTextWithTreeWalker('Hello');
 */
export function findTextWithTreeWalker(textToFind) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      // 跳過腳本和樣式標籤
      const parent = node.parentElement;
      if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node = null;
  const textNodes = [];

  while ((node = walker.nextNode()) !== null) {
    if (node.textContent.trim().length > 0) {
      textNodes.push(node);
    }
  }

  // 在單個文本節點中查找
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

  // 嘗試跨文本節點匹配
  for (let i = 0; i < textNodes.length; i++) {
    let combinedText = '';
    const nodesInRange = [];

    for (let j = i; j < Math.min(i + 5, textNodes.length); j++) {
      combinedText += textNodes[j].textContent;
      nodesInRange.push(textNodes[j]);

      const index = combinedText.indexOf(textToFind);
      if (index !== -1) {
        // 找到跨節點的匹配，創建跨節點 Range
        const range = document.createRange();

        // 找到起始節點和偏移
        let currentLength = 0;
        let startNode = null;
        let startOffset = 0;

        for (const rangeNode of nodesInRange) {
          const nodeLength = rangeNode.textContent.length;
          if (currentLength + nodeLength > index) {
            startNode = rangeNode;
            startOffset = index - currentLength;
            break;
          }
          currentLength += nodeLength;
        }

        // 找到結束節點和偏移
        currentLength = 0;
        let endNode = null;
        let endOffset = 0;
        const endIndex = index + textToFind.length;

        for (const rangeNode of nodesInRange) {
          const nodeLength = rangeNode.textContent.length;
          if (currentLength + nodeLength >= endIndex) {
            endNode = rangeNode;
            endOffset = endIndex - currentLength;
            break;
          }
          currentLength += nodeLength;
        }

        if (startNode && endNode) {
          try {
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            return range;
          } catch (error) {
            if (typeof window.Logger !== 'undefined') {
              window.Logger?.warn('[textSearch]', '創建跨節點 Range 失敗:', error);
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * 模糊查找文本（處理空白字符差異）
 * @param {string} textToFind - 要查找的文本
 * @returns {Range|null} 找到的 Range 或 null
 *
 * @example
 * const range = findTextFuzzy('Hello  World'); // 可找到 "Hello World"
 */
export function findTextFuzzy(textToFind) {
  // 將文本轉換為更寬鬆的匹配模式
  const normalizedSearch = textToFind.replace(/\s+/g, '\\s+');
  const regex = new RegExp(normalizedSearch, 'i');

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);

  let node = null;
  while ((node = walker.nextNode()) !== null) {
    if (regex.test(node.textContent)) {
      const match = node.textContent.match(regex);
      if (match) {
        const index = match.index;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + match[0].length);
        return range;
      }
    }
  }

  return null;
}
