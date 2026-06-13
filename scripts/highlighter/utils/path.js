/**
 * DOM 路徑工具模組
 * 提供 DOM 節點路徑序列化和反序列化功能
 */

/** 匹配路徑步驟格式 'tagName[index]' 的正則表達式（支援含連字號的自訂元素，如 my-widget） */
const PATH_REGEX = /^([\w-]+)\[(\d+)\]$/;

function isTextNode(node) {
  return node.nodeType === Node.TEXT_NODE;
}

function buildTextNodePathStep(parent, node) {
  const textNodes = Array.from(parent.childNodes).filter(childNode => isTextNode(childNode));
  const index = textNodes.indexOf(node);
  if (index === -1) {
    return null;
  }
  return `text[${index}]`;
}

function buildElementPathStep(parent, node) {
  const siblings = Array.from(parent.children);
  const index = siblings.indexOf(node);
  if (index === -1) {
    return null;
  }
  return `${node.tagName.toLowerCase()}[${index}]`;
}

function buildNodePathStep(node) {
  const parent = node.parentNode;
  if (!parent) {
    return null;
  }

  if (isTextNode(node)) {
    const step = buildTextNodePathStep(parent, node);
    return step ? { parent, step } : null;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const step = buildElementPathStep(parent, node);
    return step ? { parent, step } : null;
  }

  return null;
}

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
    const pathStep = buildNodePathStep(current);
    if (!pathStep) {
      break;
    }

    pathSteps.unshift(pathStep.step);
    current = pathStep.parent;
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

    const [, rawTag, indexStr] = match;
    const tag = rawTag.toLowerCase();
    const index = Number.parseInt(indexStr, 10);

    if (tag === 'text') {
      path.push({ type: 'text', index });
    } else {
      path.push({ type: 'element', tag, index });
    }
  }

  return path;
}

function getElementChildren(current) {
  return current?.children ? Array.from(current.children) : null;
}

function isValidPathIndex(index) {
  return Number.isInteger(index) && index >= 0;
}

function normalizePathTag(tag) {
  return tag?.toLowerCase();
}

function getElementTagName(element) {
  return element?.tagName?.toLowerCase();
}

function getIndexedElementMatch(children, index, tag) {
  if (index >= children.length) {
    return null;
  }

  const child = children[index];
  return getElementTagName(child) === tag ? child : null;
}

function findFirstElementByTag(children, tag) {
  return children.find(child => getElementTagName(child) === tag) || null;
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
    const children = getElementChildren(current);
    if (!children || !isValidPathIndex(step.index)) {
      return null;
    }

    const tag = normalizePathTag(step.tag);
    return (
      getIndexedElementMatch(children, step.index, tag) || findFirstElementByTag(children, tag)
    );
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

function parsePathInput(path) {
  if (typeof path === 'string') {
    const steps = parsePathFromString(path);
    return { isValid: steps !== null, steps };
  }

  if (Array.isArray(path)) {
    return { isValid: true, steps: path };
  }

  if (path == null) {
    return { isValid: true, steps: [] };
  }

  return { isValid: false, steps: null };
}

const PATH_STEP_RESOLVERS = {
  element: resolveElementNode,
  text: resolveTextNode,
};

function resolvePathStep(current, step) {
  const resolver = PATH_STEP_RESOLVERS[step.type];
  return resolver ? resolver(current, step) : null;
}

function resolvePathSteps(startNode, path) {
  let current = startNode;

  for (const step of path) {
    current = resolvePathStep(current, step);
    if (!current) {
      return null;
    }
  }

  return current;
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
  const { isValid, steps } = parsePathInput(path);

  if (!isValid || !document?.body) {
    return null;
  }

  if (!steps || steps.length === 0) {
    return document.body;
  }

  return resolvePathSteps(document.body, steps);
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
