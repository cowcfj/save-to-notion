/**
 * content.js 可測試版本
 * 提取純函數用於單元測試和覆蓋率追蹤
 * 
 * 這個文件從 scripts/content.js 提取純函數（不依賴特定 DOM 環境的函數）
 * 用於在 Node.js 環境中進行單元測試
 */

/**
 * 清理和標準化圖片 URL
 * 從 scripts/content.js 提取
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
    } catch (e) {
        return null;
    }
}

/**
 * 檢查 URL 是否為有效的圖片格式
 * 從 scripts/content.js 提取
 */
function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    // 先清理 URL
    const cleanedUrl = cleanImageUrl(url);
    if (!cleanedUrl) return false;
    
    // 檢查是否為有效的 HTTP/HTTPS URL
    if (!cleanedUrl.match(/^https?:\/\//i)) return false;
    
    // 檢查 URL 長度（Notion 有限制）
    if (cleanedUrl.length > 2000) return false;
    
    // 檢查常見的圖片文件擴展名（擴展列表）
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif|avif|heic|heif)(\?.*)?$/i;
    
    // 如果 URL 包含圖片擴展名，直接返回 true
    if (imageExtensions.test(cleanedUrl)) return true;
    
    // 檢查 URL 路徑是否包含圖片目錄關鍵詞
    const imagePaths = /\/(images?|media|photos?|pics?|uploads?|assets|gallery|thumb|cdn|static)\//i;
    if (imagePaths.test(cleanedUrl)) return true;
    
    // 排除明顯不是圖片的 URL
    const excludePatterns = [
        /\.(js|css|html|htm|xml|json|pdf|doc|docx|xls|xlsx|zip|rar|mp3|mp4|avi)(\?.*)?$/i,
        /\/api\//i,
        /\/ajax\//i,
        /\/(login|logout|signin|signout|auth)/i
    ];
    
    for (const pattern of excludePatterns) {
        if (pattern.test(cleanedUrl)) return false;
    }
    
    return false;
}

/**
 * 從圖片節點提取源 URL
 * 從 scripts/content.js 提取，需要 DOM 環境
 */
function extractImageSrc(imgNode) {
    // 擴展的圖片屬性列表，涵蓋更多懶加載和響應式圖片的情況
    const imageAttrs = [
        // 擴展更多懶加載屬性
        'data-actualsrc', 'data-src-original', 'data-echo', 'data-href', 'data-large', 'data-bigsrc',
        'src',
        'data-src', 
        'data-lazy-src', 
        'data-original', 
        'data-srcset',
        'data-lazy-srcset',
        'data-original-src',
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
        'data-origin',
        'data-echo'
    ];
    
    // 首先檢查 srcset 屬性（響應式圖片）
    const srcset = imgNode.getAttribute('srcset') || imgNode.getAttribute('data-srcset') || imgNode.getAttribute('data-lazy-srcset');
    if (srcset) {
        // 從 srcset 中提取最大寬度（w）或最大像素密度（x）的圖片，否則回退最後一個
        const srcsetEntries = srcset.split(',').map(entry => entry.trim());
        if (srcsetEntries.length > 0) {
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
            if (bestUrl) return bestUrl;
            const lastEntry = srcsetEntries[srcsetEntries.length - 1];
            const url = lastEntry.split(' ')[0];
            if (url && !url.startsWith('data:')) {
                return url;
            }
        }
    }
    
    // 按優先級檢查各種 src 屬性
    for (const attr of imageAttrs) {
        if (imgNode.hasAttribute(attr)) {
            const src = imgNode.getAttribute(attr);
            if (src && src.trim() && !src.startsWith('data:') && !src.startsWith('blob:')) {
                return src.trim();
            }
        }
    }
    
    // 背景圖片回退（僅在前面取不到時嘗試）
    try {
        const cs = window.getComputedStyle && window.getComputedStyle(imgNode);
        const bg = cs && cs.getPropertyValue('background-image');
        const m = bg && bg.match(/url\(["']?(.*?)["']?\)/i);
        if (m && m[1] && !m[1].startsWith('data:')) {
            return m[1];
        }
        const parent = imgNode.parentElement;
        if (parent) {
            const cs2 = window.getComputedStyle && window.getComputedStyle(parent);
            const bg2 = cs2 && cs2.getPropertyValue('background-image');
            const m2 = bg2 && bg2.match(/url\(["']?(.*?)["']?\)/i);
            if (m2 && m2[1] && !m2[1].startsWith('data:')) {
                return m2[1];
            }
        }
    } catch (e) {}

    // 檢查父元素是否為 <picture> 元素
    if (imgNode.parentElement && imgNode.parentElement.nodeName === 'PICTURE') {
        const sources = imgNode.parentElement.querySelectorAll('source');
        for (const source of sources) {
            const srcset = source.getAttribute('srcset') || source.getAttribute('data-srcset');
            if (srcset) {
                const srcsetEntries = srcset.split(',').map(entry => entry.trim());
                if (srcsetEntries.length > 0) {
                    const lastEntry = srcsetEntries[srcsetEntries.length - 1];
                    const url = lastEntry.split(' ')[0];
                    if (url && !url.startsWith('data:')) {
                        return url;
                    }
                }
            }
        }
    }
    
    // noscript 回退：尋找鄰近/父節點內的 <noscript><img src="..."></noscript>
    try {
        const candidates = [imgNode, imgNode.parentElement].filter(Boolean);
        for (const el of candidates) {
            const nos = el.querySelector && el.querySelector('noscript');
            if (nos && nos.textContent) {
                const html = nos.textContent;
                const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
                if (m && m[1] && !m[1].startsWith('data:')) {
                    return m[1];
                }
            }
        }
    } catch (e) {}

    return null;
}

/**
 * 檢查內容質量（從 scripts/content.js 提取）
 */
function isContentGood(article, MIN_CONTENT_LENGTH = 250, MAX_LINK_DENSITY = 0.3) {
    if (!article || !article.content || article.length < MIN_CONTENT_LENGTH) return false;
    
    // 需要 DOM 環境來創建 tempDiv
    if (typeof document === 'undefined') {
        // 在測試環境中，我們假設內容是好的（簡化版本）
        return article.length >= MIN_CONTENT_LENGTH;
    }
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = article.content;
    const links = tempDiv.querySelectorAll('a');
    let linkTextLength = 0;
    links.forEach(link => linkTextLength += link.textContent.length);
    const linkDensity = linkTextLength / article.length;
    if (linkDensity > MAX_LINK_DENSITY) {
        console.log(`Readability.js content rejected due to high link density: ${linkDensity.toFixed(2)}`);
        return false;
    }
    return true;
}

// 導出函數供測試使用
module.exports = {
    cleanImageUrl,
    isValidImageUrl,
    extractImageSrc,
    isContentGood
};
