// This script is injected into the active tab.

/* global PerformanceOptimizer, ImageUtils, batchProcess, ErrorHandler, chrome */

// 開發模式控制（與 background.js 保持一致）
const DEBUG_MODE = (function() {
    try {
        return chrome?.runtime?.getManifest?.()?.version?.includes('dev') || false;
    } catch (e) {
        return false;
    }
})();

// 改進的日誌系統 - 生產環境安全且性能優化
const Logger = (() => {
    // 環境檢測快取（避免重複計算）
    const isDevMode = DEBUG_MODE;
    const isProduction = !isDevMode;

    // 日誌級別常量（用於一致性和可維護性）
    const LOG_LEVELS = {
        DEBUG: 0,
        LOG: 1,
        INFO: 2,
        WARN: 3,
        ERROR: 4
    };

    // 當前日誌級別（基於環境）
    const currentLevel = isDevMode ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN;

    // 統一的日誌格式化函數（性能優化：只在需要時格式化）
    const formatMessage = (level, message, ...args) => {
        // 生產環境只保留錯誤和警告的基本信息
        if (isProduction && level < LOG_LEVELS.WARN) {
            return null;
        }

        // 開發環境添加時間戳和級別前綴
        if (isDevMode) {
            const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
            const levelPrefix = {
                [LOG_LEVELS.DEBUG]: '🐛 [DEBUG]',
                [LOG_LEVELS.LOG]: '📝 [LOG]',
                [LOG_LEVELS.INFO]: 'ℹ️ [INFO]',
                [LOG_LEVELS.WARN]: '⚠️ [WARN]',
                [LOG_LEVELS.ERROR]: '❌ [ERROR]'
            }[level] || '[UNKNOWN]';

            return [`${levelPrefix} ${timestamp}:`, message, ...args];
        }

        // 生產環境只返回基本消息
        return [message, ...args];
    };

    // 安全的控制台方法調用（處理邊緣情況）
    const safeConsoleCall = (method, ...args) => {
        try {
            if (typeof console !== 'undefined' && typeof console[method] === 'function') {
                console[method](...args);
            }
        } catch (error) {
            // 靜默失敗，避免日誌系統本身造成問題
            // 在極端情況下甚至 console 都不可用
        }
    };

    // 創建日誌方法的工廠函數
    const createLogMethod = (level, consoleMethod) => {
        return (...args) => {
            // 提前檢查級別（性能優化）
            if (level < currentLevel) {
                return;
            }

            // 參數驗證
            if (!args || args.length === 0) {
                return;
            }

            const formatted = formatMessage(level, ...args);
            if (formatted) {
                safeConsoleCall(consoleMethod, ...formatted);
            }
        };
    };

    // 返回 Logger 對象
    return {
        // 標準日誌級別
        debug: createLogMethod(LOG_LEVELS.DEBUG, 'debug'),
        log: createLogMethod(LOG_LEVELS.LOG, 'log'),
        info: createLogMethod(LOG_LEVELS.INFO, 'info'),
        warn: createLogMethod(LOG_LEVELS.WARN, 'warn'),
        error: createLogMethod(LOG_LEVELS.ERROR, 'error'),

        // 向後兼容的別名
        trace: createLogMethod(LOG_LEVELS.DEBUG, 'debug'),

        // 實用方法
        isEnabled: (level = LOG_LEVELS.INFO) => level >= currentLevel,
        getCurrentLevel: () => currentLevel,
        isDevMode: () => isDevMode
    };
})();

// 列表處理的預編譯正則表達式模式（性能優化：避免在循環中重複編譯）
const LIST_PREFIX_PATTERNS = {
    // 移除列表前綴：連字符、項目符號、星號、數字、點、管道、括號和空格
    bulletPrefix: /^[-•\u{2022}*\d+.|)\s]+/u,
    // 多餘空格正規化
    multipleSpaces: /\s+/g,
    // 空白行檢測
    emptyLine: /^\s*$/
};

// ===================================================================
// === 輔助函數聲明區塊（Helper Functions - Module Level）
// ===================================================================

/**
 * 安全地查詢 DOM 元素，避免拋出異常
 * @param {Element|Document} container - 要查詢的容器元素
 * @param {string} selector - CSS 選擇器
 * @returns {NodeList|Array} 查詢結果或空數組
 */
function safeQueryElements(container, selector) {
    if (!container || !selector) {
        return [];
    }

    try {
        return container.querySelectorAll(selector);
    } catch (error) {
        Logger.warn(`查詢選擇器失敗: ${selector}`, error);
        return [];
    }
}

/**
 * 評估提取的內容質量
 * 檢查內容長度和鏈接密度，判斷內容是否足夠好
 *
 * @param {Object} article - Readability 提取的文章對象
 * @param {string} article.content - 文章 HTML 內容
 * @param {number} article.textContent - 文章文本內容（用於長度計算）
 * @returns {boolean} 如果內容質量良好返回 true，否則返回 false
 *
 * @description
 * 質量評估標準：
 * 1. 內容長度至少 250 字符（MIN_CONTENT_LENGTH）
 * 2. 鏈接密度不超過 30%（MAX_LINK_DENSITY）
 * 3. 列表項數量 >= 8 時允許例外（LIST_EXCEPTION_THRESHOLD）
 *
 * 鏈接密度 = (所有鏈接文本長度) / (總文本長度)
 *
 * 特殊處理：
 * - 對於以清單為主的文件（如 CLI docs），如果包含 8+ 個 <li> 項目，即使鏈接密度高也視為有效
 */
function isContentGood(article) {
    const MIN_CONTENT_LENGTH = 250;
    const MAX_LINK_DENSITY = 0.3;
    const LIST_EXCEPTION_THRESHOLD = 8;

    // 驗證輸入
    if (!article || !article.content) {
        Logger.warn('[內容質量] article 或 article.content 為空');
        return false;
    }

    // 使用正確的文本長度：article.content 的長度
    const contentLength = article.content.length;

    // 內容太短，質量不佳
    if (contentLength < MIN_CONTENT_LENGTH) {
        Logger.warn(`[內容質量] 內容長度不足: ${contentLength} < ${MIN_CONTENT_LENGTH}`);
        return false;
    }

    // 創建臨時 DOM 容器以分析內容
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = article.content;

    // 計算鏈接密度
    let linkTextLength = 0;
    const links = safeQueryElements(tempDiv, 'a');

    // 修復 JS-0086: 使用顯式語句而非箭頭函數中的賦值返回
    Array.from(links).forEach((link) => {
        linkTextLength += (link.textContent || '').length;
    });

    // 使用正確的總長度作為分母
    const linkDensity = contentLength > 0 ? linkTextLength / contentLength : 0;

    // 計算列表項數量
    const liNodes = safeQueryElements(tempDiv, 'li');
    const liCount = liNodes.length;

    // 如果頁面以長清單為主（如文件、命令列清單），允許通過
    if (liCount >= LIST_EXCEPTION_THRESHOLD) {
        Logger.log(`Readability.js content accepted as list-heavy (liCount=${liCount}) despite link density ${linkDensity.toFixed(2)}`);
        return true;
    }

    // 檢查鏈接密度
    if (linkDensity > MAX_LINK_DENSITY) {
        Logger.log(`Readability.js content rejected due to high link density: ${linkDensity.toFixed(2)}`);
        return false;
    }

    return true;
}

// processNodeToNotionBlock 和 convertHtmlToNotionBlocks 將在 IIFE 內部定義
// 因為它們需要訪問 extractImageSrc、cleanImageUrl 等函數

// ===================================================================
// === 主要執行區塊開始
// ===================================================================

(async function () {
    try {
        // 初始化性能優化器（如果可用）
        let performanceOptimizer = null;
        try {
            if (typeof PerformanceOptimizer !== 'undefined') {
                performanceOptimizer = new PerformanceOptimizer({
                    enableCache: true,
                    enableBatching: true,
                    enableMetrics: true,
                    cacheMaxSize: 500,  // 增加緩存大小以支持更多頁面元素
                    cacheTTL: 600000    // 10分鐘 TTL
                });

                                // 使用智能預熱功能
                const prewarmResult = await performanceOptimizer.smartPrewarm(document);
                Logger.log('✓ PerformanceOptimizer initialized in content script with smart prewarming');
            } else {
                Logger.warn('⚠️ PerformanceOptimizer not available in content script, using fallback queries');
            }
        } catch (perfError) {
            Logger.warn('⚠️ PerformanceOptimizer initialization failed in content script:', perfError);
            performanceOptimizer = null;
        }

        // 便捷的緩存查詢函數
        function cachedQuery(selector, context = document, options = {}) {
            if (performanceOptimizer) {
                return performanceOptimizer.cachedQuery(selector, context, options);
            }
            // 回退到原生查詢
            return options.single ? context.querySelector(selector) : context.querySelectorAll(selector);
        }

        // 檢查 ImageUtils 是否可用，如果不可用則提供回退實現
        if (typeof ImageUtils === 'undefined') {
            Logger.warn('ImageUtils not available, using fallback implementations');
            window.ImageUtils = {
                cleanImageUrl(url) {
                    if (!url || typeof url !== 'string') return null;
                    try {
                        return new URL(url).href;
                    } catch (e) {
                        return null;
                    }
                },
                isValidImageUrl(url) {
                    if (!url || typeof url !== 'string') return false;
                    return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(url);
                },
                isNotionCompatibleImageUrl(url) {
                    // 簡單的回退實現
                    return this.isValidImageUrl(url);
                },
                extractImageSrc(imgNode) {
                    if (!imgNode) return null;
                    return imgNode.getAttribute('src') || imgNode.getAttribute('data-src') || null;
                },
                generateImageCacheKey(imgNode) {
                    if (!imgNode) return 'null';
                    return (imgNode.getAttribute('src') || '') + '|' + (imgNode.className || '');
                }
            };
        }

        const MIN_CONTENT_LENGTH = 250;
        const MAX_LINK_DENSITY = 0.3;

        /**
         * A new, CMS-aware fallback function. It specifically looks for patterns
         * found in CMS like Drupal and other common website structures.
         * @returns {string|null} The combined innerHTML of the article components.
         */
        function findContentCmsFallback() {
            Logger.log("Executing CMS-aware fallback finder...");

            // Strategy 1: Look for Drupal's typical structure
            const drupalNodeContent = cachedQuery('.node__content', document, { single: true });
            if (drupalNodeContent) {
                const imageField = cachedQuery('.field--name-field-image', drupalNodeContent, { single: true });
                const bodyField = cachedQuery('.field--name-field-body', drupalNodeContent, { single: true });

                if (bodyField) {
                    Logger.log("Drupal structure detected. Combining fields.");
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
                '.single-content',
                '.main-content',
                '.page-content',
                '.content-wrapper',
                '.article-wrapper',
                '.post-wrapper',
                '.content-body',
                '.article-text',
                '.post-text',
                '.content-main',
                '.article-main',
                // 移動版常用選擇器
                '.mobile-content',
                '.m-content',
                '.content',
                '.text-content',
                '.article-detail',
                '.post-detail',
                '.detail-content',
                '.news-content',
                '.story-content'
            ];

            for (const selector of wordpressSelectors) {
                const element = cachedQuery(selector, document, { single: true });
                if (element) {
                    const textLength = element.textContent.trim().length;
                    Logger.log(`Found element with selector "${selector}": ${textLength} characters`);
                    if (textLength >= MIN_CONTENT_LENGTH) {
                        Logger.log(`✅ CMS content found with selector: ${selector} (${textLength} chars)`);
                        return element.innerHTML;
                    } else {
                        Logger.log(`❌ Content too short with selector: ${selector} (${textLength} < ${MIN_CONTENT_LENGTH})`);
                    }
                } else {
                    Logger.log(`❌ No element found with selector: ${selector}`);
                }
            }

            // Strategy 3: Look for common article structures
            const articleSelectors = [
                'article[role="main"]',
                'article.post',
                'article.article',
                'article.content',
                'article.entry',
                '.post-body',
                '.article-body',
                '.entry-body',
                '.news-body',
                '.story-body',
                '.content-text',
                '.article-container',
                '.post-container',
                '.content-container',
                // 通用文章標籤
                'article',
                'main article',
                '.article',
                '.post',
                '.entry',
                '.news',
                '.story',
                // ID 選擇器（常見的）
                '#content',
                '#main-content',
                '#article-content',
                '#post-content',
                '#article',
                '#post',
                '#main'
            ];

            for (const selector of articleSelectors) {
                const element = cachedQuery(selector, document, { single: true });
                if (element) {
                    const textLength = element.textContent.trim().length;
                    Logger.log(`Found element with selector "${selector}": ${textLength} characters`);
                    if (textLength >= MIN_CONTENT_LENGTH) {
                        Logger.log(`✅ Article content found with selector: ${selector} (${textLength} chars)`);
                        return element.innerHTML;
                    } else {
                        Logger.log(`❌ Content too short with selector: ${selector} (${textLength} < ${MIN_CONTENT_LENGTH})`);
                    }
                } else {
                    Logger.log(`❌ No element found with selector: ${selector}`);
                }
            }

            // Strategy 4: Generic "biggest content block" as a final attempt
            Logger.log("🔍 CMS structure not found. Reverting to generic content finder...");
            Logger.log(`📏 Minimum content length required: ${MIN_CONTENT_LENGTH} characters`);

            const candidates = cachedQuery('article, section, main, div', document);
            Logger.log(`🎯 Found ${candidates.length} potential content candidates`);

            let bestElement = null;
            let maxScore = 0;
            let candidateCount = 0;

            for (const el of candidates) {
                const text = el.textContent?.trim() || '';
                candidateCount++;

                if (text.length < MIN_CONTENT_LENGTH) {
                    Logger.log(`❌ Candidate ${candidateCount}: Too short (${text.length} < ${MIN_CONTENT_LENGTH})`);
                    continue;
                }

                const paragraphs = cachedQuery('p', el).length;
                const images = cachedQuery('img', el).length;
                const links = cachedQuery('a', el).length;

                // 給圖片加分，因為我們想要包含圖片的內容
                const score = text.length + (paragraphs * 50) + (images * 30) - (links * 25);

                Logger.log(`📊 Candidate ${candidateCount}: ${text.length} chars, ${paragraphs}p, ${images}img, ${links}links, score: ${score}`);

                if (score > maxScore) {
                    // 避免選擇嵌套的父元素
                    if (bestElement && el.contains(bestElement)) {
                        Logger.log("⚠️ Skipping nested parent element");
                        continue;
                    }
                    maxScore = score;
                    bestElement = el;
                    Logger.log(`✅ New best candidate found with score: ${score}`);
                }
            }

            if (bestElement) {
                Logger.log(`🎉 Best content found with ${bestElement.textContent.trim().length} characters`);
                return bestElement.innerHTML;
            } else {
                Logger.log(`❌ No suitable content found. All ${candidateCount} candidates were too short or scored too low.`);

                // 最後的嘗試：降低標準
                Logger.log(`🔄 Trying with lower standards (${MIN_CONTENT_LENGTH / 2} chars)...`);
                for (const el of candidates) {
                    const text = el.textContent?.trim() || '';
                    if (text.length >= MIN_CONTENT_LENGTH / 2) {
                        Logger.log(`🆘 Emergency fallback: Found content with ${text.length} characters`);
                        return el.innerHTML;
                    }
                }

                Logger.log("💥 Complete failure: No content found even with lower standards");
                return null;
            }
        }

        /**
         * 當 Readability 與 CMS fallback 都無法取得內容時，嘗試擷取最大的一個 <ul> 或 <ol>
         * 針對像是 CLI 文件或參考頁面（大量 bullet points）的改善。
         * 回傳該列表的 innerHTML 或 null。
         */
        function extractLargestListFallback() {
            try {
                Logger.log('🔎 Running extractLargestListFallback to find large <ul>/<ol>');

                // 策略 1: 尋找真正的 <ul> / <ol>
                const lists = Array.from(document.querySelectorAll('ul, ol'));
                Logger.log(`Found ${lists.length} actual <ul>/<ol> elements`);

                // 策略 2: 尋找可能是清單但用 div/section 呈現的內容
                const possibleListContainers = Array.from(document.querySelectorAll('div, section, article')).filter(container => {
                    const text = container.textContent || '';
                    // 尋找包含多個以 bullet 字元或數字開頭的行的容器
                    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                    if (lines.length < 4) return false;

                    const bulletPattern = /^[\u{2022}\-\*•·–—►▶✔▪\d+\.]\s+/u;
                    const matchingLines = lines.filter(line => bulletPattern.test(line)).length;
                    return matchingLines >= Math.max(3, Math.floor(lines.length * 0.4));
                });

                Logger.log(`Found ${possibleListContainers.length} possible list containers`);

                // 合併真正的清單和可能的清單容器
                const allCandidates = [...lists, ...possibleListContainers];

                if (!allCandidates || allCandidates.length === 0) {
                    Logger.log('✗ No lists or list-like containers found on page');
                    return null;
                }

                // 評分：以 <li> 數量為主，並加上文字長度作為次要指標
                let best = null;
                let bestScore = 0;

                allCandidates.forEach((candidate, idx) => {
                    const liItems = Array.from(candidate.querySelectorAll('li'));
                    const liCount = liItems.length;
                    const textLength = (candidate.textContent || '').trim().length;

                    // 對於非 <ul>/<ol> 的容器，用行數代替 li 數量
                    let effectiveItemCount = liCount;
                    if (liCount === 0) {
                        const lines = (candidate.textContent || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                        const bulletPattern = /^[\u{2022}\-\*•·–—►▶✔▪\d+\.]\s+/u;
                        effectiveItemCount = lines.filter(line => bulletPattern.test(line)).length;
                    }

                    const score = (effectiveItemCount * 10) + Math.min(500, Math.floor(textLength / 10));

                    Logger.log(`Candidate ${idx + 1}: itemCount=${effectiveItemCount}, textLength=${textLength}, score=${score}, tagName=${candidate.tagName}`);

                    // 過濾太短或只有單一項目的容器
                    if (effectiveItemCount < 4) return;

                    if (score > bestScore) {
                        bestScore = score;
                        best = candidate;
                    }
                });

                if (best) {
                    Logger.log(`✅ extractLargestListFallback chose a container with score ${bestScore}, tagName=${best.tagName}`);
                    // 嘗試把周邊標題包含進去（若存在相鄰的 <h1>-<h3>）
                    let containerHtml = best.innerHTML;
                    const prev = best.previousElementSibling;
                    if (prev && /^H[1-3]$/.test(prev.nodeName)) {
                        containerHtml = prev.outerHTML + '\n' + containerHtml;
                        Logger.log('Included preceding heading in fallback content');
                    }
                    return containerHtml;
                }

                Logger.log('✗ No suitable large list or list-like container found');
                return null;
            } catch (e) {
                Logger.warn('extractLargestListFallback failed:', e);
                return null;
            }
        }

        /**
         * 提取圖片的 src 屬性，支持多種懶加載和響應式圖片格式
         */
        // 圖片提取結果緩存
        const imageExtractionCache = new Map();
        const MAX_EXTRACTION_CACHE_SIZE = 100;

        /**
         * 將 DOM 節點轉換為 Notion 區塊
         * @param {Node} node - DOM 節點
         * @param {Array} blocks - Notion 區塊數組
         * @param {Function} createRichText - 創建富文本的輔助函數
         */
        function processNodeToNotionBlock(node, blocks, createRichText) {
            if (node.nodeType !== 1) return;
            const textContent = node.textContent?.trim();

            switch (node.nodeName) {
                case 'H1':
                case 'H2':
                case 'H3': {
                    if (textContent) {
                        blocks.push({
                            object: 'block',
                            type: `heading_${node.nodeName[1]}`,
                            [`heading_${node.nodeName[1]}`]: {
                                rich_text: createRichText(textContent)
                            }
                        });
                    }
                    break;
                }

                case 'P': {
                    if (textContent) {
                        // 偵測是否為以換行或符號表示的清單（有些文件會用 CSS 或 <br> 呈現點列）
                        const innerHtml = node.innerHTML || '';
                        const lines = textContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

                        // 常見的 bullet 標記與編號模式
                        const bulletCharRe = /^[\u{2022}\-\*•·–—►▶✔▪]\s+/u;
                        const numberedRe = /^\d+[\.|\)]\s+/;

                        const hasBr = /<br\s*\/?/i.test(innerHtml);
                        const manyLines = lines.length >= 2;

                        // 判斷是否為 list-like paragraph：多行或包含 <br> 且每行看起來像項目
                        let looksLikeList = false;
                        if (manyLines || hasBr) {
                            // 如果大部分行以 bulletChar 或 numbered 開頭，視為清單
                            const matchCount = lines.reduce((acc, l) =>
                                acc + ((bulletCharRe.test(l) || numberedRe.test(l) || /^[-••]/u.test(l)) ? 1 : 0), 0);
                            if (matchCount >= Math.max(1, Math.floor(lines.length * 0.6))) {
                                looksLikeList = true;
                            }
                        } else {
                            // 單行但以 bullet 字元開始也視為 list item
                            if (bulletCharRe.test(textContent) || numberedRe.test(textContent)) {
                                looksLikeList = true;
                            }
                        }

                        if (looksLikeList) {
                            // 把每一行或每個項目轉成 bulleted_list_item
                            lines.forEach(line => {
                                // 步驟 1：移除已知的列表格式標記
                                let cleaned = line
                                    .replace(bulletCharRe, '')
                                    .replace(numberedRe, '')
                                    .trim();

                                // 步驟 2：移除殘留的前綴符號（使用預編譯的正則表達式）
                                cleaned = cleaned
                                    .replace(LIST_PREFIX_PATTERNS.bulletPrefix, '')
                                    .replace(LIST_PREFIX_PATTERNS.multipleSpaces, ' ')
                                    .trim();

                                // 步驟 3：只處理非空內容
                                if (cleaned && !LIST_PREFIX_PATTERNS.emptyLine.test(cleaned)) {
                                    blocks.push({
                                        object: 'block',
                                        type: 'bulleted_list_item',
                                        bulleted_list_item: {
                                            rich_text: createRichText(cleaned)
                                        }
                                    });
                                }
                            });
                        } else {
                            blocks.push({
                                object: 'block',
                                type: 'paragraph',
                                paragraph: {
                                    rich_text: createRichText(textContent)
                                }
                            });
                        }
                    }
                    break;
                }

                case 'IMG': {
                    const src = ImageUtils.extractImageSrc(node);
                    if (src) {
                        try {
                            const absoluteUrl = new URL(src, document.baseURI).href;
                            const cleanedUrl = ImageUtils.cleanImageUrl(absoluteUrl);

                            // 使用更嚴格的 Notion 兼容性檢查
                            const isCompatible = typeof ImageUtils !== 'undefined' && ImageUtils.isNotionCompatibleImageUrl
                                ? ImageUtils.isNotionCompatibleImageUrl(cleanedUrl)
                                : isValidImageUrl(cleanedUrl);

                            // 檢查是否為有效的圖片格式和 URL
                            if (cleanedUrl && isCompatible && !blocks.some(b => b.type === 'image' && b.image.external.url === cleanedUrl)) {
                                blocks.push({
                                    object: 'block',
                                    type: 'image',
                                    image: {
                                        type: 'external',
                                        external: { url: cleanedUrl }
                                    }
                                });
                                Logger.log(`Added image: ${cleanedUrl}`);
                            } else if (cleanedUrl && !isCompatible) {
                                Logger.warn(`Skipped incompatible image URL: ${cleanedUrl.substring(0, 100)}...`);
                            }
                        } catch (error) {
                            /*
                             * URL 處理錯誤：通常是無效的 URL 格式
                             * 記錄警告但不中斷處理流程
                             */
                            if (typeof ErrorHandler !== 'undefined') {
                                ErrorHandler.logError({
                                    type: 'invalid_url',
                                    context: `image URL processing: ${src}`,
                                    originalError: error,
                                    timestamp: Date.now()
                                });
                            } else {
                                Logger.warn(`Failed to process image URL: ${src}`, error);
                            }
                        }
                    }
                    break;
                }

                case 'LI': {
                    if (textContent) {
                        blocks.push({
                            object: 'block',
                            type: 'bulleted_list_item',
                            bulleted_list_item: {
                                rich_text: createRichText(textContent)
                            }
                        });
                    }
                    break;
                }

                case 'BLOCKQUOTE': {
                    if (textContent) {
                        blocks.push({
                            object: 'block',
                            type: 'quote',
                            quote: {
                                rich_text: createRichText(textContent)
                            }
                        });
                    }
                    break;
                }

                default: {
                    if (node.childNodes.length > 0) {
                        node.childNodes.forEach(child => processNodeToNotionBlock(child, blocks, createRichText));
                    }
                    break;
                }
            }
        }

        /**
         * 將 HTML 轉換為 Notion 區塊陣列
         * @param {string} html - HTML 字串
         * @returns {Array} Notion 區塊陣列
         */
        function convertHtmlToNotionBlocks(html) {
            const blocks = [];
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const createRichText = (text) => [{ type: 'text', text: { content: text } }];

            // 使用提取的獨立函數處理每個節點
            tempDiv.childNodes.forEach(node => processNodeToNotionBlock(node, blocks, createRichText));

            return blocks;
        }




        /**
         * 清理和標準化圖片 URL
         */
        function cleanImageUrl(url) {
            return ImageUtils.cleanImageUrl(url);
        }

        /**
         * 檢查 URL 是否為有效的圖片格式
         */
        // URL 驗證結果緩存
        const urlValidationCache = new Map();
        const MAX_CACHE_SIZE = 200;

        function isValidImageUrl(url) {
            if (!url || typeof url !== 'string') return false;

            // 檢查緩存
            if (urlValidationCache.has(url)) {
                return urlValidationCache.get(url);
            }

            // 使用統一的圖片 URL 驗證邏輯
            const result = ImageUtils.isValidImageUrl(url);

            // 緩存結果
            if (urlValidationCache.size >= MAX_CACHE_SIZE) {
                // 清理最舊的緩存項目
                const firstKey = urlValidationCache.keys().next().value;
                urlValidationCache.delete(firstKey);
            }
            urlValidationCache.set(url, result);

            return result;
        }


        /**
         * 優先收集封面圖/特色圖片（通常位於標題上方或文章開頭）
         */
        function collectFeaturedImage() {
            Logger.log('🎯 Attempting to collect featured/hero image...');

            // 常見的封面圖選擇器（按優先級排序）
            const featuredImageSelectors = [
                // WordPress 和常見 CMS
                '.featured-image img',
                '.hero-image img',
                '.cover-image img',
                '.post-thumbnail img',
                '.entry-thumbnail img',
                '.wp-post-image',

                // 文章頭部區域
                '.article-header img',
                'header.article-header img',
                '.post-header img',
                '.entry-header img',

                // 通用特色圖片容器
                'figure.featured img',
                'figure.hero img',
                '[class*="featured"] img:first-of-type',
                '[class*="hero"] img:first-of-type',
                '[class*="cover"] img:first-of-type',

                // 文章開頭的第一張圖片
                'article > figure:first-of-type img',
                'article > div:first-of-type img',
                '.article > figure:first-of-type img',
                '.post > figure:first-of-type img'
            ];

            for (const selector of featuredImageSelectors) {
                try {
                    const img = cachedQuery(selector, document, { single: true });
                    if (img) {
                        const src = ImageUtils.extractImageSrc(img);
                        if (src && isValidImageUrl(src)) {
                            Logger.log(`✓ Found featured image via selector: ${selector}`);
                            Logger.log(`  Image URL: ${src}`);
                            return src;
                        }
                    }
                } catch (error) {
                    /*
                     * DOM 查詢錯誤：可能是無效的選擇器或 DOM 結構問題
                     * 記錄警告並繼續嘗試下一個選擇器
                     */
                    if (typeof ErrorHandler !== 'undefined') {
                        ErrorHandler.logError({
                            type: 'dom_error',
                            context: `featured image selector: ${selector}`,
                            originalError: error,
                            timestamp: Date.now()
                        });
                    } else {
                        Logger.warn(`Error checking selector ${selector}:`, error);
                    }
                }
            }

            Logger.log('✗ No featured image found');
            return null;
        }

        /**
         * 收集頁面中的所有相關圖片，作為內容提取的補充
         */
        async function collectAdditionalImages(contentElement) {
            const additionalImages = [];

            // 策略 0: 優先查找封面圖/特色圖片（v2.5.6 新增）
            Logger.log('=== Image Collection Strategy 0: Featured Image ===');
            const featuredImage = collectFeaturedImage();
            if (featuredImage) {
                additionalImages.push(featuredImage);
                Logger.log('✓ Featured image added as first image');
            }

            // 策略 1: 從指定的內容元素收集
            Logger.log('=== Image Collection Strategy 1: Content Element ===');
            let allImages = [];
            if (contentElement) {
                // 使用緩存查詢優化性能
                const imgElements = typeof cachedQuery !== 'undefined' ?
                    cachedQuery('img', contentElement, { all: true }) :
                    contentElement.querySelectorAll('img');
                allImages = Array.from(imgElements);
                Logger.log(`Found ${allImages.length} images in content element`);
            }

            // 策略 2: 如果內容元素圖片少，從整個頁面的文章區域收集
            Logger.log('=== Image Collection Strategy 2: Article Regions ===');
            if (allImages.length < 3) {
                const articleSelectors = [
                    'article',
                    'main',
                    '[role="main"]',
                    '.article',
                    '.post',
                    '.entry-content',
                    '.post-content',
                    '.article-content'
                ];

                for (const selector of articleSelectors) {
                    const articleElement = typeof cachedQuery !== 'undefined' ?
                        cachedQuery(selector, document, { single: true }) :
                        document.querySelector(selector);
                    if (articleElement) {
                        const imgElements = typeof cachedQuery !== 'undefined' ?
                            cachedQuery('img', articleElement, { all: true }) :
                            articleElement.querySelectorAll('img');
                        const articleImages = Array.from(imgElements);
                        Logger.log(`Found ${articleImages.length} images in ${selector}`);
                        // 合併圖片，避免重複
                        articleImages.forEach(img => {
                            if (!allImages.includes(img)) {
                                allImages.push(img);
                            }
                        });
                        if (allImages.length >= 5) break; // 找到足夠的圖片就停止
                    }
                }
            }

            // 策略 3: 如果仍然沒有圖片（< 1張），謹慎地擴展搜索
            // 重要：排除明顯的非內容區域（header, footer, nav, sidebar, ads等）
            Logger.log('=== Image Collection Strategy 3: Selective Expansion ===');
            if (allImages.length < 1) {
                Logger.log("Very few images found, attempting selective expansion...");

                // 排除這些明顯的非內容區域
                const excludeSelectors = [
                    'header:not(.article-header):not(.post-header)', // 排除普通 header，但保留文章 header
                    'footer', 'nav', 'aside',
                    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
                    '.header:not(.article-header):not(.post-header)', // 排除普通 header，但保留文章 header
                    '.footer', '.navigation', '.nav', '.navbar',
                    '.sidebar', '.side-bar', '.widget', '.widgets',
                    '.comments', '.comment-list', '.comment-section', '.comment-area',
                    '.related', '.related-posts', '.related-articles', '.recommended',
                    '.advertisement', '.ads', '.ad', '.banner', '.ad-container',
                    '.social', '.social-share', '.share-buttons', '.social-links',
                    '.menu', '.site-header', '.site-footer', '.site-nav'
                ];

                // 獲取所有圖片（使用緩存查詢）
                const imgElements = typeof cachedQuery !== 'undefined' ?
                    cachedQuery('img', document, { all: true }) :
                    document.querySelectorAll('img');
                const docImages = Array.from(imgElements);

                // 過濾掉在排除區域中的圖片
                const filteredImages = docImages.filter(img => {
                    // 檢查圖片是否在任何排除區域內
                    for (const selector of excludeSelectors) {
                        const excludeElements = cachedQuery(selector, document);
                        for (const excludeEl of excludeElements) {
                            if (excludeEl.contains(img)) {
                                Logger.log(`✗ Excluded image in ${selector}`);
                                return false; // 圖片在排除區域內
                            }
                        }
                    }
                    return true; // 圖片不在任何排除區域內
                });

                Logger.log(`Filtered ${docImages.length} total images -> ${filteredImages.length} content images (excluded ${docImages.length - filteredImages.length} from non-content areas)`);

                // 只添加不重複的圖片，且限制最多添加的數量
                let addedFromExpansion = 0;
                filteredImages.forEach(img => {
                    if (!allImages.includes(img) && addedFromExpansion < 10) { // 最多從擴展搜索添加10張
                        allImages.push(img);
                        addedFromExpansion++;
                    }
                });

                if (addedFromExpansion > 0) {
                    Logger.log(`Added ${addedFromExpansion} images from selective expansion`);
                }
            }

            Logger.log(`Total images to process from strategies 1-3: ${allImages.length}`);

            // 使用批處理優化圖片處理性能
            if (typeof batchProcess !== 'undefined' && allImages.length > 5) {
                // 對於大量圖片使用批處理
                Logger.log(`🚀 Using batch processing for ${allImages.length} images`);

                try {
                    const processedImages = await batchProcess(allImages, (img, index) => {
                        return processImageForCollection(img, index, featuredImage);
                    });

                    // 收集有效的圖片結果
                    processedImages.forEach(result => {
                        if (result?.url) {
                            additionalImages.push(result);
                        }
                    });

                } catch (error) {
                    Logger.warn('Batch processing failed, falling back to sequential processing:', error);
                    // 回退到原始處理方式
                    processImagesSequentially(allImages, featuredImage, additionalImages);
                }
            } else {
                // 對於少量圖片或沒有批處理功能時使用順序處理
                processImagesSequentially(allImages, featuredImage, additionalImages);
            }

            Logger.log(`Successfully collected ${additionalImages.length} valid images`);
            return additionalImages;
        }

        /**
         * 處理單個圖片的收集邏輯
         * @param {HTMLImageElement} img - 圖片元素
         * @param {number} index - 圖片索引
         * @param {string} featuredImage - 封面圖片 URL
         * @returns {Object|null} 處理結果
         */
        function processImageForCollection(img, index, featuredImage) {
            const src = ImageUtils.extractImageSrc(img);
            if (!src) {
                Logger.log(`✗ No src found for image ${index + 1}`);
                return null;
            }

            try {
                const absoluteUrl = new URL(src, document.baseURI).href;
                const cleanedUrl = cleanImageUrl(absoluteUrl);

                if (!cleanedUrl || !isValidImageUrl(cleanedUrl)) {
                    Logger.log(`✗ Invalid image URL ${index + 1}: ${cleanedUrl || src}`);
                    return null;
                }

                // 避免重複添加封面圖
                if (featuredImage && cleanedUrl === featuredImage) {
                    Logger.log(`✗ Skipped duplicate featured image at index ${index + 1}`);
                    return null;
                }

                // 檢查圖片尺寸（性能優化：批量獲取尺寸信息）
                const width = img.naturalWidth || img.width || 0;
                const height = img.naturalHeight || img.height || 0;

                // 降低尺寸要求，只排除明顯的小圖標
                const isIcon = (width > 0 && width < 50) || (height > 0 && height < 50);
                const isSizeUnknown = width === 0 && height === 0;

                if (isIcon && !isSizeUnknown) {
                    Logger.log(`✗ Skipped small icon ${index + 1}: ${width}x${height}`);
                    return null;
                }

                Logger.log(`✓ Collected image ${index + 1}: ${cleanedUrl.substring(0, 80)}... (${width}x${height})`);
                return {
                    url: cleanedUrl,
                    alt: img.alt || '',
                    width: width,
                    height: height
                };

            } catch (error) {
                /*
                 * 圖片處理錯誤：可能是 URL 格式問題或 DOM 訪問錯誤
                 * 記錄詳細信息以便調試，但不中斷整體處理
                 */
                if (typeof ErrorHandler !== 'undefined') {
                    ErrorHandler.logError({
                        type: 'extraction_failed',
                        context: `image processing at index ${index + 1}: ${src}`,
                        originalError: error,
                        timestamp: Date.now()
                    });
                } else {
                    Logger.warn(`Failed to process image ${index + 1}: ${src}`, error);
                }
                return null;
            }
        }

        /**
         * 順序處理圖片（回退方案）
         * @param {Array} images - 圖片數組
         * @param {string} featuredImage - 封面圖片 URL
         * @param {Array} additionalImages - 收集結果數組
         */
        function processImagesSequentially(images, featuredImage, additionalImages) {
            images.forEach((img, index) => {
                const result = processImageForCollection(img, index, featuredImage);
                if (result) {
                    additionalImages.push(result);
                }
            });
        }



        // --- Main Execution ---
        /**
         * 嘗試展開頁面上常見的可折疊/懶載入內容，以便 Readability 能夠擷取隱藏的文本
         * Best-effort：會處理 <details>、aria-expanded/aria-hidden、常見 collapsed 類別 和 Bootstrap collapse
         */
    const expandCollapsibleElements = async (timeout = 300) => {
            try {
                const expanded = [];

                // 1) <details> 元素
                const details = Array.from(document.querySelectorAll('details:not([open])'));
                details.forEach(d => {
                    try {
                        d.setAttribute('open', '');
                        expanded.push(d);
                    } catch (e) {
                        Logger.warn('Failed to open <details> element', e);
                    }
                });

                // 2) aria-expanded 控制的按鈕/觸發器：嘗試找到與之對應的目標並展開
                const triggers = Array.from(document.querySelectorAll('[aria-expanded="false"]'));
                triggers.forEach(t => {
                    try {
                        // 直接設定 aria-expanded，並嘗試觸發 click
                        t.setAttribute('aria-expanded', 'true');
                        try { t.click(); } catch (e) { /* ignore click failures */ }

                        // 如果有 aria-controls，嘗試移除 aria-hidden 或 collapsed 類別
                        const ctrl = t.getAttribute && t.getAttribute('aria-controls');
                        if (ctrl) {
                            const target = document.getElementById(ctrl) || document.querySelector(`#${ctrl}`);
                            if (target) {
                                target.removeAttribute('aria-hidden');
                                target.classList.remove('collapsed');
                                target.classList.remove('collapse');
                                expanded.push(target);
                            }
                        }
                    } catch (e) {
                        // 忽略單一項目錯誤
                    }
                });

                // 3) 通用 collapsed / collapse 類別
                const collapsedEls = Array.from(document.querySelectorAll('.collapsed, .collapse:not(.show)'));
                collapsedEls.forEach(el => {
                    try {
                        el.classList.remove('collapsed');
                        el.classList.remove('collapse');
                        el.classList.add('expanded-by-clipper');
                        el.removeAttribute('aria-hidden');
                        expanded.push(el);
                    } catch (e) {
                        // 忽略
                    }
                });

                // 4) 常見 JS 會隱藏的屬性 (display:none) — 嘗試設為 block 但不破壞原本樣式
                const hiddenByStyle = Array.from(document.querySelectorAll('[style*="display:none"], [hidden]'));
                hiddenByStyle.forEach(el => {
                    try {
                        // 只針對有可能是折疊式內容的元素進行短暫顯示
                        const textLen = (el.textContent || '').trim().length;
                        if (textLen > 20) {
                            el.style.display = '';
                            el.removeAttribute('hidden');
                            expanded.push(el);
                        }
                    } catch (e) { }
                });

                // 等待短暫時間讓任何 JS 綁定或懶載入觸發
                await new Promise(res => setTimeout(res, timeout));

                Logger.log(`✅ expandCollapsibleElements: expanded ${expanded.length} candidates`);
                return expanded;
            } catch (error) {
                Logger.warn('expandCollapsibleElements failed:', error);
                return [];
            }
        }
        let finalContentHtml = null;
        let finalTitle = document.title;
        let contentElement = null;

        // 在使用 Readability 前嘗試展開折疊內容，以包含被隱藏的文字
        try {
            await expandCollapsibleElements(400);
        } catch (e) {
            Logger.warn('Error while expanding collapsible elements before parsing:', e);
        }


        // 額外等待動態內容載入（針對像 gemini-cli docs 這樣的 SPA 或懶載入網站）
        try {
            Logger.log('🔄 等待動態內容載入...');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 嘗試觸發任何懶載入機制
            const scrollableElements = document.querySelectorAll('[style*="overflow"]');
            scrollableElements.forEach(el => {
                try {
                    el.scrollTop = el.scrollHeight;
                    el.scrollLeft = el.scrollWidth;
                } catch (e) { /* ignore */ }
            });

            // 再等待一下讓懶載入內容出現
            await new Promise(resolve => setTimeout(resolve, 500));
            Logger.log('✅ 動態內容載入等待完成');
        } catch (e) {
            Logger.warn('動態內容載入等待失敗:', e);
        }

        /**
         * 創建優化的文檔副本以減少 DOM 克隆開銷
         * 移除不必要的元素來提升性能
         */
        const createOptimizedDocumentClone = () => {
            try {
                Logger.log('🔧 Creating optimized document clone for parsing...');

                // 克隆文檔
                const clonedDoc = document.cloneNode(true);

                // 性能優化：移除可能影響解析的元素
                const elementsToRemove = [
                    // 腳本和樣式（不會影響內容解析）
                    'script', 'style', 'link[rel="stylesheet"]',
                    // 廣告和追蹤元素
                    '[class*="ad"]', '[class*="advertisement"]', '[id*="ad"]',
                    '[class*="tracking"]', '[class*="analytics"]',
                    // 導航和側邊欄（通常不包含主要內容）
                    'nav', 'aside', '.sidebar', '.navigation', '.menu',
                    // 頁腳和頁眉（除非是文章的一部分）
                    'footer:not(.article-footer)', 'header:not(.article-header)',
                    // 社交媒體小部件
                    '[class*="social"]', '[class*="share"]',
                    // 評論區域
                    '.comments', '.comment-section',
                    // 隱藏元素（通常不是內容的一部分）
                    '[style*="display: none"]', '[hidden]'
                ];

                let removedCount = 0;
                elementsToRemove.forEach(selector => {
                    try {
                        const elements = clonedDoc.querySelectorAll(selector);
                        elements.forEach(el => {
                            el.remove();
                            removedCount++;
                        });
                    } catch (e) {
                        // 忽略選擇器錯誤，繼續處理其他選擇器
                        Logger.log(`⚠️ Failed to remove elements with selector: ${selector}`);
                    }
                });

                Logger.log(`🧹 Removed ${removedCount} non-content elements from cloned document`);
                Logger.log('📄 Optimized document ready for parsing');

                return clonedDoc;
            } catch (error) {
                Logger.error('❌ Failed to create optimized document clone:', error);
                // 回退到簡單克隆
                try {
                    return document.cloneNode(true);
                } catch (fallbackError) {
                    Logger.error('❌ Even fallback document cloning failed:', fallbackError);
                    return null;
                }
            }
        };

        /**
         * 優化的 Readability 內容解析
         * 包含性能優化、錯誤處理和邊緣情況處理
         */
        const parseArticleWithReadability = () => {
            // 1. 驗證 Readability 依賴項
            if (typeof Readability === 'undefined') {
                Logger.error('❌ Readability library is not available');
                throw new Error('Readability library not loaded');
            }

            Logger.log('🚀 Starting Readability content parsing...');

            // 2. 性能優化：創建優化的文檔副本
            const optimizedDocument = createOptimizedDocumentClone();
            if (!optimizedDocument) {
                throw new Error('Failed to create optimized document clone');
            }

            // 3. 執行 Readability 解析
            let readabilityInstance = null;
            let parsedArticle = null;

            try {
                // 診斷：檢查 Readability 是否可用
                Logger.log('📖 檢查 Readability 可用性...');
                if (typeof Readability === 'undefined') {
                    throw new Error('Readability 未定義 - 可能是腳本注入順序問題');
                }
                Logger.log('✅ Readability 已載入，類型:', typeof Readability);

                Logger.log('📖 Initializing Readability parser...');
                readabilityInstance = new Readability(optimizedDocument);

                Logger.log('🔍 Parsing document content...');
                parsedArticle = readabilityInstance.parse();

                Logger.log('✅ Readability parsing completed');
            } catch (parseError) {
                Logger.error('❌ Readability parsing failed:', parseError);
                throw new Error(`Readability parsing error: ${parseError.message}`);
            }

            // 4. 驗證解析結果
            if (!parsedArticle) {
                Logger.warn('⚠️ Readability returned null/undefined result');
                throw new Error('Readability parsing returned no result');
            }

            // 5. 驗證基本屬性
            if (!parsedArticle.content || typeof parsedArticle.content !== 'string') {
                Logger.warn('⚠️ Readability result missing or invalid content property');
                throw new Error('Parsed article has no valid content');
            }

            if (!parsedArticle.title || typeof parsedArticle.title !== 'string') {
                Logger.warn('⚠️ Readability result missing title, using document title as fallback');
                parsedArticle.title = document.title || 'Untitled Page';
            }

            Logger.log(`📊 Parsed article: ${parsedArticle.content.length} chars, title: "${parsedArticle.title}"`);
            return parsedArticle;
        };

        // 執行優化的 Readability 解析
        let article = null;
        try {
            article = parseArticleWithReadability();
        } catch (error) {
            Logger.error('❌ Article parsing failed completely:', error);
            // 設置為 null，讓後續的 fallback 機制處理
            article = null;
        }

        if (isContentGood(article)) {
            Logger.log("Successfully extracted content with Readability.js");
            finalContentHtml = article.content;
            finalTitle = article.title;
            // 創建一個臨時元素來查找圖片
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = finalContentHtml;
            contentElement = tempDiv;
        } else {
            // Readability 失敗或被拒絕：先使用 CMS-specific fallback
            finalContentHtml = findContentCmsFallback();
            if (finalContentHtml) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = finalContentHtml;
                contentElement = tempDiv;
            } else {
                // CMS fallback 也失敗，嘗試擷取大型清單（針對 CLI doc、reference pages）
                const listFallback = extractLargestListFallback();
                if (listFallback) {
                    Logger.log('✅ Using list fallback content');
                    finalContentHtml = listFallback;
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = finalContentHtml;
                    contentElement = tempDiv;
                }
            }
        }

        if (finalContentHtml) {
            Logger.log(`✅ Content extraction successful! Content length: ${finalContentHtml.length} characters`);
            const blocks = convertHtmlToNotionBlocks(finalContentHtml);

            // 收集額外的圖片（更積極的策略）
            const imageBlocks = blocks.filter(b => b.type === 'image');
            Logger.log("\n=== Image Collection Summary ===");
            Logger.log(`Images found in main content: ${imageBlocks.length}`);

            // 如果圖片少於5張，嘗試收集更多（提高閾值）
            if (imageBlocks.length < 5) {
                Logger.log("Attempting to collect additional images...");
                const additionalImages = await collectAdditionalImages(contentElement);
                const existingUrls = new Set(imageBlocks.map(b => b.image.external.url));

                let addedCount = 0;
                additionalImages.forEach(imgInfo => {
                    if (!existingUrls.has(imgInfo.url) && (imageBlocks.length + addedCount) < 15) { // 最多15張圖片
                        // 驗證圖片 URL 安全性
                        try {
                            const urlObj = new URL(imgInfo.url);
                            if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
                                Logger.warn(`⚠️ 跳過無效協議的圖片 URL: ${imgInfo.url}`);
                                return;
                            }
                            if (imgInfo.url.length > 2000) {
                                Logger.warn(`⚠️ 跳過過長的圖片 URL: ${imgInfo.url.substring(0, 100)}...`);
                                return;
                            }
                        } catch (urlError) {
                            Logger.warn(`⚠️ 跳過無效的圖片 URL: ${imgInfo.url}`, urlError);
                            return;
                        }

                        blocks.push({
                            object: 'block',
                            type: 'image',
                            image: {
                                type: 'external',
                                external: { url: imgInfo.url }
                            }
                        });
                        existingUrls.add(imgInfo.url);
                        addedCount++;
                        Logger.log(`✓ Added additional image ${addedCount}: ${imgInfo.url.substring(0, 80)}...`);
                    }
                });
                Logger.log(`Added ${addedCount} additional images`);
            }

            // 標記處理已移到 background.js 中，這裡不再處理

            const finalImageCount = blocks.filter(b => b.type === 'image').length;
            Logger.log("=== Final Result ===");
            Logger.log(`Total blocks: ${blocks.length}`);
            Logger.log(`Total images: ${finalImageCount}`);
            Logger.log(`Title: "${finalTitle}"`);
            Logger.log("================================\n");

            if (blocks.length > 0) {
                return { title: finalTitle, blocks: blocks, rawHtml: finalContentHtml };
            } else {
                Logger.log("❌ No blocks generated from content");
                // Return fallback content instead of continuing
                return {
                    title: finalTitle || document.title,
                    blocks: [{
                        object: 'block',
                        type: 'paragraph',
                        paragraph: {
                            rich_text: [{
                                type: 'text',
                                text: { content: 'Content was found but could not be converted to blocks.' }
                            }]
                        }
                    }],
                    rawHtml: finalContentHtml
                };
            }
        } else {
            Logger.log("❌ Content extraction failed completely");
            Logger.log("📊 Extraction attempt summary:");
            Logger.log(`- Readability.js: ${article ? 'Found article but failed quality check' : 'Failed to parse'}`);
            Logger.log("- CMS Fallback: Failed to find suitable content");
            Logger.log(`- Page title: "${document.title}"`);
            Logger.log(`- Page URL: ${window.location.href}`);
            Logger.log(`- Page text length: ${document.body ? document.body.textContent.length : 0} characters`);

            // 輸出性能統計（如果可用）
            if (typeof performanceOptimizer !== 'undefined' && performanceOptimizer) {
                try {
                    const performanceStats = performanceOptimizer.getPerformanceStats();
                    Logger.log('🚀 Content.js Performance Stats:', performanceStats);
                } catch (perfError) {
                    Logger.warn('Could not get performance stats:', perfError);
                }
            }

            return {
                title: document.title,
                blocks: [{
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: [{
                            type: 'text',
                            text: { content: 'Could not automatically extract article content.' }
                        }]
                    }
                }],
                rawHtml: finalContentHtml
            };
        }
    } catch (error) {
        console.error('❌ Critical error in content script:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            url: window.location.href,
            timestamp: new Date().toISOString()
        });

        // 輸出性能統計（如果可用）
        if (typeof performanceOptimizer !== 'undefined' && performanceOptimizer) {
            try {
                const performanceStats = performanceOptimizer.getPerformanceStats();
                console.log('🚀 Content.js Performance Stats (Error Case):', performanceStats);
            } catch (perfError) {
                console.warn('Could not get performance stats:', perfError);
            }
        }

        // Always return a valid structure even in case of critical errors
        return {
            title: document.title || 'Untitled Page',
            blocks: [{
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [{
                        type: 'text',
                        text: { content: `Content extraction failed: ${error.message || 'Unknown error'}. Please try again.` }
                    }]
                }
            }]
        };
    }
})().then(result => {
    // Safety check: ensure we always return a valid result
    if (!result || typeof result !== 'object') {
        console.warn('❌ Content script returned invalid result, providing fallback');
        return {
            title: document.title || 'Untitled Page',
            blocks: [{
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [{
                        type: 'text',
                        text: { content: 'Content extraction returned invalid result. Please try again.' }
                    }]
                }
            }]
        };
    }

    // Ensure required properties exist
    if (!result.title) {
        result.title = document.title || 'Untitled Page';
    }

    if (!result.blocks || !Array.isArray(result.blocks)) {
        result.blocks = [{
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: [{
                    type: 'text',
                    text: { content: 'Content extraction completed but no content blocks were generated.' }
                }]
            }
        }];
    }

    // 如果在單元測試環境，暴露結果到全域以便測試程式存取
    try {
        if (typeof window !== 'undefined' && window.__UNIT_TESTING__) {
            try { window.__notion_extraction_result = result; } catch (e) { /* ignore */ }
        }
    } catch (e) { /* ignore */ }

    return result;
}).catch(error => {
    console.error('❌ Async content script error:', error);
    return {
        title: document.title || 'Untitled Page',
        blocks: [{
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: [{
                    type: 'text',
                    text: { content: `Async content extraction failed: ${error.message || 'Unknown error'}` }
                }]
            }
        }]
    };
});
