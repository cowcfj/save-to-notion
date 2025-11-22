/**
 * DOM 路徑工具模組（Testable 版本）
 * 提供 DOM 節點路徑序列化和反序列化功能
 * 
 * 此檔案為測試版本，使用 CommonJS 格式
 * 源檔案：scripts/highlighter/utils/path.js (ES6 模組)
 */

/**
 * 獲取節點的路徑（從當前節點到 document.body）
 */
function getNodePath(node) {
    if (!node || node === document.body) {
        return '';
    }

    const pathSteps = [];
    let current = node;

    while (current && current !== document.body) {
        if (current.nodeType === Node.TEXT_NODE) {
            const parent = current.parentNode;
            if (parent) {
                const textNodes = Array.from(parent.childNodes).filter(
                    n => n.nodeType === Node.TEXT_NODE
                );
                const index = textNodes.indexOf(current);
                pathSteps.unshift(`text[${index}]`);
                current = parent;
            }
        } else if (current.nodeType === Node.ELEMENT_NODE) {
            const parent = current.parentNode;
            if (parent) {
                const siblings = Array.from(parent.children);
                const index = siblings.indexOf(current);
                pathSteps.unshift(`${current.tagName.toLowerCase()}[${index}]`);
            }
            current = current.parentNode;
        } else {
            break;
        }
    }

    return pathSteps.join('/');
}

/**
 * 從字符串路徑解析為路徑對象數組
 */
function parsePathFromString(pathString) {
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
        if (!step) continue;

        const match = step.match(/^(\w+)\[(\d+)\]$/);
        if (!match) {
            return null;
        }

        const [, tag, indexStr] = match;
        const index = parseInt(indexStr, 10);

        if (tag === 'text') {
            path.push({ type: 'text', index });
        } else {
            path.push({ type: 'element', tag, index });
        }
    }

    return path;
}

/**
 * 根據路徑對象數組獲取 DOM 節點
 */
function getNodeByPath(path) {
    if (typeof path === 'string') {
        path = parsePathFromString(path);
        if (!path) {
            return null;
        }
    }

    if (!document || !document.body) {
        return null;
    }

    if (!path || path.length === 0) {
        return document.body;
    }

    let current = document.body;

    for (const step of path) {
        try {
            if (step.type === 'element') {
                if (!current || !current.children) {
                    return null;
                }

                const children = Array.from(current.children);

                if (step.index < 0 || step.index >= children.length) {
                    const matchingElements = children.filter(child =>
                        child.tagName && child.tagName.toLowerCase() === step.tag
                    );
                    if (matchingElements.length > 0) {
                        current = matchingElements[0];
                        continue;
                    }
                    return null;
                }

                current = children[step.index];
            } else if (step.type === 'text') {
                if (!current || !current.childNodes) {
                    return null;
                }

                const textNodes = Array.from(current.childNodes).filter(
                    n => n.nodeType === Node.TEXT_NODE
                );

                if (step.index < 0 || step.index >= textNodes.length) {
                    return null;
                }

                current = textNodes[step.index];
            }
        } catch (_error) {
            return null;
        }
    }

    return current;
}

/**
 * 驗證路徑字符串格式是否正確
 */
function isValidPathString(pathString) {
    if (typeof pathString !== 'string') {
        return false;
    }

    if (pathString.trim() === '') {
        return true;
    }

    const steps = pathString.split('/');
    const regex = /^\w+\[\d+\]$/;

    for (const step of steps) {
        if (!step || !regex.test(step)) {
            return false;
        }
    }

    return true;
}

// CommonJS exports for testing
if (typeof module !== 'undefined') {
    module.exports = {
        getNodePath,
        parsePathFromString,
        getNodeByPath,
        isValidPathString
    };
}
