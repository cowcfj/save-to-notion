/**
 * content.js 可測試版本
 * 提取純函數用於單元測試和覆蓋率追蹤
 * 
 * 這個文件從 scripts/content.js 提取純函數（不依賴特定 DOM 環境的函數）
 * 用於在 Node.js 環境中進行單元測試
 */

// 引入共用的圖片工具函數
const ImageUtils = require('../../scripts/utils/imageUtils');

/**
 * 清理和標準化圖片 URL
 * 使用統一的 ImageUtils 實現
 */
function cleanImageUrl(url) {
    return ImageUtils.cleanImageUrl(url);
}

/**
 * 檢查 URL 是否為有效的圖片格式
 * 使用統一的 ImageUtils 實現
 */
function isValidImageUrl(url) {
    return ImageUtils.isValidImageUrl(url);
}

/**
 * 從圖片節點提取源 URL
 * 使用統一的 ImageUtils 實現
 */
function extractImageSrc(imgNode) {
    return ImageUtils.extractImageSrc(imgNode);
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
