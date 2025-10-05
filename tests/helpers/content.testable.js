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
        // 從 srcset 中提取最大尺寸的圖片
        const srcsetEntries = srcset.split(',').map(entry => entry.trim());
        if (srcsetEntries.length > 0) {
            // 取最後一個（通常是最大尺寸）或第一個
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
