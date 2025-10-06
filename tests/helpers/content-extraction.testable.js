/**
 * content.js 內容提取函數的可測試版本
 * 從 scripts/content.js 提取用於單元測試
 */

const MIN_CONTENT_LENGTH = 250;
const MAX_LINK_DENSITY = 0.3;

/**
 * 檢查內容質量
 * @param {Object} article - Readability 解析的文章對象
 * @returns {boolean} 內容是否符合質量標準
 */
function isContentGood(article) {
    if (!article || !article.content || article.length < MIN_CONTENT_LENGTH) return false;
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

/**
 * CMS 感知的內容回退查找器
 * @returns {string|null} 找到的內容 HTML 或 null
 */
function findContentCmsFallback() {
    console.log("Executing CMS-aware fallback finder...");

    // Strategy 1: Look for Drupal's typical structure
    const drupalNodeContent = document.querySelector('.node__content');
    if (drupalNodeContent) {
        const imageField = drupalNodeContent.querySelector('.field--name-field-image');
        const bodyField = drupalNodeContent.querySelector('.field--name-field-body');

        if (bodyField) {
            console.log("Drupal structure detected. Combining fields.");
            const imageHtml = imageField ? imageField.innerHTML : '';
            const bodyHtml = bodyField.innerHTML;
            return imageHtml + bodyHtml;
        }
    }

    // Strategy 2: Look for WordPress and other CMS patterns
    const wordpressSelectors = [
        '.entry-content',
        '.post-content',
        '.article-content',
        '.content-area',
        '.single-content'
    ];

    for (const selector of wordpressSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim().length >= MIN_CONTENT_LENGTH) {
            console.log(`CMS content found with selector: ${selector}`);
            return element.innerHTML;
        }
    }

    // Strategy 3: Look for common article structures
    const articleSelectors = [
        'article[role="main"]',
        'article.post',
        'article.article',
        '.post-body',
        '.article-body',
        '.entry-body'
    ];

    for (const selector of articleSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim().length >= MIN_CONTENT_LENGTH) {
            console.log(`Article content found with selector: ${selector}`);
            return element.innerHTML;
        }
    }

    // Strategy 4: Generic "biggest content block" as a final attempt
    console.log("CMS structure not found. Reverting to generic content finder.");
    const candidates = document.querySelectorAll('article, section, main, div');
    let bestElement = null;
    let maxScore = 0;
    for (const el of candidates) {
        const text = el.textContent?.trim() || '';
        if (text.length < MIN_CONTENT_LENGTH) continue;
        const paragraphs = el.querySelectorAll('p').length;
        const images = el.querySelectorAll('img').length;
        const links = el.querySelectorAll('a').length;
        const score = text.length + (paragraphs * 50) + (images * 30) - (links * 25);
        if (score > maxScore) {
            if (bestElement && el.contains(bestElement)) continue;
            maxScore = score;
            bestElement = el;
        }
    }
    return bestElement ? bestElement.innerHTML : null;
}

module.exports = {
    isContentGood,
    findContentCmsFallback,
    MIN_CONTENT_LENGTH,
    MAX_LINK_DENSITY
};
