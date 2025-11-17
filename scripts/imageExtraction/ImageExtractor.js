let cachedFallbackStrategies = null;
let cachedAttributeExtractor = null;
let cachedSrcsetParser = null;
let attemptedRequireFallback = false;
let attemptedRequireAttribute = false;
let attemptedRequireSrcset = false;

/**
 * 解析回退策略：優先 CommonJS，其次回退全域，確保不同環境皆可使用
 * @returns {Object|null}
 */
function resolveFallbackStrategies() {
    if (cachedFallbackStrategies) {
        return cachedFallbackStrategies;
    }

    if (typeof module !== 'undefined' && module.exports && !attemptedRequireFallback) {
        attemptedRequireFallback = true;
        try {
            const requiredStrategies = require('./FallbackStrategies');
            if (requiredStrategies) {
                cachedFallbackStrategies = requiredStrategies;
                return cachedFallbackStrategies;
            }
        } catch {
            // 忽略 require 失敗，稍後改用全域檢索
        }
    }

    const globalScope = typeof globalThis !== 'undefined'
        ? globalThis
        : (typeof window !== 'undefined'
            ? window
            : (typeof global !== 'undefined' ? global : undefined));

    const fallbackStrategies = globalScope?.FallbackStrategies;
    if (fallbackStrategies) {
        cachedFallbackStrategies = fallbackStrategies;
        return cachedFallbackStrategies;
    }

    return null;
}

/**
 * 解析 AttributeExtractor：優先 CommonJS，其次回退到已載入的全域實例
 * @returns {Object|null}
 */
function resolveAttributeExtractor() {
    if (cachedAttributeExtractor) {
        return cachedAttributeExtractor;
    }

    if (typeof module !== 'undefined' && module.exports && !attemptedRequireAttribute) {
        attemptedRequireAttribute = true;
        try {
            const requiredExtractor = require('./AttributeExtractor');
            if (requiredExtractor) {
                cachedAttributeExtractor = requiredExtractor;
                return cachedAttributeExtractor;
            }
        } catch {
            // 忽略 require 失敗，稍後改用全域檢索
        }
    }

    const globalScope = typeof globalThis !== 'undefined'
        ? globalThis
        : (typeof window !== 'undefined'
            ? window
            : (typeof global !== 'undefined' ? global : undefined));

    const attributeExtractorFromGlobal = globalScope?.AttributeExtractor;
    if (attributeExtractorFromGlobal) {
        cachedAttributeExtractor = attributeExtractorFromGlobal;
        return cachedAttributeExtractor;
    }

    return null;
}

/**
 * 解析 SrcsetParser：優先 CommonJS，其次回退到全域實例
 * @returns {Object|null}
 */
function resolveSrcsetParser() {
    if (cachedSrcsetParser) {
        return cachedSrcsetParser;
    }

    if (typeof module !== 'undefined' && module.exports && !attemptedRequireSrcset) {
        attemptedRequireSrcset = true;
        try {
            const requiredParser = require('./SrcsetParser');
            if (requiredParser) {
                cachedSrcsetParser = requiredParser;
                return cachedSrcsetParser;
            }
        } catch {
            // 忽略 require 失敗，稍後改用全域檢索
        }
    }

    const globalScope = typeof globalThis !== 'undefined'
        ? globalThis
        : (typeof window !== 'undefined'
            ? window
            : (typeof global !== 'undefined' ? global : undefined));

    const srcsetParserFromGlobal = globalScope?.SrcsetParser;
    if (srcsetParserFromGlobal) {
        cachedSrcsetParser = srcsetParserFromGlobal;
        return cachedSrcsetParser;
    }

    return null;
}

/**
 * 圖片提取器 - 主要的圖片 URL 提取類
 * 使用策略模式處理不同的圖片提取方法
 */
class ImageExtractor {
    /**
     * 創建圖片提取器實例
     * @param {Object} options - 配置選項
     * @param {number} options.maxRetries - 最大重試次數
     * @param {boolean} options.enableFallbacks - 是否啟用回退策略
     * @param {boolean} options.enableCache - 是否啟用緩存
     */
    constructor(options = {}) {
        this.options = {
            maxRetries: 3,
            enableFallbacks: true,
            enableCache: false,
            ...options
        };

        // 初始化策略
        this.strategies = [];
        this.cache = new Map();
        this._resolvedFallbackStrategies = null;
    }

    /**
     * 主要的圖片 URL 提取方法
     * @param {HTMLImageElement} imgNode - 圖片元素
     * @returns {string|null} 提取到的圖片 URL
     */
    extractImageSrc(imgNode) {
        if (!imgNode || !imgNode.nodeType) {
            return null;
        }

        // 檢查緩存
        if (this.options.enableCache) {
            const cacheKey = this._generateCacheKey(imgNode);
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }
        }

        // 嘗試各種提取策略
        const result = this._tryExtractionStrategies(imgNode);

        // 緩存結果
        if (this.options.enableCache && result) {
            const cacheKey = this._generateCacheKey(imgNode);
            this.cache.set(cacheKey, result);
        }

        return result;
    }

    /**
     * 嘗試所有提取策略
     * @private
     * @param {HTMLImageElement} imgNode - 圖片元素
     * @returns {string|null} 提取到的圖片 URL
     */
    _tryExtractionStrategies(imgNode) {
        // 策略執行順序：srcset > 屬性 > 背景圖 > picture > noscript
        const strategies = [
            this._extractFromSrcset.bind(this),
            this._extractFromAttributes.bind(this),
            this._extractFromBackground.bind(this),
            this._extractFromPicture.bind(this),
            this._extractFromNoscript.bind(this)
        ];

        for (const strategy of strategies) {
            try {
                const result = strategy(imgNode);
                if (result && this._isValidUrl(result)) {
                    return result;
                }
            } catch (error) {
                // 策略失敗時繼續嘗試下一個
                console.warn('Image extraction strategy failed:', error.message);
            }
        }

        return null;
    }

    /**
     * 從 srcset 屬性提取圖片 URL
     * @private
     * @param {HTMLImageElement} imgNode - 圖片元素
     * @returns {string|null} 提取到的圖片 URL
     */
    _extractFromSrcset(imgNode) {
        const srcset = imgNode.getAttribute('srcset') ||
                      imgNode.getAttribute('data-srcset') ||
                      imgNode.getAttribute('data-lazy-srcset');

        if (!srcset) return null;

        // 使用 SrcsetParser 解析
        const srcsetParser = resolveSrcsetParser();
        if (srcsetParser && typeof srcsetParser.parse === 'function') {
            const parsedUrl = srcsetParser.parse(srcset);
            if (parsedUrl && this._isValidUrl(parsedUrl)) {
                return parsedUrl;
            }
        }

        // 回退到簡單解析
        const entries = srcset.split(',').map(entry => entry.trim());
        if (entries.length > 0) {
            const url = entries[entries.length - 1].split(' ')[0];
            return this._isValidUrl(url) ? url : null;
        }

        return null;
    }

    /**
     * 從各種屬性提取圖片 URL
     * @private
     * @param {HTMLImageElement} imgNode - 圖片元素
     * @returns {string|null} 提取到的圖片 URL
     */
    _extractFromAttributes(imgNode) {
        // 使用 AttributeExtractor 提取
        const attributeExtractor = resolveAttributeExtractor();
        if (attributeExtractor && typeof attributeExtractor.extract === 'function') {
            return attributeExtractor.extract(imgNode);
        }

        // 回退到基本屬性檢查（必須驗證 URL）
        const basicAttrs = ['src', 'data-src', 'data-lazy-src', 'data-original'];
        for (const attr of basicAttrs) {
            if (imgNode.hasAttribute(attr)) {
                const value = imgNode.getAttribute(attr);
                const trimmedValue = value?.trim();
                if (trimmedValue && this._isValidUrl(trimmedValue)) {
                    return trimmedValue;
                }
            }
        }

        return null;
    }

    /**
     * 從背景圖片提取 URL
     * @private
     * @param {HTMLImageElement} imgNode - 圖片元素
     * @returns {string|null} 提取到的圖片 URL
     */
    _extractFromBackground(imgNode) {
        const fallbackStrategies = this._getFallbackStrategies();
        if (!fallbackStrategies) {
            return null;
        }

        return fallbackStrategies.extractFromBackground(imgNode);
    }

    /**
     * 從 picture 元素提取圖片 URL
     * @private
     * @param {HTMLImageElement} imgNode - 圖片元素
     * @returns {string|null} 提取到的圖片 URL
     */
    _extractFromPicture(imgNode) {
        const fallbackStrategies = this._getFallbackStrategies();
        if (!fallbackStrategies) {
            return null;
        }

        return fallbackStrategies.extractFromPicture(imgNode);
    }

    /**
     * 從 noscript 元素提取圖片 URL
     * @private
     * @param {HTMLImageElement} imgNode - 圖片元素
     * @returns {string|null} 提取到的圖片 URL
     */
    _extractFromNoscript(imgNode) {
        const fallbackStrategies = this._getFallbackStrategies();
        if (!fallbackStrategies) {
            return null;
        }

        return fallbackStrategies.extractFromNoscript(imgNode);
    }

    /**
     * 取得回退策略實作，允許依環境自動解析
     * @private
     * @returns {Object|null} FallbackStrategies 實例
     */
    _getFallbackStrategies() {
        if (!this.options.enableFallbacks) {
            return null;
        }

        if (this._resolvedFallbackStrategies) {
            return this._resolvedFallbackStrategies;
        }

        const resolved = resolveFallbackStrategies();
        if (resolved) {
            this._resolvedFallbackStrategies = resolved;
        }

        return resolved;
    }

    /**
     * 驗證 URL 是否有效
     * @private
     * @param {string} url - 要驗證的 URL
     * @returns {boolean} URL 是否有效
     */
    _isValidUrl(url) {
        if (!url || typeof url !== 'string') return false;
        if (url.startsWith('data:') || url.startsWith('blob:')) return false;

        try {
            const parsedUrl = new URL(url);
            // 僅接受 http/https 協定，避免非網路資源造成無效下載
            return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
        } catch {
            return false;
        }
    }

    /**
     * 生成緩存鍵
     * @private
     * @param {HTMLImageElement} imgNode - 圖片元素
     * @returns {string} 緩存鍵
     */
    _generateCacheKey(imgNode) {
        // 使用元素的關鍵屬性生成唯一鍵
        const src = imgNode.getAttribute('src') || '';
        const dataSrc = imgNode.getAttribute('data-src') || '';
        const srcset = imgNode.getAttribute('srcset') || '';

        return `${src}|${dataSrc}|${srcset}`.substring(0, 100);
    }

    /**
     * 清理緩存
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * 獲取緩存統計信息
     * @returns {Object} 緩存統計
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            enabled: this.options.enableCache
        };
    }
}

// 導出類（支持不同的模組系統）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageExtractor;
} else if (typeof window !== 'undefined') {
    window.ImageExtractor = ImageExtractor;
}
