/**
 * 圖片處理工具函數庫
 * 統一的圖片 URL 處理、驗證和提取邏輯
 */

/**
 * 清理和標準化圖片 URL
 * @param {string} url - 原始圖片 URL
 * @returns {string|null} 清理後的 URL 或 null（如果無效）
 */
function cleanImageUrl(url) {
    if (!url || typeof url !== 'string') return null;

    try {
        const urlObj = new URL(url);

        // 處理代理 URL（如 pgw.udn.com.tw/gw/photo.php）
        if (urlObj.pathname.includes('/photo.php') || urlObj.pathname.includes('/gw/')) {
            const uParam = urlObj.searchParams.get('u');
            if (uParam && uParam.match(/^https?:\/\//)) {
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

    // 檢查是否為有效的 HTTP/HTTPS URL
    if (!cleanedUrl.match(/^https?:\/\//i)) return false;

    // 檢查 URL 長度（Notion 有限制，保守設置為 1500）
    if (cleanedUrl.length > 1500) return false;

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

        // 對於沒有明確擴展名的 URL（如 CDN 圖片），檢查是否包含圖片相關的路徑或關鍵字
        const imagePathPatterns = [
            /\/image[s]?\//i,
            /\/img[s]?\//i,
            /\/photo[s]?\//i,
            /\/picture[s]?\//i,
            /\/media\//i,
            /\/upload[s]?\//i,
            /\/asset[s]?\//i,
            /\/file[s]?\//i,
            /\/content\//i,
            /\/wp-content\//i,
            /\/cdn\//i,
            /cdn\d*\./i,  // cdn1.example.com, cdn2.example.com
            /\/static\//i,
            /\/thumb[s]?\//i,
            /\/thumbnail[s]?\//i,
            /\/resize\//i,
            /\/crop\//i,
            /\/(\d{4})\/(\d{2})\//  // 日期路徑如 /2025/10/
        ];

        // 排除明顯不是圖片的 URL
        const excludePatterns = [
            /\.(js|css|html|htm|php|asp|jsp|json|xml)(\?|$)/i,
            /\/api\//i,
            /\/ajax\//i,
            /\/callback/i,
            /\/track/i,
            /\/analytics/i,
            /\/pixel/i
        ];

        if (excludePatterns.some(pattern => pattern.test(cleanedUrl))) {
            return false;
        }

        return imagePathPatterns.some(pattern => pattern.test(cleanedUrl));
    } catch (error) {
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

        // 檢查是否包含可能導致問題的特殊字符
        // Notion API 對某些字符敏感
        const problematicChars = /[<>{}|\\^`\[\]]/;
        if (problematicChars.test(url)) {
            return false;
        }

        // 檢查是否有過多的查詢參數（可能表示動態生成的 URL）
        const paramCount = Array.from(urlObj.searchParams.keys()).length;
        if (paramCount > 10) {
            console.warn(`Image URL has too many query parameters (${paramCount}): ${url.substring(0, 100)}`);
            return false;
        }

        return true;
    } catch (error) {
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
            const wMatch = descriptor && descriptor.match(/(\d+)w/i);
            const xMatch = descriptor && descriptor.match(/(\d+)x/i);
            
            if (wMatch) {
                metric = parseInt(wMatch[1], 10) * 1000; // w 權重大於 x
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
 * 從圖片元素中提取最佳的 src URL
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的圖片 URL 或 null
 */
function extractImageSrc(imgNode) {
    if (!imgNode) return null;

    // 首先檢查 srcset 屬性（響應式圖片）
    const srcset = imgNode.getAttribute('srcset') || 
                   imgNode.getAttribute('data-srcset') || 
                   imgNode.getAttribute('data-lazy-srcset');
    
    if (srcset) {
        const bestUrl = extractBestUrlFromSrcset(srcset);
        if (bestUrl) return bestUrl;
    }

    // 檢查各種圖片屬性
    for (const attr of IMAGE_ATTRIBUTES) {
        const value = imgNode.getAttribute(attr);
        if (value && value.trim() && !value.startsWith('data:') && !value.startsWith('blob:')) {
            return value.trim();
        }
    }

    // 檢查 picture 元素的 source
    const parentPicture = imgNode.closest('picture');
    if (parentPicture) {
        const sources = parentPicture.querySelectorAll('source');
        for (const source of sources) {
            const sourceSrcset = source.getAttribute('srcset');
            if (sourceSrcset) {
                const bestUrl = extractBestUrlFromSrcset(sourceSrcset);
                if (bestUrl) return bestUrl;
            }
        }
    }

    // 檢查背景圖片
    try {
        if (typeof window !== 'undefined' && window.getComputedStyle) {
            const computedStyle = window.getComputedStyle(imgNode);
            let backgroundImage = computedStyle.backgroundImage;
            
            // 如果 backgroundImage 不存在，嘗試使用 getPropertyValue
            if (!backgroundImage && computedStyle.getPropertyValue) {
                backgroundImage = computedStyle.getPropertyValue('background-image');
            }
            
            if (backgroundImage && backgroundImage !== 'none') {
                const urlMatch = backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
                if (urlMatch && urlMatch[1] && !urlMatch[1].startsWith('data:')) {
                    return urlMatch[1];
                }
            }
            
            // 檢查父節點的背景圖片
            const parent = imgNode.parentElement;
            if (parent) {
                const parentStyle = window.getComputedStyle(parent);
                let parentBg = parentStyle.backgroundImage;
                
                // 如果 backgroundImage 不存在，嘗試使用 getPropertyValue
                if (!parentBg && parentStyle.getPropertyValue) {
                    parentBg = parentStyle.getPropertyValue('background-image');
                }
                
                if (parentBg && parentBg !== 'none') {
                    const parentMatch = parentBg.match(/url\(['"]?([^'"]+)['"]?\)/);
                    if (parentMatch && parentMatch[1] && !parentMatch[1].startsWith('data:')) {
                        return parentMatch[1];
                    }
                }
            }
        }
    } catch (error) {
        // 忽略樣式計算錯誤
    }

    // noscript 回退：尋找鄰近/父節點內的 <noscript><img src="..."></noscript>
    try {
        const candidates = [imgNode, imgNode.parentElement].filter(Boolean);
        for (const el of candidates) {
            const noscript = el.querySelector && el.querySelector('noscript');
            if (noscript && noscript.textContent) {
                const html = noscript.textContent;
                const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
                if (match && match[1] && !match[1].startsWith('data:')) {
                    return match[1];
                }
            }
        }
    } catch (error) {
        // 忽略 noscript 解析錯誤
    }

    return null;
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
        IMAGE_ATTRIBUTES
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
        IMAGE_ATTRIBUTES
    };
}