/**
 * 圖片處理工具函數庫
 * 統一的圖片 URL 處理、驗證和提取邏輯
 */

/**
 * 圖片驗證常數
 * 用於 URL 長度、參數數量等限制
 */
const IMAGE_VALIDATION_CONSTANTS = {
    MAX_URL_LENGTH: 1500,              // Notion API URL 長度限制
    MAX_QUERY_PARAMS: 10,              // 查詢參數數量閾值（超過可能為動態 URL）
    SRCSET_WIDTH_MULTIPLIER: 1000,     // srcset w 描述符權重（優先於 x）
    MAX_BACKGROUND_URL_LENGTH: 2000,   // 背景圖片 URL 最大長度（防止 ReDoS）
    MAX_RECURSION_DEPTH: 10            // 代理 URL 遞歸解析最大深度（防止無限遞歸）
};

/**
 * 清理和標準化圖片 URL
 * @param {string} url - 原始圖片 URL
 * @param {number} depth - 遞歸深度（內部參數，防止無限遞歸）
 * @returns {string|null} 清理後的 URL 或 null（如果無效）
 * @throws {Error} 當遞歸深度超過限制時拋出錯誤
 */
function cleanImageUrl(url, depth = 0) {
    if (!url || typeof url !== 'string') return null;

    // 遞歸深度檢查：防止惡意構造的嵌套代理 URL 導致堆疊溢出或 ReDoS
    if (depth > IMAGE_VALIDATION_CONSTANTS.MAX_RECURSION_DEPTH) {
        const errorMsg = `⚠️ [安全] 代理 URL 遞歸深度超過限制 (${depth}/${IMAGE_VALIDATION_CONSTANTS.MAX_RECURSION_DEPTH})`;
        if (typeof Logger !== 'undefined') {
            Logger.error(errorMsg);
        }
        throw new Error(errorMsg);
    }

    try {
        const urlObj = new URL(url);

        // 處理代理 URL（如 pgw.udn.com.tw/gw/photo.php）
        if (urlObj.pathname.includes('/photo.php') || urlObj.pathname.includes('/gw/')) {
            const uParam = urlObj.searchParams.get('u');
            /**
             * 正則表達式：/^https?:\/\//
             * 用途：檢查字符串是否以 http:// 或 https:// 開頭
             * 模式：
             *   ^        - 字符串開始
             *   https?   - 匹配 http 或 https（? 表示 s 可選）
             *   :\/\/    - 匹配 ://（斜線需轉義）
             * 風險：無（簡單前綴匹配，時間複雜度 O(1)）
             */
            if (uParam?.match(/^https?:\/\//)) {
                // 使用代理中的原始圖片 URL（遞歸處理，深度 +1）
                return cleanImageUrl(uParam, depth + 1);
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
    } catch (error) {
        /*
         * URL 解析錯誤：通常是格式不正確的 URL
         * 返回 null 表示無法處理，調用者應該有適當的回退處理
         */
        if (typeof ErrorHandler !== 'undefined') {
            ErrorHandler.logError({
                type: 'invalid_url',
                context: `URL cleaning: ${url}`,
                originalError: error,
                timestamp: Date.now()
            });
        }
        return null;
    }
}

/**
 * 檢查 URL 是否為有效的圖片格式
 * @param {string} url - 要檢查的 URL
 * @returns {boolean} 是否為有效的圖片 URL
 */
function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;

    // 先清理 URL
    const cleanedUrl = cleanImageUrl(url);
    if (!cleanedUrl) return false;

    /**
     * 正則表達式：/^https?:\/\//i
     * 用途：檢查 URL 是否以 http:// 或 https:// 開頭（不區分大小寫）
     * 模式：
     *   ^        - 字符串開始
     *   https?   - 匹配 http 或 https（? 表示 s 可選）
     *   :\/\/    - 匹配 ://（斜線需轉義）
     *   i 旗標  - 不區分大小寫
     * 風險：無（簡單前綴匹配，時間複雜度 O(1)）
     */
    if (!/^https?:\/\//i.test(cleanedUrl)) return false;

    // 檢查 URL 長度（Notion API 限制）
    if (cleanedUrl.length > IMAGE_VALIDATION_CONSTANTS.MAX_URL_LENGTH) return false;

    try {
        const urlObj = new URL(cleanedUrl);

        // 檢查是否為 data URL
        if (urlObj.protocol === 'data:') {
            return urlObj.href.startsWith('data:image/');
        }

        // 檢查文件擴展名
        const pathname = urlObj.pathname.toLowerCase();
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.tiff', '.tif', '.avif', '.heic', '.heif'];
        const hasImageExtension = imageExtensions.some(ext => pathname.endsWith(ext));

        // 如果 URL 包含圖片擴展名，直接返回 true
        if (hasImageExtension) return true;

        /**
         * 圖片路徑模式正則表達式集合
         * 用途：識別 CDN 或無副檔名的圖片 URL 路徑特徵
         * 風險：所有模式均為簡單字符串匹配，無回溯風險，時間複雜度 O(n)
         */
        const imagePathPatterns = [
            /\/image[s]?\//i,           // 匹配 /image/ 或 /images/（不區分大小寫）
            /\/img[s]?\//i,             // 匹配 /img/ 或 /imgs/
            /\/photo[s]?\//i,           // 匹配 /photo/ 或 /photos/
            /\/picture[s]?\//i,         // 匹配 /picture/ 或 /pictures/
            /\/media\//i,               // 匹配 /media/ 路徑
            /\/upload[s]?\//i,          // 匹配 /upload/ 或 /uploads/
            /\/asset[s]?\//i,           // 匹配 /asset/ 或 /assets/
            /\/file[s]?\//i,            // 匹配 /file/ 或 /files/
            /\/content\//i,             // 匹配 /content/ 路徑
            /\/wp-content\//i,          // 匹配 WordPress /wp-content/ 路徑
            /\/cdn\//i,                 // 匹配 /cdn/ 路徑
            /**
             * 正則表達式：/cdn\d*\./i
             * 用途：匹配 CDN 子域名（如 cdn.、cdn1.、cdn2.example.com）
             * 模式：
             *   cdn   - 匹配字面字符串 "cdn"
             *   \d*   - 匹配 0 到多個數字（* 表示 0 或多次）
             *   \.    - 匹配點號（需轉義）
             *   i 旗標 - 不區分大小寫
             * 風險：低（\d* 在有界輸入下無回溯問題）
             */
            /cdn\d*\./i,
            /\/static\//i,              // 匹配 /static/ 靜態資源路徑
            /\/thumb[s]?\//i,           // 匹配 /thumb/ 或 /thumbs/ 縮圖路徑
            /\/thumbnail[s]?\//i,       // 匹配 /thumbnail/ 或 /thumbnails/
            /\/resize\//i,              // 匹配 /resize/ 圖片調整路徑
            /\/crop\//i,                // 匹配 /crop/ 圖片裁剪路徑
            /**
             * 正則表達式：/\/(\d{4})\/(\d{2})\//
             * 用途：匹配日期組織的路徑（如 /2025/10/、/2024/03/）
             * 模式：
             *   \/       - 匹配斜線
             *   (\d{4})  - 捕獲組：匹配 4 位數字（年份）
             *   \/       - 匹配斜線
             *   (\d{2})  - 捕獲組：匹配 2 位數字（月份）
             *   \/       - 匹配斜線
             * 風險：無（固定長度匹配，時間複雜度 O(1)）
             */
            /\/(\d{4})\/(\d{2})\//
        ];

        /**
         * 排除模式正則表達式集合
         * 用途：過濾明顯非圖片的 URL（腳本、API、追蹤像素等）
         * 風險：所有模式均為簡單字符串匹配，無回溯風險
         */
        const excludePatterns = [
            /**
             * 正則表達式：/\.(js|css|html|htm|php|asp|jsp|json|xml)(\?|$)/i
             * 用途：排除常見的非圖片檔案副檔名
             * 模式：
             *   \.                  - 匹配點號（需轉義）
             *   (js|css|...|xml)    - 匹配任一副檔名（| 表示或）
             *   (\?|$)              - 匹配問號（查詢字符串開始）或字符串結尾
             *   i 旗標              - 不區分大小寫
             * 風險：無（有限選項集合，無回溯）
             */
            /\.(js|css|html|htm|php|asp|jsp|json|xml)(\?|$)/i,
            /\/api\//i,             // 排除 /api/ API 端點路徑
            /\/ajax\//i,            // 排除 /ajax/ AJAX 請求路徑
            /\/callback/i,          // 排除 /callback 回調路徑
            /\/track/i,             // 排除 /track 追蹤路徑
            /\/analytics/i,         // 排除 /analytics 分析路徑
            /\/pixel/i              // 排除 /pixel 追蹤像素路徑
        ];

        if (excludePatterns.some(pattern => pattern.test(cleanedUrl))) {
            return false;
        }

        return imagePathPatterns.some(pattern => pattern.test(cleanedUrl));
    } catch (_error) {
        return false;
    }
}

/**
 * 檢查 URL 是否可能被 Notion API 接受（更嚴格的驗證）
 * @param {string} url - 要檢查的 URL
 * @returns {boolean} 是否可能被 Notion 接受
 */
function isNotionCompatibleImageUrl(url) {
    if (!isValidImageUrl(url)) return false;

    try {
        const urlObj = new URL(url);

        // Notion 不支持某些特殊協議
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
            return false;
        }

        /**
         * 正則表達式：/[<>{}|\\^`\[\]]/
         * 用途：檢測 Notion API 不接受的特殊字符
         * 模式：
         *   [...]   - 字符類別，匹配方括號內任一字符
         *   <>      - 尖括號
         *   {}      - 大括號
         *   |       - 管道符號
         *   \\      - 反斜線（需雙重轉義）
         *   ^       - 脫字符號
         *   `       - 反引號
         *   \[\]    - 方括號（需轉義）
         * 風險：無（簡單字符類別匹配，時間複雜度 O(n)）
         */
        const problematicChars = /[<>{}|\\^`\[\]]/;
        if (problematicChars.test(url)) {
            return false;
        }

        // 檢查是否有過多的查詢參數（可能表示動態生成的 URL）
        const paramCount = Array.from(urlObj.searchParams.keys()).length;
        if (paramCount > IMAGE_VALIDATION_CONSTANTS.MAX_QUERY_PARAMS) {
            if (typeof Logger !== 'undefined') {
                Logger.warn(`⚠️ [圖片驗證] URL 查詢參數過多 (${paramCount}): ${url.substring(0, 100)}`);
            }
            return false;
        }

        return true;
    } catch (_error) {
        return false;
    }
}

/**
 * 統一的圖片屬性列表，涵蓋各種懶加載和響應式圖片的情況
 */
const IMAGE_ATTRIBUTES = [
    'src',
    'data-src',
    'data-lazy-src',
    'data-original',
    'data-srcset',
    'data-lazy-srcset',
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

/**
 * 從 srcset 字符串中提取最佳圖片 URL
 * @param {string} srcset - srcset 屬性值
 * @returns {string|null} 最佳圖片 URL 或 null
 */
function extractBestUrlFromSrcset(srcset) {
    if (!srcset || typeof srcset !== 'string') return null;

    const srcsetEntries = srcset.split(',').map(entry => entry.trim());
    if (srcsetEntries.length === 0) return null;

    let bestUrl = null;
    let bestMetric = -1; // 比較值，優先使用 w，其次使用 x

    for (const entry of srcsetEntries) {
        const [url, descriptor] = entry.split(/\s+/);
        if (url && !url.startsWith('data:')) {
            let metric = -1;
            const wMatch = descriptor?.match(/(\d+)w/i);
            const xMatch = descriptor?.match(/(\d+)x/i);

            if (wMatch) {
                metric = parseInt(wMatch[1], 10) * IMAGE_VALIDATION_CONSTANTS.SRCSET_WIDTH_MULTIPLIER;
            } else if (xMatch) {
                metric = parseInt(xMatch[1], 10);
            } else {
                // 沒有描述，視為最小優先
                metric = 0;
            }

            if (metric > bestMetric) {
                bestMetric = metric;
                bestUrl = url;
            }
        }
    }

    return bestUrl || srcsetEntries[srcsetEntries.length - 1].split(/\s+/)[0];
}

/**
 * 從 srcset 屬性提取 URL
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
function extractFromSrcset(imgNode) {
    const srcset = imgNode.getAttribute('srcset') ||
                   imgNode.getAttribute('data-srcset') ||
                   imgNode.getAttribute('data-lazy-srcset');

    if (srcset) {
        const bestUrl = extractBestUrlFromSrcset(srcset);
        if (bestUrl) return bestUrl;
    }
    return null;
}

/**
 * 從圖片屬性提取 URL
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
function extractFromAttributes(imgNode) {
    for (const attr of IMAGE_ATTRIBUTES) {
        const value = imgNode.getAttribute(attr);
        if (value?.trim() && !value.startsWith('data:') && !value.startsWith('blob:')) {
            return value.trim();
        }
    }
    return null;
}

/**
 * 從 picture 元素提取 URL
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
function extractFromPicture(imgNode) {
    const parentPicture = imgNode.closest('picture');
    if (!parentPicture) return null;

    const sources = parentPicture.querySelectorAll('source');
    for (const source of sources) {
        const sourceSrcset = source.getAttribute('srcset');
        if (sourceSrcset) {
            const bestUrl = extractBestUrlFromSrcset(sourceSrcset);
            if (bestUrl) return bestUrl;
        }
    }
    return null;
}

/**
 * 從背景圖片 CSS 屬性提取 URL
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
function extractFromBackgroundImage(imgNode) {
    try {
        if (typeof window === 'undefined' || !window.getComputedStyle) {
            return null;
        }

        const computedStyle = window.getComputedStyle(imgNode);
        const backgroundImage = computedStyle.backgroundImage ||
                              computedStyle.getPropertyValue?.('background-image');

        if (backgroundImage && backgroundImage !== 'none') {
            // 限制捕獲組長度，防止 ReDoS 攻擊
            const urlMatch = backgroundImage.match(/url\(['"]?([^'"]{1,2000})['"]?\)/);
            if (urlMatch?.[1] &&
                !urlMatch[1].startsWith('data:') &&
                urlMatch[1].length < IMAGE_VALIDATION_CONSTANTS.MAX_BACKGROUND_URL_LENGTH) {
                return urlMatch[1];
            }
        }

        // 檢查父節點的背景圖片
        const parent = imgNode.parentElement;
        if (parent) {
            const parentStyle = window.getComputedStyle(parent);
            const parentBg = parentStyle.backgroundImage ||
                           parentStyle.getPropertyValue?.('background-image');

            if (parentBg && parentBg !== 'none') {
                const parentMatch = parentBg.match(/url\(['"]?([^'"]{1,2000})['"]?\)/);
                if (parentMatch?.[1] &&
                    !parentMatch[1].startsWith('data:') &&
                    parentMatch[1].length < IMAGE_VALIDATION_CONSTANTS.MAX_BACKGROUND_URL_LENGTH) {
                    return parentMatch[1];
                }
            }
        }
    } catch (_error) {
        // 忽略樣式計算錯誤
    }
    return null;
}

/**
 * 從 noscript 標籤提取 URL
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
function extractFromNoscript(imgNode) {
    try {
        const candidates = [imgNode, imgNode.parentElement].filter(Boolean);
        for (const el of candidates) {
            const noscript = el.querySelector && el.querySelector('noscript');
            if (noscript?.textContent) {
                const html = noscript.textContent;
                const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
                if (match?.[1] && !match[1].startsWith('data:')) {
                    return match[1];
                }
            }
        }
    } catch (_error) {
        // 忽略 noscript 解析錯誤
    }
    return null;
}

/**
 * 從圖片元素中提取最佳的 src URL
 * 使用多層回退策略：srcset → 屬性 → picture → background → noscript
 *
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的圖片 URL 或 null
 */
function extractImageSrc(imgNode) {
    if (!imgNode) return null;

    return extractFromSrcset(imgNode) ||
           extractFromAttributes(imgNode) ||
           extractFromPicture(imgNode) ||
           extractFromBackgroundImage(imgNode) ||
           extractFromNoscript(imgNode);
}

/**
 * 生成圖片緩存鍵
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string} 緩存鍵
 */
function generateImageCacheKey(imgNode) {
    if (!imgNode) return '';

    const src = imgNode.getAttribute('src') || '';
    const dataSrc = imgNode.getAttribute('data-src') || '';
    const className = imgNode.className || '';
    const id = imgNode.id || '';

    return `${src}|${dataSrc}|${className}|${id}`;
}

// 導出函數
if (typeof module !== 'undefined' && module.exports) {
    // Node.js 環境（測試）
    module.exports = {
        cleanImageUrl,
        isValidImageUrl,
        isNotionCompatibleImageUrl,
        extractImageSrc,
        extractBestUrlFromSrcset,
        generateImageCacheKey,
        IMAGE_ATTRIBUTES,
        IMAGE_VALIDATION_CONSTANTS,
        // 導出子函數供測試使用
        extractFromSrcset,
        extractFromAttributes,
        extractFromPicture,
        extractFromBackgroundImage,
        extractFromNoscript
    };
} else if (typeof window !== 'undefined') {
    // 瀏覽器環境
    window.ImageUtils = {
        cleanImageUrl,
        isValidImageUrl,
        isNotionCompatibleImageUrl,
        extractImageSrc,
        extractBestUrlFromSrcset,
        generateImageCacheKey,
        IMAGE_ATTRIBUTES,
        IMAGE_VALIDATION_CONSTANTS
    };
}