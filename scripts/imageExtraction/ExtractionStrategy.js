/**
 * 圖片提取策略接口
 * 定義所有圖片提取策略必須實現的方法
 */
class ExtractionStrategy {
    /**
     * 提取圖片 URL
     * 抽象方法，由子類實現並可能使用實例狀態
     * @param {HTMLImageElement} imgNode - 圖片元素
     * @returns {string|null} 提取到的圖片 URL，如果無法提取則返回 null
     */
    // skipcq: JS-0105 - 抽象方法，子類實現時會使用 this
    extract(imgNode) {
        // 參數驗證
        if (!imgNode) {
            throw new Error('imgNode parameter is required');
        }
        throw new Error('ExtractionStrategy.extract() must be implemented by subclass');
    }

    /**
     * 獲取策略名稱
     * @returns {string} 策略名稱
     */
    getName() {
        throw new Error('ExtractionStrategy.getName() must be implemented by subclass');
    }

    /**
     * 獲取策略優先級（數字越小優先級越高）
     * @returns {number} 優先級
     */
    getPriority() {
        return 100; // 默認優先級
    }

    /**
     * 檢查策略是否適用於給定的元素
     * @param {HTMLImageElement} imgNode - 圖片元素
     * @returns {boolean} 是否適用
     */
    isApplicable(imgNode) {
        return imgNode && imgNode.nodeType === Node.ELEMENT_NODE;
    }

    /**
     * 驗證提取到的 URL 是否有效
     * @protected
     * @param {string} url - 要驗證的 URL
     * @returns {boolean} URL 是否有效
     */
    _isValidUrl(url) {
        if (!url || typeof url !== 'string') return false;
        if (url.startsWith('data:') || url.startsWith('blob:')) return false;

        try {
            if (typeof URL !== 'undefined' && typeof URL.canParse === 'function') {
                return URL.canParse(url);
            }
            const parsedUrl = new URL(url);
            return Boolean(parsedUrl);
        } catch {
            return false;
        }
    }

    /**
     * 清理和標準化 URL
     * @protected
     * @param {string} url - 要清理的 URL
     * @returns {string|null} 清理後的 URL
     */
    _cleanUrl(url) {
        if (!url || typeof url !== 'string') return null;

        const trimmed = url.trim();
        if (!trimmed) return null;

        // 移除引號
        return trimmed.replace(/^["']|["']$/g, '');
    }
}

/**
 * 提取結果類
 * 包含提取到的 URL 和相關元數據
 */
class ExtractionResult {
    /**
     * 創建提取結果
     * @param {string} url - 提取到的 URL
     * @param {string} source - 提取來源
     * @param {number} confidence - 置信度 (0-1)
     * @param {Object} metadata - 額外的元數據
     */
    constructor(url, source, confidence = 1.0, metadata = {}) {
        this.url = url;
        this.source = source;
        this.confidence = confidence;
        this.metadata = {
            timestamp: Date.now(),
            ...metadata
        };
    }

    /**
     * 檢查結果是否有效
     * @returns {boolean} 結果是否有效
     */
    isValid() {
        return this.url && typeof this.url === 'string' && this.confidence > 0;
    }

    /**
     * 轉換為簡單的字符串
     * @returns {string} URL 字符串
     */
    toString() {
        return this.url;
    }

    /**
     * 轉換為 JSON 對象
     * @returns {Object} JSON 表示
     */
    toJSON() {
        return {
            url: this.url,
            source: this.source,
            confidence: this.confidence,
            metadata: this.metadata
        };
    }
}

// 導出類
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ExtractionStrategy, ExtractionResult };
} else if (typeof window !== 'undefined') {
    window.ExtractionStrategy = ExtractionStrategy;
    window.ExtractionResult = ExtractionResult;
}
