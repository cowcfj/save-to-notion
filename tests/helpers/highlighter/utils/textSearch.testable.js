/**
 * 文本搜索工具模組（Testable 版本）
 *
 * 此檔案為測試版本，使用 CommonJS 格式
 * 源檔案：scripts/highlighter/utils/textSearch.js (ES6 模組)
 */

function findTextInPage(textToFind) {
  try {
    const cleanText = textToFind.trim().replace(/\s+/g, ' ');

    // 空字符串直接返回 null
    if (!cleanText) {
      return null;
    }

    const selection = window.getSelection();
    selection.removeAllRanges();

    const found = window.find(cleanText, false, false, false, false, true, false);

    if (found && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0).cloneRange();
      selection.removeAllRanges();
      return range;
    }

    const range = findTextWithTreeWalker(cleanText);
    if (range) {
      return range;
    }

    return findTextFuzzy(cleanText);
  } catch (_error) {
    return null;
  }
}

function findTextWithTreeWalker(textToFind) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
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

function findTextFuzzy(textToFind) {
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

if (typeof module !== 'undefined') {
  module.exports = {
    findTextInPage,
    findTextWithTreeWalker,
    findTextFuzzy,
  };
}
