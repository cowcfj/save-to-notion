// Background.js 純函數的可測試版本
// 這些函數從 scripts/background.js 複製，用於單元測試

/**
 * 清理和標準化圖片 URL
 */
function cleanImageUrl(url) {
    if (!url || typeof url !== 'string') return null;

    try {
        const urlObj = new URL(url);

        // 處理代理 URL（如 pgw.udn.com.tw/gw/photo.php）
        if (urlObj.pathname.includes('/photo.php') || urlObj.pathname.includes('/gw/')) {
            const uParam = urlObj.searchParams.get('u');
            if (uParam && /^https?:\/\//.test(uParam)) {
                // 使用代理中的原始圖片 URL
                return cleanImageUrl(uParam);
            }
        }

        // 移除重複的查詢參數
        const params = new URLSearchParams();
        for (const [key, value] of urlObj.searchParams.entries()) {
            if (!params.has(key)) {
                params.set(key, value);
            }
        }
        urlObj.search = params.toString();

        return urlObj.href;
    } catch {
        return null;
    }
}

/**
 * 檢查 URL 是否為有效的圖片格式
 */
function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;

    // 先清理 URL
    const cleanedUrl = cleanImageUrl(url);
    if (!cleanedUrl) return false;

    // 檢查是否為有效的 HTTP/HTTPS URL
    if (!/^https?:\/\//i.test(cleanedUrl)) return false;

    // 檢查 URL 長度（Notion 有限制）
    if (cleanedUrl.length > 2000) return false;

    // 檢查常見的圖片文件擴展名
    const imageExtensions = /\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif)(?:\?.*)?$/i;

    // 如果 URL 包含圖片擴展名，直接返回 true
    if (imageExtensions.test(cleanedUrl)) return true;

    // 對於沒有明確擴展名的 URL（如 CDN 圖片），檢查是否包含圖片相關的路徑
    const imagePathPatterns = [
        /\/image[s]?\//i,
        /\/img[s]?\//i,
        /\/photo[s]?\//i,
        /\/picture[s]?\//i,
        /\/media\//i,
        /\/upload[s]?\//i,
        /\/asset[s]?\//i,
        /\/file[s]?\//i
    ];

    // 排除明顯不是圖片的 URL
    const excludePatterns = [
        /\.(js|css|html|htm|php|asp|jsp)(\?|$)/i,
        /\/api\//i,
        /\/ajax\//i,
        /\/callback/i
    ];

    if (excludePatterns.some(pattern => pattern.test(cleanedUrl))) {
        return false;
    }

    return imagePathPatterns.some(pattern => pattern.test(cleanedUrl));
}

/**
 * 將長文本分割成符合 Notion 限制的片段
 * Notion API 限制每個 rich_text 區塊最多 2000 字符
 */
function splitTextForHighlight(text, maxLength = 2000) {
    if (!text || text.length <= maxLength) {
        return [text];
    }

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }

        // 嘗試在句號、問號、驚嘆號、換行符處分割
        let splitIndex = -1;
        const punctuation = ['\n\n', '\n', '。', '.', '？', '?', '！', '!'];

        for (const punct of punctuation) {
            const lastIndex = remaining.lastIndexOf(punct, maxLength);
            if (lastIndex > maxLength * 0.5) { // 至少分割到一半以上，避免片段太短
                splitIndex = lastIndex + punct.length;
                break;
            }
        }

        // 如果找不到合適的標點，嘗試在空格處分割
        if (splitIndex === -1) {
            splitIndex = remaining.lastIndexOf(' ', maxLength);
            if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
                // 實在找不到，強制在 maxLength 處分割
                splitIndex = maxLength;
            }
        }

        chunks.push(remaining.substring(0, splitIndex).trim());
        remaining = remaining.substring(splitIndex).trim();
    }

    return chunks.filter(chunk => chunk.length > 0); // 過濾空字符串
}

/**
 * Normalizes URLs for consistent keys and deduplication
 */
function normalizeUrl(rawUrl) {
    try {
        const u = new URL(rawUrl);
        // Drop fragment
        u.hash = '';
        // Remove common tracking params
        const trackingParams = [
            'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
            'gclid','fbclid','mc_cid','mc_eid','igshid','vero_id'
        ];
        trackingParams.forEach((p) => u.searchParams.delete(p));
        // Normalize trailing slash (keep root "/")
        if (u.pathname !== '/' && u.pathname.endsWith('/')) {
            u.pathname = u.pathname.replace(/\/+$/, '');
        }
        return u.toString();
    } catch {
        return rawUrl || '';
    }
}

/**
 * 將數組分割成固定大小的批次
 * @param {Array} items - 要分割的數組
 * @param {number} batchSize - 每批的大小
 * @returns {Array<Array>} 分割後的批次數組
 */
function splitIntoBatches(items, batchSize = 100) {
    if (!Array.isArray(items)) {
        return [];
    }

    if (batchSize <= 0) {
        return items.length > 0 ? [items] : [];
    }

    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }

    return batches;
}

/**
 * 計算批次處理的統計信息
 * @param {number} totalItems - 項目總數
 * @param {number} batchSize - 每批大小
 * @param {number} startIndex - 開始索引
 * @returns {Object} 批次統計信息
 */
function calculateBatchStats(totalItems, batchSize = 100, startIndex = 0) {
    if (typeof totalItems !== 'number' || typeof batchSize !== 'number' || typeof startIndex !== 'number') {
        return null;
    }

    if (totalItems < 0 || batchSize <= 0 || startIndex < 0 || startIndex > totalItems) {
        return null;
    }

    const remainingItems = totalItems - startIndex;
    const totalBatches = Math.ceil(remainingItems / batchSize);

    return {
        totalItems,
        remainingItems,
        batchSize,
        startIndex,
        totalBatches,
        lastBatchSize: remainingItems % batchSize || batchSize
    };
}

/**
 * 創建 Notion 富文本對象
 * @param {string} content - 文本內容
 * @param {Object} annotations - 文本標註
 * @returns {Object} Notion 富文本對象
 */
function createNotionRichText(content, annotations = {}) {
    if (typeof content !== 'string') {
        return null;
    }

    const richText = {
        type: 'text',
        text: { content }
    };

    // 只在有標註時添加 annotations 字段
    if (annotations && Object.keys(annotations).length > 0) {
        richText.annotations = { ...annotations };
    }

    return richText;
}

/**
 * 創建 Notion 段落區塊
 * @param {string|Array<Object>} content - 文本內容或富文本數組
 * @param {Object} annotations - 文本標註（當 content 為字符串時使用）
 * @returns {Object} Notion 段落區塊
 */
function createNotionParagraph(content, annotations = {}) {
    if (!content) {
        return null;
    }

    let richTextArray;

    if (typeof content === 'string') {
        // 字符串：創建富文本對象
        const richText = createNotionRichText(content, annotations);
        if (!richText) return null;
        richTextArray = [richText];
    } else if (Array.isArray(content)) {
        // 已經是富文本數組
        richTextArray = content;
    } else {
        return null;
    }

    return {
        object: 'block',
        type: 'paragraph',
        paragraph: {
            rich_text: richTextArray
        }
    };
}

/**
 * 創建 Notion 標題區塊
 * @param {string} content - 標題文本
 * @param {number} level - 標題級別（1-3）
 * @returns {Object} Notion 標題區塊
 */
function createNotionHeading(content, level = 1) {
    if (typeof content !== 'string' || !content) {
        return null;
    }

    if (![1, 2, 3].includes(level)) {
        return null;
    }

    const headingType = `heading_${level}`;

    return {
        object: 'block',
        type: headingType,
        [headingType]: {
            rich_text: [{
                type: 'text',
                text: { content }
            }]
        }
    };
}

/**
 * 創建 Notion 圖片區塊
 * @param {string} url - 圖片 URL
 * @returns {Object} Notion 圖片區塊
 */
function createNotionImage(url) {
    if (typeof url !== 'string' || !url) {
        return null;
    }

    // 基本 URL 驗證
    if (!/^https?:\/\//i.test(url)) {
        return null;
    }

    return {
        object: 'block',
        type: 'image',
        image: {
            type: 'external',
            external: { url }
        }
    };
}

/**
 * 驗證 Notion 區塊結構
 * @param {Object} block - Notion 區塊對象
 * @returns {boolean} 是否為有效的 Notion 區塊
 */
function isValidNotionBlock(block) {
    if (!block || typeof block !== 'object') {
        return false;
    }

    // 必須有 object 和 type 字段
    if (block.object !== 'block' || !block.type) {
        return false;
    }

    // 驗證類型字段名稱的有效性
    const typeFieldName = block.type;
    if (typeof typeFieldName !== 'string' || !typeFieldName) {
        return false;
    }

    // 必須有對應類型的內容字段
    if (!block[typeFieldName]) {
        return false;
    }

    return true;
}

/**
 * 判斷 HTTP 響應狀態碼是否表示成功
 * @param {number} statusCode - HTTP 狀態碼
 * @returns {boolean} 是否成功
 */
function isSuccessStatusCode(statusCode) {
    if (typeof statusCode !== 'number') {
        return false;
    }

    return statusCode >= 200 && statusCode < 300;
}

/**
 * 判斷是否為重定向狀態碼
 * @param {number} statusCode - HTTP 狀態碼
 * @returns {boolean} 是否為重定向
 */
function isRedirectStatusCode(statusCode) {
    if (typeof statusCode !== 'number') {
        return false;
    }

    return statusCode >= 300 && statusCode < 400;
}

/**
 * 判斷是否為客戶端錯誤狀態碼
 * @param {number} statusCode - HTTP 狀態碼
 * @returns {boolean} 是否為客戶端錯誤
 */
function isClientErrorStatusCode(statusCode) {
    if (typeof statusCode !== 'number') {
        return false;
    }

    return statusCode >= 400 && statusCode < 500;
}

/**
 * 判斷是否為服務器錯誤狀態碼
 * @param {number} statusCode - HTTP 狀態碼
 * @returns {boolean} 是否為服務器錯誤
 */
function isServerErrorStatusCode(statusCode) {
    if (typeof statusCode !== 'number') {
        return false;
    }

    return statusCode >= 500 && statusCode < 600;
}

/**
 * 獲取狀態碼的類別描述
 * @param {number} statusCode - HTTP 狀態碼
 * @returns {string|null} 狀態碼類別
 */
function getStatusCodeCategory(statusCode) {
    if (typeof statusCode !== 'number') {
        return null;
    }

    if (statusCode >= 200 && statusCode < 300) return 'success';
    if (statusCode >= 300 && statusCode < 400) return 'redirect';
    if (statusCode >= 400 && statusCode < 500) return 'client_error';
    if (statusCode >= 500 && statusCode < 600) return 'server_error';
    if (statusCode >= 100 && statusCode < 200) return 'informational';

    return 'unknown';
}

/**
 * 截斷文本到指定長度，添加省略號
 * @param {string} text - 要截斷的文本
 * @param {number} maxLength - 最大長度
 * @param {string} ellipsis - 省略號字符串
 * @returns {string} 截斷後的文本
 */
function truncateText(text, maxLength = 100, ellipsis = '...') {
    if (typeof text !== 'string') {
        return '';
    }

    if (maxLength <= 0) {
        return '';
    }

    if (text.length <= maxLength) {
        return text;
    }

    const ellipsisLength = ellipsis.length;
    const truncateAt = Math.max(0, maxLength - ellipsisLength);

    return text.substring(0, truncateAt) + ellipsis;
}

/**
 * 安全地解析 JSON，失敗時返回默認值
 * @param {string} jsonString - JSON 字符串
 * @param {*} defaultValue - 默認值
 * @returns {*} 解析結果或默認值
 */
function safeJsonParse(jsonString, defaultValue = null) {
    if (typeof jsonString !== 'string') {
        return defaultValue;
    }

    try {
        return JSON.parse(jsonString);
    } catch {
        return defaultValue;
    }
}

/**
 * 安全的 JSON 序列化
 * @param {*} obj - 要序列化的對象
 * @param {number|string} space - 縮進空格數或字符串
 * @returns {string|null} - JSON 字符串，失敗或 undefined 返回 null
 */
function safeJsonStringify(obj, space) {
    if (obj === undefined) {
        return null;
    }

    try {
        const result = JSON.stringify(obj, null, space);
        // JSON.stringify 對某些值會返回 undefined
        return result === undefined ? null : result;
    } catch {
        return null;
    }
}

module.exports = {
    cleanImageUrl,
    isValidImageUrl,
    splitTextForHighlight,
    normalizeUrl,
    splitIntoBatches,
    calculateBatchStats,
    createNotionRichText,
    createNotionParagraph,
    createNotionHeading,
    createNotionImage,
    isValidNotionBlock,
    isSuccessStatusCode,
    isRedirectStatusCode,
    isClientErrorStatusCode,
    isServerErrorStatusCode,
    getStatusCodeCategory,
    truncateText,
    safeJsonParse,
    safeJsonStringify
};
