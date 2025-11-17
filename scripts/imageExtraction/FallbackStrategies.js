/**
 * 回退策略類
 * 實現各種圖片提取的回退方法，包括背景圖、picture 元素和 noscript 處理
 */
class FallbackStrategies {
    /**
     * 從背景圖片提取 URL
     * @param {HTMLElement} element - 目標元素
     * @param {Object} options - 提取選項
     * @param {boolean} options.includeParent - 是否檢查父元素
     * @param {number} options.maxParentLevels - 最大父元素檢查層級
     * @returns {string|null} 提取到的背景圖片 URL
     */
    static extractFromBackground(element, options = {}) {
        if (!element) {
            return null;
        }

        const { includeParent = true, maxParentLevels = 2 } = options;

        // 檢查元素本身的背景圖
        const elementBg = this._getBackgroundImageUrl(element);
        if (elementBg) {
            return elementBg;
        }

        // 檢查父元素的背景圖
        if (includeParent) {
            let currentElement = element.parentElement;
            let level = 0;

            while (currentElement && level < maxParentLevels) {
                const parentBg = this._getBackgroundImageUrl(currentElement);
                if (parentBg) {
                    return parentBg;
                }
                
                currentElement = currentElement.parentElement;
                level++;
            }
        }

        return null;
    }

    /**
     * 從 picture 元素提取 URL
     * @param {HTMLImageElement} imgElement - 圖片元素
     * @returns {string|null} 提取到的 URL
     */
    static extractFromPicture(imgElement) {
        if (!imgElement || !imgElement.parentElement) {
            return null;
        }

        const parent = imgElement.parentElement;
        
        // 檢查父元素是否為 picture 元素
        if (parent.nodeName !== 'PICTURE') {
            return null;
        }

        // 獲取所有 source 元素
        const sources = parent.querySelectorAll('source');
        
        for (const source of sources) {
            // 檢查 srcset 屬性
            const srcset = source.getAttribute('srcset') || 
                          source.getAttribute('data-srcset');
            
            if (srcset) {
                const url = this._extractUrlFromSrcset(srcset);
                if (url) {
                    return url;
                }
            }

            // 檢查 src 屬性（雖然不標準，但有些網站會用）
            const src = source.getAttribute('src') || 
                       source.getAttribute('data-src');
            
            if (src && this._isValidUrl(src)) {
                return src;
            }
        }

        return null;
    }

    /**
     * 從 noscript 元素提取 URL
     * @param {HTMLElement} element - 目標元素
     * @param {Object} options - 提取選項
     * @param {boolean} options.searchSiblings - 是否搜索兄弟元素
     * @param {boolean} options.searchParent - 是否搜索父元素
     * @returns {string|null} 提取到的 URL
     */
    static extractFromNoscript(element, options = {}) {
        if (!element) {
            return null;
        }

        const { searchSiblings = true, searchParent = true } = options;

        // 檢查元素內部的 noscript
        const internalNoscript = element.querySelector('noscript');
        if (internalNoscript) {
            const url = this._extractUrlFromNoscriptContent(internalNoscript);
            if (url) {
                return url;
            }
        }

        // 檢查兄弟元素中的 noscript
        if (searchSiblings && element.parentElement) {
            const siblingNoscripts = element.parentElement.querySelectorAll('noscript');
            for (const noscript of siblingNoscripts) {
                const url = this._extractUrlFromNoscriptContent(noscript);
                if (url) {
                    return url;
                }
            }
        }

        // 檢查父元素中的 noscript
        if (searchParent && element.parentElement) {
            const parentNoscript = element.parentElement.querySelector('noscript');
            if (parentNoscript) {
                const url = this._extractUrlFromNoscriptContent(parentNoscript);
                if (url) {
                    return url;
                }
            }
        }

        return null;
    }

    /**
     * 從 figure 元素提取 URL
     * @param {HTMLElement} element - 目標元素
     * @returns {string|null} 提取到的 URL
     */
    static extractFromFigure(element) {
        if (!element) {
            return null;
        }

        // 檢查是否在 figure 元素內
        const figure = element.closest('figure');
        if (!figure) {
            return null;
        }

        // 在 figure 內查找其他圖片元素
        const images = figure.querySelectorAll('img');
        for (const img of images) {
            if (img !== element) {
                const src = img.getAttribute('src') || 
                           img.getAttribute('data-src');
                if (src && this._isValidUrl(src)) {
                    return src;
                }
            }
        }

        // 檢查 figure 的背景圖
        return this._getBackgroundImageUrl(figure);
    }

    /**
     * 從元素的 CSS 背景圖片提取 URL
     * @private
     * @param {HTMLElement} element - 目標元素
     * @returns {string|null} 背景圖片 URL
     */
    static _getBackgroundImageUrl(element) {
        if (!element || !window.getComputedStyle) {
            return null;
        }

        try {
            const computedStyle = window.getComputedStyle(element);
            const backgroundImage = computedStyle.getPropertyValue('background-image');
            
            if (!backgroundImage || backgroundImage === 'none') {
                return null;
            }

            // 提取 URL
            const urlMatch = backgroundImage.match(/url\(["']?(.*?)["']?\)/i);
            if (urlMatch?.[1]) {
                const url = urlMatch[1];
                if (this._isValidUrl(url)) {
                    return url;
                }
            }
        } catch (error) {
            // 忽略樣式計算錯誤
            console.warn('Failed to get background image:', error.message);
        }

        return null;
    }

    /**
     * 從 srcset 字符串提取第一個有效 URL
     * @private
     * @param {string} srcset - srcset 字符串
     * @returns {string|null} 提取到的 URL
     */
    static _extractUrlFromSrcset(srcset) {
        if (!srcset) {
            return null;
        }

        const entries = srcset.split(',').map(entry => entry.trim());
        
        for (const entry of entries) {
            const url = entry.split(/\s+/)[0];
            if (url && this._isValidUrl(url)) {
                return url;
            }
        }

        return null;
    }

    /**
     * 從 noscript 元素內容提取圖片 URL
     * @private
     * @param {HTMLElement} noscriptElement - noscript 元素
     * @returns {string|null} 提取到的 URL
     */
    static _extractUrlFromNoscriptContent(noscriptElement) {
        if (!noscriptElement) {
            return null;
        }

        try {
            const content = noscriptElement.textContent || noscriptElement.innerHTML;
            if (!content) {
                return null;
            }

            // 使用正則表達式匹配 img 標籤的 src 屬性
            const imgMatches = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
            
            if (imgMatches) {
                for (const match of imgMatches) {
                    const srcMatch = match.match(/src=["']([^"']+)["']/i);
                    if (srcMatch?.[1]) {
                        const url = srcMatch[1];
                        if (this._isValidUrl(url)) {
                            return url;
                        }
                    }
                }
            }

            // 嘗試匹配其他可能的 URL 模式
            const urlMatches = content.match(/https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|gif|webp|svg)/gi);
            if (urlMatches && urlMatches.length > 0) {
                return urlMatches[0];
            }

        } catch (error) {
            console.warn('Failed to parse noscript content:', error.message);
        }

        return null;
    }

    /**
     * 驗證 URL 是否有效
     * @private
     * @param {string} url - 要驗證的 URL
     * @returns {boolean} 是否有效
     */
    static _isValidUrl(url) {
        if (!url || typeof url !== 'string') {
            return false;
        }

        // 排除 data: 和 blob: URL
        if (url.startsWith('data:') || url.startsWith('blob:')) {
            return false;
        }

        // 基本長度檢查
        if (url.length < 4) {
            return false;
        }

        try {
            // 直接回傳轉為布林後的 URL 物件以避開 ESLint 對未使用建構值的警告
            return Boolean(new URL(url));
        } catch {
            // 可能是相對 URL
            return url.length > 0 && !url.startsWith('#');
        }
    }

    /**
     * 獲取所有可用的回退策略結果
     * @param {HTMLElement} element - 目標元素
     * @returns {Array} 所有找到的 URL 及其來源
     */
    static getAllFallbackUrls(element) {
        const results = [];

        // 背景圖片
        const backgroundUrl = this.extractFromBackground(element);
        if (backgroundUrl) {
            results.push({
                url: backgroundUrl,
                source: 'background',
                confidence: 0.7
            });
        }

        // Picture 元素
        const pictureUrl = this.extractFromPicture(element);
        if (pictureUrl) {
            results.push({
                url: pictureUrl,
                source: 'picture',
                confidence: 0.9
            });
        }

        // Noscript 元素
        const noscriptUrl = this.extractFromNoscript(element);
        if (noscriptUrl) {
            results.push({
                url: noscriptUrl,
                source: 'noscript',
                confidence: 0.8
            });
        }

        // Figure 元素
        const figureUrl = this.extractFromFigure(element);
        if (figureUrl) {
            results.push({
                url: figureUrl,
                source: 'figure',
                confidence: 0.6
            });
        }

        // 按置信度排序
        return results.sort((a, b) => b.confidence - a.confidence);
    }
}

// 導出類
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FallbackStrategies;
} else if (typeof window !== 'undefined') {
    window.FallbackStrategies = FallbackStrategies;
}
