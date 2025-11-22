/**
 * 驗證工具模組（Testable 版本）
 * 提供數據驗證相關的工具函式
 * 
 * 此檔案為測試版本，使用 CommonJS 格式
 * 源檔案：scripts/highlighter/utils/validation.js (ES6 模組)
 */

/**
 * 檢查字串是否非空
 */
function isNonEmptyString(str) {
    return typeof str === 'string' && str.trim().length > 0;
}

/**
 * 檢查值是否為有效的 Range 對象
 */
function isValidRange(range) {
    return range !== null &&
        range !== undefined &&
        typeof range === 'object' &&
        'startContainer' in range &&
        'endContainer' in range &&
        typeof range.cloneRange === 'function';
}

/**
 * 檢查 Range 是否已折疊（空選取）
 */
function isCollapsedRange(range) {
    if (!isValidRange(range)) {
        return true;
    }
    return range.collapsed === true;
}

/**
 * 檢查顏色名稱是否有效
 */
function isValidColor(color) {
    const validColors = ['yellow', 'green', 'blue', 'red'];
    return validColors.includes(color);
}

/**
 * 檢查 URL 是否有效
 */
function isValidUrl(url) {
    if (!isNonEmptyString(url)) {
        return false;
    }

    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * 檢查標註 ID 是否有效
 */
function isValidHighlightId(id) {
    return isNonEmptyString(id) && /^h\d+$/.test(id);
}

/**
 * 驗證標註數據對象
 */
function isValidHighlightData(data) {
    if (!data || typeof data !== 'object') {
        return false;
    }

    return isValidHighlightId(data.id) &&
        isNonEmptyString(data.text) &&
        isValidColor(data.color);
}

// CommonJS exports for testing
if (typeof module !== 'undefined') {
    module.exports = {
        isNonEmptyString,
        isValidRange,
        isCollapsedRange,
        isValidColor,
        isValidUrl,
        isValidHighlightId,
        isValidHighlightData
    };
}
