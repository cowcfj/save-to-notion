/**
 * highlighter-v2.js 可測試版本
 * 提取不依賴 DOM 和 Chrome API 的純函數用於單元測試
 */

/**
 * 驗證字串是否有效且非空
 * @param {*} value - 待驗證的值
 * @returns {boolean} 是否為有效的非空字串
 */
function isValidNonEmptyString(value) {
    return Boolean(value && typeof value === 'string' && value.trim());
}

/**
 * 轉換背景顏色到顏色名稱
 * @param {string} bgColor - 背景顏色（hex 或 rgb）
 * @returns {string} 顏色名稱
 */
function convertBgColorToName(bgColor) {
    const colorMap = {
        'rgb(255, 243, 205)': 'yellow',
        '#fff3cd': 'yellow',
        'rgb(212, 237, 218)': 'green',
        '#d4edda': 'green',
        'rgb(204, 231, 255)': 'blue',
        '#cce7ff': 'blue',
        'rgb(248, 215, 218)': 'red',
        '#f8d7da': 'red'
    };

    return colorMap[bgColor] || 'yellow';
}

/**
 * 驗證標註數據格式
 * @param {Object} highlightData - 標註數據
 * @returns {boolean} 是否有效
 */
function validateHighlightData(highlightData) {
    if (!highlightData || typeof highlightData !== 'object') {
        return false;
    }

    // 必須有 text 或 content
    if (!highlightData.text && !highlightData.content) {
        return false;
    }

    // text 不能為空
    const text = highlightData.text || highlightData.content;
    if (!isValidNonEmptyString(text)) {
        return false;
    }

    return true;
}

/**
 * 規範化標註數據格式
 * @param {Object} rawData - 原始數據
 * @returns {Object} 規範化後的數據
 */
function normalizeHighlightData(rawData) {
    if (typeof rawData === 'string') {
        return {
            text: rawData,
            color: 'yellow',
            timestamp: Date.now()
        };
    }

    const normalized = {
        text: rawData.text || rawData.content || '',
        color: 'yellow',
        timestamp: rawData.timestamp || Date.now()
    };

    // 處理顏色
    if (rawData.color) {
        normalized.color = rawData.color;
    } else if (rawData.bgColor || rawData.backgroundColor) {
        normalized.color = convertBgColorToName(rawData.bgColor || rawData.backgroundColor);
    }

    return normalized;
}

/**
 * 生成標註 ID
 * @param {number} nextId - 下一個 ID 編號
 * @returns {string} 標註 ID
 */
function generateHighlightId(nextId) {
    return `highlight-${nextId}`;
}

/**
 * 驗證範圍信息格式
 * @param {Object} rangeInfo - 範圍信息
 * @returns {boolean} 是否有效
 */
function validateRangeInfo(rangeInfo) {
    if (!rangeInfo || typeof rangeInfo !== 'object') {
        return false;
    }

    // 必須包含起始和結束容器路徑
    if (!Array.isArray(rangeInfo.startContainerPath) ||
        !Array.isArray(rangeInfo.endContainerPath)) {
        return false;
    }

    // 必須包含偏移量
    if (typeof rangeInfo.startOffset !== 'number' ||
        typeof rangeInfo.endOffset !== 'number') {
        return false;
    }

    // 偏移量不能為負數
    if (rangeInfo.startOffset < 0 || rangeInfo.endOffset < 0) {
        return false;
    }

    // 必須包含有效的非空文本
    const text = rangeInfo.text;
    if (!isValidNonEmptyString(text)) {
        return false;
    }

    return true;
}

/**
 * 驗證路徑步驟的有效性
 * @param {Object} step - DOM 路徑步驟對象
 * @param {string} step.type - 步驟類型（'element' 或 'text'）
 * @param {number} step.index - 節點索引
 * @param {string} [step.tag] - 元素標籤名（當 type 為 'element' 時必需）
 * @returns {boolean} 步驟是否有效
 */
function validatePathStep(step) {
    // 基本對象檢查
    if (!step || typeof step !== 'object') {
        return false;
    }

    // 必須有類型
    if (!step.type || (step.type !== 'element' && step.type !== 'text')) {
        return false;
    }

    // 必須有索引
    if (typeof step.index !== 'number' || step.index < 0) {
        return false;
    }

    // 元素類型步驟必須有有效的標籤
    if (step.type === 'element') {
        if (!isValidNonEmptyString(step.tag)) {
            return false;
        }
    }

    return true;
}

/**
 * 驗證節點路徑
 * @param {Array} path - 節點路徑
 * @returns {boolean} 是否有效
 */
function validateNodePath(path) {
    if (!Array.isArray(path)) {
        return false;
    }

    // 路徑不能為空
    if (path.length === 0) {
        return false;
    }

    // 每個步驟都必須有效
    return path.every(step => validatePathStep(step));
}

/**
 * 計算遷移成功率
 * @param {number} successCount - 成功數量
 * @param {number} totalCount - 總數量
 * @returns {number} 成功率（0-100）
 */
function calculateMigrationSuccessRate(successCount, totalCount) {
    if (totalCount === 0) {
        return 0;
    }

    return Math.round((successCount / totalCount) * 100);
}

/**
 * 生成遷移報告
 * @param {number} successCount - 成功數量
 * @param {number} failCount - 失敗數量
 * @param {number} totalCount - 總數量
 * @returns {Object} 遷移報告
 */
function generateMigrationReport(successCount, failCount, totalCount) {
    const successRate = calculateMigrationSuccessRate(successCount, totalCount);

    return {
        successCount,
        failCount,
        totalCount,
        successRate,
        status: successRate === 100 ? 'complete' :
                successRate > 50 ? 'partial' :
                successRate > 0 ? 'minimal' : 'failed',
        timestamp: Date.now()
    };
}

/**
 * 清理文本（移除多餘空白）
 * @param {string} text - 原始文本
 * @returns {string} 清理後的文本
 */
function cleanText(text) {
    if (typeof text !== 'string') {
        return '';
    }

    return text.trim().replace(/\s+/g, ' ');
}

/**
 * 比較兩段文本是否相似（容忍空白字符差異）
 * @param {string} text1 - 文本1
 * @param {string} text2 - 文本2
 * @returns {boolean} 是否相似
 */
function isTextSimilar(text1, text2) {
    if (typeof text1 !== 'string' || typeof text2 !== 'string') {
        return false;
    }

    const clean1 = cleanText(text1);
    const clean2 = cleanText(text2);

    return clean1 === clean2;
}

/**
 * 檢查是否為有效的標註顏色
 * @param {string} color - 顏色名稱
 * @returns {boolean} 是否有效
 */
function isValidHighlightColor(color) {
    const validColors = ['yellow', 'green', 'blue', 'red'];
    return validColors.includes(color);
}

/**
 * 格式化時間戳為可讀字符串
 * @param {number} timestamp - 時間戳
 * @returns {string} 格式化後的時間
 */
function formatTimestamp(timestamp) {
    if (typeof timestamp !== 'number' || timestamp <= 0) {
        return 'Invalid Date';
    }

    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
        return 'Invalid Date';
    }

    return date.toISOString();
}

/**
 * 創建存儲鍵名
 * @param {string} url - 頁面 URL
 * @returns {string} 存儲鍵名
 */
function createStorageKey(url) {
    if (!isValidNonEmptyString(url)) {
        return null;
    }

    return `highlights_${url}`;
}

/**
 * 解析存儲鍵名
 * @param {string} key - 存儲鍵名
 * @returns {string|null} URL 或 null
 */
function parseStorageKey(key) {
    if (typeof key !== 'string' || !key.startsWith('highlights_')) {
        return null;
    }

    return key.substring('highlights_'.length);
}

/**
 * 檢查是否為遷移完成標記鍵
 * @param {string} key - 鍵名
 * @returns {boolean} 是否為遷移完成標記
 */
function isMigrationCompletionKey(key) {
    return typeof key === 'string' && key.startsWith('migration_completed_');
}

/**
 * 生成遷移完成鍵名
 * @param {string} url - 頁面 URL
 * @returns {string} 遷移完成鍵名
 */
function createMigrationCompletionKey(url) {
    if (!isValidNonEmptyString(url)) {
        return null;
    }

    return `migration_completed_${url}`;
}

/**
 * 過濾有效的標註數據
 * @param {Array} highlights - 標註數組
 * @returns {Array} 有效的標註數組
 */
function filterValidHighlights(highlights) {
    if (!Array.isArray(highlights)) {
        return [];
    }

    return highlights.filter(h => validateHighlightData(h));
}

/**
 * 統計標註顏色分佈
 * @param {Array} highlights - 標註數組
 * @returns {Object} 顏色分佈統計
 */
function countHighlightsByColor(highlights) {
    if (!Array.isArray(highlights)) {
        return {};
    }

    const counts = {
        yellow: 0,
        green: 0,
        blue: 0,
        red: 0,
        other: 0
    };

    highlights.forEach(h => {
        const color = h.color || 'yellow';
        if (Object.prototype.hasOwnProperty.call(counts, color)) {
            counts[color]++;
        } else {
            counts.other++;
        }
    });

    return counts;
}

// Node.js 環境導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isValidNonEmptyString,
        convertBgColorToName,
        validateHighlightData,
        normalizeHighlightData,
        generateHighlightId,
        validateRangeInfo,
        validatePathStep,
        validateNodePath,
        calculateMigrationSuccessRate,
        generateMigrationReport,
        cleanText,
        isTextSimilar,
        isValidHighlightColor,
        formatTimestamp,
        createStorageKey,
        parseStorageKey,
        isMigrationCompletionKey,
        createMigrationCompletionKey,
        filterValidHighlights,
        countHighlightsByColor
    };
}
