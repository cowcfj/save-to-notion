/**
 * 屬性提取器
 * 專門處理各種圖片屬性的提取，包括懶加載和響應式圖片屬性
 *
 * @requires ImageUtils - 圖片工具庫（可選，用於統一驗證邏輯）
 */

/* global ImageUtils */

class AttributeExtractor {
    /**
     * 圖片屬性優先級列表
     * 按照常見程度和可靠性排序
     */
    static get IMAGE_ATTRIBUTES() {
        return [
            // 標準屬性
            'src',

            // 常見的懶加載屬性
            'data-src',
            'data-lazy-src',
            'data-original',
            'data-original-src',

            // 響應式圖片屬性
            'data-srcset',
            'data-lazy-srcset',

            // 擴展的懶加載屬性
            'data-actualsrc',
            'data-src-original',
            'data-echo',
            'data-href',
            'data-large',
            'data-bigsrc',
            'data-full-src',
            'data-hi-res-src',
            'data-large-src',
            'data-zoom-src',
            'data-image-src',
            'data-img-src',
            'data-real-src',
            'data-lazy',
            'data-url',
            'data-image',
            'data-img',
            'data-fallback-src',
            'data-origin'
        ];
    }

    /**
     * 從圖片元素提取 URL
     * @param {HTMLImageElement} imgNode - 圖片元素
     * @param {Object} options - 提取選項
     * @param {Array} options.customAttributes - 自定義屬性列表
     * @param {boolean} options.includeEmpty - 是否包含空值
     * @returns {string|null} 提取到的 URL
     */
    static extract(imgNode, options = {}) {
        if (!imgNode || !imgNode.hasAttribute) {
            return null;
        }

        const attributes = options.customAttributes || this.IMAGE_ATTRIBUTES;

        // 按優先級檢查各種屬性
        for (const attr of attributes) {
            if (imgNode.hasAttribute(attr)) {
                const value = imgNode.getAttribute(attr);
                const cleanedValue = this._cleanAttributeValue(value);

                if (cleanedValue && this._isValidImageUrl(cleanedValue)) {
                    return cleanedValue;
                }
            }
        }

        return null;
    }

    /**
     * 提取所有可用的圖片 URL
     * @param {HTMLImageElement} imgNode - 圖片元素
     * @returns {Array} 所有找到的 URL 數組
     */
    static extractAll(imgNode) {
        if (!imgNode || !imgNode.hasAttribute) {
            return [];
        }

        const urls = [];
        const seenUrls = new Set();

        for (const attr of this.IMAGE_ATTRIBUTES) {
            if (imgNode.hasAttribute(attr)) {
                const value = imgNode.getAttribute(attr);
                const cleanedValue = this._cleanAttributeValue(value);

                if (cleanedValue &&
                    this._isValidImageUrl(cleanedValue) &&
                    !seenUrls.has(cleanedValue)) {

                    urls.push({
                        url: cleanedValue,
                        attribute: attr,
                        priority: this.IMAGE_ATTRIBUTES.indexOf(attr)
                    });
                    seenUrls.add(cleanedValue);
                }
            }
        }

        // 按優先級排序
        return urls.sort((a, b) => a.priority - b.priority);
    }

    /**
     * 檢查元素是否有任何圖片屬性
     * @param {HTMLImageElement} imgNode - 圖片元素
     * @returns {boolean} 是否有圖片屬性
     */
    static hasImageAttributes(imgNode) {
        if (!imgNode || !imgNode.hasAttribute) {
            return false;
        }

        return this.IMAGE_ATTRIBUTES.some(attr =>
            imgNode.hasAttribute(attr) &&
            this._cleanAttributeValue(imgNode.getAttribute(attr))
        );
    }

    /**
     * 獲取屬性統計信息
     * @param {HTMLImageElement} imgNode - 圖片元素
     * @returns {Object} 屬性統計
     */
    static getAttributeStats(imgNode) {
        if (!imgNode || !imgNode.hasAttribute) {
            return {
                totalAttributes: 0,
                validUrls: 0,
                attributes: []
            };
        }

        const stats = {
            totalAttributes: 0,
            validUrls: 0,
            attributes: []
        };

        for (const attr of this.IMAGE_ATTRIBUTES) {
            if (imgNode.hasAttribute(attr)) {
                const value = imgNode.getAttribute(attr);
                const cleanedValue = this._cleanAttributeValue(value);
                const isValid = cleanedValue && this._isValidImageUrl(cleanedValue);

                stats.totalAttributes++;
                if (isValid) {
                    stats.validUrls++;
                }

                stats.attributes.push({
                    name: attr,
                    value,
                    cleanedValue,
                    isValid
                });
            }
        }

        return stats;
    }

    /**
     * 清理屬性值
     * @private
     * @param {string} value - 原始屬性值
     * @returns {string|null} 清理後的值
     */
    static _cleanAttributeValue(value) {
        if (!value || typeof value !== 'string') {
            return null;
        }

        // 移除首尾空白
        let cleaned = value.trim();
        if (!cleaned) {
            return null;
        }

        // 移除引號
        cleaned = cleaned.replace(/^["']|["']$/g, '');

        // 再次檢查是否為空
        if (!cleaned) {
            return null;
        }

        return cleaned;
    }

    /**
     * 驗證是否為有效的圖片 URL
     * 使用 imageUtils.js 中的統一實現
     * @private
     * @param {string} url - 要驗證的 URL
     * @returns {boolean} 是否有效
     */
    static _isValidImageUrl(url) {
        // 優先使用 ImageUtils 的統一驗證（如果可用）
        if (typeof ImageUtils !== 'undefined' && ImageUtils.isValidImageUrl) {
            return ImageUtils.isValidImageUrl(url);
        }

        // 回退實現（如果 ImageUtils 未載入）
        if (!url || typeof url !== 'string') {
            return false;
        }

        // 排除 data: 和 blob: URL
        if (url.startsWith('data:') || url.startsWith('blob:')) {
            return false;
        }

        // 排除明顯的佔位符
        const placeholders = [
            'placeholder',
            'loading',
            'spinner',
            'blank',
            'empty',
            '1x1',
            'transparent'
        ];

        const lowerUrl = url.toLowerCase();
        if (placeholders.some(placeholder => lowerUrl.includes(placeholder))) {
            return false;
        }

        // 基本 URL 格式檢查
        try {
            new URL(url);
            return true;
        } catch {
            // 可能是相對 URL
            return url.length > 0 && !url.startsWith('#');
        }
    }

    /**
     * 根據屬性名稱獲取優先級
     * @param {string} attributeName - 屬性名稱
     * @returns {number} 優先級（數字越小優先級越高）
     */
    static getAttributePriority(attributeName) {
        const index = this.IMAGE_ATTRIBUTES.indexOf(attributeName);
        return index === -1 ? 999 : index;
    }

    /**
     * 檢查屬性是否為懶加載屬性
     * @param {string} attributeName - 屬性名稱
     * @returns {boolean} 是否為懶加載屬性
     */
    static isLazyLoadAttribute(attributeName) {
        // 常見的懶加載屬性
        const lazyLoadAttributes = [
            'data-src',
            'data-lazy-src',
            'data-original',
            'data-original-src',
            'data-actualsrc',
            'data-src-original',
            'data-echo',
            'data-href',
            'data-large',
            'data-bigsrc',
            'data-full-src',
            'data-hi-res-src',
            'data-large-src',
            'data-zoom-src',
            'data-image-src',
            'data-img-src',
            'data-real-src',
            'data-lazy',
            'data-url',
            'data-image',
            'data-img',
            'data-fallback-src',
            'data-origin'
        ];

        return lazyLoadAttributes.includes(attributeName);
    }

    /**
     * 檢查屬性是否為響應式圖片屬性
     * @param {string} attributeName - 屬性名稱
     * @returns {boolean} 是否為響應式圖片屬性
     */
    static isResponsiveAttribute(attributeName) {
        return attributeName.includes('srcset') ||
               attributeName === 'sizes';
    }
}

// 導出類
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AttributeExtractor;
} else if (typeof window !== 'undefined') {
    window.AttributeExtractor = AttributeExtractor;
}
