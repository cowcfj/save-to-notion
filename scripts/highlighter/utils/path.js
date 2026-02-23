/**
 * DOM 路徑工具模組
 * 提供 DOM 節點路徑序列化和反序列化功能
 */

/** 匹配路徑步驟格式 'tagName[index]' 的正則表達式（支援含連字號的自訂元素，如 my-widget） */
const PATH_REGEX = /^([\w-]+)\[(\d+)\]$/;

/**
 * 獲取節點的路徑（從當前節點到 document.body）
 *
 * @param {Node} node - DOM 節點
 * @returns {string} 路徑字符串，格式：'div[0]/p[2]/text[0]'
 * @example
 * const path = getNodePath(textNode);
 * // 返回: 'div[0]/p[2]/text[0]'
 */
export function getNodePath(node) {
  if (!node || node === document.body) {
    return '';
  }

  const pathSteps = [];
  let current = node;

  while (current && current !== document.body) {
    if (current.nodeType === Node.TEXT_NODE) {
      // 文本節點：記錄所在位置
      const parent = current.parentNode;
      if (parent) {
        const textNodes = Array.from(parent.childNodes).filter(
          childNode => childNode.nodeType === Node.TEXT_NODE
        );
        const index = textNodes.indexOf(current);
        pathSteps.unshift(`text[${index}]`);
        current = parent;
      } else {
        // 文本節點沒有父節點，終止迴圈
        break;
      }
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      // 元素節點:記錄標籤名和在父節點中的索引
      const parent = current.parentNode;
      if (parent) {
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(current);
        pathSteps.unshift(`${current.tagName.toLowerCase()}[${index}]`);
        current = parent;
      } else {
        // 元素節點沒有父節點，終止迴圈
        break;
      }
    } else {
      break;
    }
  }

  // 返回字符串格式 "div[0]/p[2]/text[0]"
  return pathSteps.join('/');
}

/**
 * 從字符串路徑解析為路徑對象數組
 *
 * @param {string} pathString - 路徑字符串
 * @returns {Array<object> | null} 路徑對象數組或 null
 * @example
 * parsePathFromString('div[0]/p[2]/text[0]')
 * // 返回: [{ type: 'element', tag: 'div', index: 0 }, ...]
 */
export function parsePathFromString(pathString) {
  if (typeof pathString !== 'string') {
    return null;
  }

  const trimmed = pathString.trim();
  if (trimmed === '') {
    return []; // 空字符串返回空數組
  }

  const steps = trimmed.split('/');
  const path = [];

  for (const step of steps) {
    if (!step) {
      continue;
    }

    const match = PATH_REGEX.exec(step);
    if (!match) {
      return null; // 格式錯誤
    }

    const [, tag, indexStr] = match;
    const index = Number.parseInt(indexStr, 10);

    if (tag === 'text') {
      path.push({ type: 'text', index });
    } else {
      path.push({ type: 'element', tag, index });
    }
  }

  return path;
}

/**
 * 根據 element 類型的路徑步驟，從當前節點導覽到下一個子元素
 *
 * @param {Element} current - 當前 DOM 元素
 * @param {{type: 'element', tag: string, index: number}} step - 路徑步驟
 * @returns {Element|null} 下一個 DOM 元素，或 null
 */
export function resolveElementNode(current, step) {
  try {
    if (!current?.children) {
      return null;
    }

    const children = Array.from(current.children);

    if (step.index >= 0 && step.index < children.length) {
      return children[step.index];
    }

    // 模糊匹配：查找具有相同標籤名的元素
    const matchingElements = children.filter(child => child.tagName?.toLowerCase() === step.tag);
    return matchingElements.length > 0 ? matchingElements[0] : null;
  } catch {
    return null;
  }
}

/**
 * 根據 text 類型的路徑步驟，從當前節點導覽到下一個文字節點
 *
 * @param {Node} current - 當前 DOM 節點
 * @param {{type: 'text', index: number}} step - 路徑步驟
 * @returns {Text|null} 下一個文字節點，或 null
 */
export function resolveTextNode(current, step) {
  try {
    if (!current?.childNodes) {
      return null;
    }

    const textNodes = Array.from(current.childNodes).filter(
      node => node.nodeType === Node.TEXT_NODE
    );

    if (step.index < 0 || step.index >= textNodes.length) {
      return null;
    }

    return textNodes[step.index];
  } catch {
    return null;
  }
}

/**
 * 根據路徑對象數組獲取 DOM 節點
 *
 * @param {Array<object> | string} path - 路徑對象數組或路徑字符串
 * @returns {Node|null} DOM 節點或 null
 * @example
 * const node = getNodeByPath('div[0]/p[2]/text[0]');
 */
export function getNodeByPath(path) {
  // 如果是字符串格式，先解析
  if (typeof path === 'string') {
    path = parsePathFromString(path);
    if (!path) {
      return null;
    }
  }

  // 確保 document.body 存在
  if (!document?.body) {
    return null;
  }

  // 空路徑返回 document.body
  if (!path || path.length === 0) {
    return document.body;
  }

  let current = document.body;

  for (const step of path) {
    if (step.type === 'element') {
      current = resolveElementNode(current, step);
    } else if (step.type === 'text') {
      current = resolveTextNode(current, step);
    }
    if (!current) {
      return null;
    }
  }

  return current;
}

/**
 * 驗證路徑字符串格式是否正確
 *
 * @param {string} pathString - 路徑字符串
 * @returns {boolean} 如果格式正確則返回 true
 * @example
 * isValidPathString('div[0]/p[2]/text[0]') // true
 * isValidPathString('invalid') // false
 */
export function isValidPathString(pathString) {
  if (typeof pathString !== 'string') {
    return false;
  }

  if (pathString.trim() === '') {
    return true; // 空字符串是有效的（代表 document.body）
  }

  const steps = pathString.split('/');

  for (const step of steps) {
    if (!step || !PATH_REGEX.test(step)) {
      return false;
    }
  }

  return true;
}
