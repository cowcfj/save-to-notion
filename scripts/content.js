// This script is injected into the active tab.

(async function () {
    // 初始化性能優化器（如果可用）
    let performanceOptimizer = null;
    if (typeof PerformanceOptimizer !== 'undefined') {
        performanceOptimizer = new PerformanceOptimizer({
            enableCache: true,
            enableBatching: true,
            enableMetrics: true
        });

        // 預加載關鍵選擇器
        const criticalSelectors = [
            'img[src]', 'img[data-src]', 'img[data-lazy-src]',
            'article', 'main', '.content', '.post-content', '.entry-content',
            '.node__content', '.field--name-field-image', '.field--name-field-body'
        ];
        performanceOptimizer.preloadSelectors(criticalSelectors);
    }

    // 便捷的緩存查詢函數
    function cachedQuery(selector, context = document, options = {}) {
        if (performanceOptimizer) {
            return performanceOptimizer.cachedQuery(selector, context, options);
        }
        // 回退到原生查詢
        return options.single ? context.querySelector(selector) : context.querySelectorAll(selector);
    }

    const MIN_CONTENT_LENGTH = 250;
    const MAX_LINK_DENSITY = 0.3;

    function isContentGood(article) {
        if (!article || !article.content || article.length < MIN_CONTENT_LENGTH) return false;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = article.content;
        const links = cachedQuery('a', tempDiv);
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
     * A new, CMS-aware fallback function. It specifically looks for patterns
     * found in CMS like Drupal and other common website structures.
     * @returns {string|null} The combined innerHTML of the article components.
     */
    function findContentCmsFallback() {
        console.log("Executing CMS-aware fallback finder...");

        // Strategy 1: Look for Drupal's typical structure
        const drupalNodeContent = cachedQuery('.node__content', document, { single: true });
        if (drupalNodeContent) {
            const imageField = cachedQuery('.field--name-field-image', drupalNodeContent, { single: true });
            const bodyField = cachedQuery('.field--name-field-body', drupalNodeContent, { single: true });

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
            const element = cachedQuery(selector, document, { single: true });
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
            const element = cachedQuery(selector, document, { single: true });
            if (element && element.textContent.trim().length >= MIN_CONTENT_LENGTH) {
                console.log(`Article content found with selector: ${selector}`);
                return element.innerHTML;
            }
        }

        // Strategy 4: Generic "biggest content block" as a final attempt
        console.log("CMS structure not found. Reverting to generic content finder.");
        const candidates = cachedQuery('article, section, main, div', document);
        let bestElement = null;
        let maxScore = 0;
        for (const el of candidates) {
            const text = el.textContent?.trim() || '';
            if (text.length < MIN_CONTENT_LENGTH) continue;
            const paragraphs = cachedQuery('p', el).length;
            const images = cachedQuery('img', el).length;
            const links = cachedQuery('a', el).length;
            // 給圖片加分，因為我們想要包含圖片的內容
            const score = text.length + (paragraphs * 50) + (images * 30) - (links * 25);
            if (score > maxScore) {
                if (bestElement && el.contains(bestElement)) continue;
                maxScore = score;
                bestElement = el;
            }
        }
        return bestElement ? bestElement.innerHTML : null;
    }

    /**
     * 提取圖片的 src 屬性，支持多種懶加載和響應式圖片格式
     */
    // 圖片提取結果緩存
    const imageExtractionCache = new Map();
    const MAX_EXTRACTION_CACHE_SIZE = 100;

    function extractImageSrc(imgNode) {
        if (!imgNode) return null;

        // 生成緩存鍵（基於元素的關鍵屬性）
        const cacheKey = generateImageCacheKey(imgNode);
        if (imageExtractionCache.has(cacheKey)) {
            return imageExtractionCache.get(cacheKey);
        }

        // 擴展的圖片屬性列表，涵蓋更多懶加載和響應式圖片的情況
        const imageAttrs = [
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
            'data-origin',
            'data-echo'
        ];

        // 首先檢查 srcset 屬性（響應式圖片）
        const srcset = imgNode.getAttribute('srcset') || imgNode.getAttribute('data-srcset') || imgNode.getAttribute('data-lazy-srcset');
        if (srcset) {
            // 從 srcset 中提取最大寬度（w 描述）的圖片，否則回退最後一個
            const srcsetEntries = srcset.split(',').map(entry => entry.trim());
            if (srcsetEntries.length > 0) {
                let bestUrl = null;
                let bestW = -1;
                for (const entry of srcsetEntries) {
                    const [url, descriptor] = entry.split(/\s+/);
                    if (url && !url.startsWith('data:')) {
                        const match = descriptor && descriptor.match(/(\d+)w/i);
                        if (match) {
                            const w = parseInt(match[1], 10);
                            if (w > bestW) {
                                bestW = w;
                                bestUrl = url;
                            }
                        } else {
                            // 若無 w 描述，暫存作為回退
                            bestUrl = bestUrl || url;
                        }
                    }
                }
                if (bestUrl) {
                    // 緩存成功結果
                    if (imageExtractionCache.size >= MAX_EXTRACTION_CACHE_SIZE) {
                        const firstKey = imageExtractionCache.keys().next().value;
                        imageExtractionCache.delete(firstKey);
                    }
                    imageExtractionCache.set(cacheKey, bestUrl);
                    return bestUrl;
                }
                // 回退：取最後一個（通常是最大尺寸）
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
        // 背景圖片回退（僅在前面取不到時嘗試，避免性能負擔）
        try {
            const cs = window.getComputedStyle && window.getComputedStyle(imgNode);
            const bg = cs && cs.getPropertyValue('background-image');
            const m = bg && bg.match(/url\(["']?(.*?)["']?\)/i);
            if (m && m[1] && !m[1].startsWith('data:')) {
                return m[1];
            }
            // 父節點 figure/div 的背景圖
            const parent = imgNode.parentElement;
            if (parent) {
                const cs2 = window.getComputedStyle && window.getComputedStyle(parent);
                const bg2 = cs2 && cs2.getPropertyValue('background-image');
                const m2 = bg2 && bg2.match(/url\(["']?(.*?)["']?\)/i);
                if (m2 && m2[1] && !m2[1].startsWith('data:')) {
                    return m2[1];
                }
            }
        } catch (error) {
            /* 
             * 最佳努力回退策略：忽略樣式計算錯誤
             * 常見錯誤：SecurityError (跨域)、InvalidStateError (元素已移除)
             * 這些錯誤不影響主要功能，可以安全忽略
             */
            if (typeof ErrorHandler !== 'undefined') {
                ErrorHandler.logError({
                    type: 'dom_error',
                    context: 'background image extraction',
                    originalError: error,
                    timestamp: Date.now()
                });
            }
        }

        // 檢查父元素是否為 <picture> 元素
        if (imgNode.parentElement && imgNode.parentElement.nodeName === 'PICTURE') {
            const sources = cachedQuery('source', imgNode.parentElement);
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

        const result = null;

        // 緩存結果
        if (imageExtractionCache.size >= MAX_EXTRACTION_CACHE_SIZE) {
            // 清理最舊的緩存項目
            const firstKey = imageExtractionCache.keys().next().value;
            imageExtractionCache.delete(firstKey);
        }
        imageExtractionCache.set(cacheKey, result);

        return result;
    }

    /**
     * 生成圖片元素的緩存鍵
     * @param {HTMLImageElement} imgNode - 圖片元素
     * @returns {string} 緩存鍵
     */
    function generateImageCacheKey(imgNode) {
        if (!imgNode) return 'null';

        // 使用元素的關鍵屬性生成唯一鍵
        const src = imgNode.getAttribute('src') || '';
        const dataSrc = imgNode.getAttribute('data-src') || '';
        const srcset = imgNode.getAttribute('srcset') || '';
        const className = imgNode.className || '';

        // 創建簡短但唯一的鍵
        const keyData = `${src}|${dataSrc}|${srcset}|${className}`;
        return keyData.length > 100 ? keyData.substring(0, 100) : keyData;
    }

    /**
     * 清理和標準化圖片 URL
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

        const result = imagePathPatterns.some(pattern => pattern.test(cleanedUrl));

        // 緩存結果
        if (urlValidationCache.size >= MAX_CACHE_SIZE) {
            // 清理最舊的緩存項目
            const firstKey = urlValidationCache.keys().next().value;
            urlValidationCache.delete(firstKey);
        }
        urlValidationCache.set(url, result);

        return result;
    }

    function convertHtmlToNotionBlocks(html) {
        const blocks = [];
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const createRichText = (text) => [{ type: 'text', text: { content: text } }];

        function processNode(node) {
            if (node.nodeType !== 1) return;
            const textContent = node.textContent?.trim();

            switch (node.nodeName) {
                case 'H1': case 'H2': case 'H3':
                    if (textContent) blocks.push({ object: 'block', type: `heading_${node.nodeName[1]}`, [`heading_${node.nodeName[1]}`]: { rich_text: createRichText(textContent) } });
                    break;
                case 'P':
                    if (textContent) blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: createRichText(textContent) } });
                    break;
                case 'IMG':
                    const src = extractImageSrc(node);
                    if (src) {
                        try {
                            const absoluteUrl = new URL(src, document.baseURI).href;
                            const cleanedUrl = cleanImageUrl(absoluteUrl);

                            // 檢查是否為有效的圖片格式和 URL
                            if (cleanedUrl && isValidImageUrl(cleanedUrl) && !blocks.some(b => b.type === 'image' && b.image.external.url === cleanedUrl)) {
                                blocks.push({
                                    object: 'block',
                                    type: 'image',
                                    image: {
                                        type: 'external',
                                        external: { url: cleanedUrl }
                                    }
                                });
                                console.log(`Added image: ${cleanedUrl}`);
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
                                console.warn(`Failed to process image URL: ${src}`, error);
                            }
                        }
                    }
                    break;
                case 'LI':
                    if (textContent) blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: createRichText(textContent) } });
                    break;
                case 'BLOCKQUOTE':
                    if (textContent) blocks.push({ object: 'block', type: 'quote', quote: { rich_text: createRichText(textContent) } });
                    break;
                default:
                    if (node.childNodes.length > 0) node.childNodes.forEach(processNode);
                    break;
            }
        }
        tempDiv.childNodes.forEach(processNode);
        return blocks;
    }

    /**
     * 優先收集封面圖/特色圖片（通常位於標題上方或文章開頭）
     */
    function collectFeaturedImage() {
        console.log('🎯 Attempting to collect featured/hero image...');

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
                    const src = extractImageSrc(img);
                    if (src && isValidImageUrl(src)) {
                        console.log(`✓ Found featured image via selector: ${selector}`);
                        console.log(`  Image URL: ${src}`);
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
                    console.warn(`Error checking selector ${selector}:`, error);
                }
            }
        }

        console.log('✗ No featured image found');
        return null;
    }

    /**
     * 收集頁面中的所有相關圖片，作為內容提取的補充
     */
    async function collectAdditionalImages(contentElement) {
        const additionalImages = [];

        // 策略 0: 優先查找封面圖/特色圖片（v2.5.6 新增）
        console.log('=== Image Collection Strategy 0: Featured Image ===');
        const featuredImage = collectFeaturedImage();
        if (featuredImage) {
            additionalImages.push(featuredImage);
            console.log('✓ Featured image added as first image');
        }

        // 策略 1: 從指定的內容元素收集
        console.log('=== Image Collection Strategy 1: Content Element ===');
        let allImages = [];
        if (contentElement) {
            // 使用緩存查詢優化性能
            const imgElements = typeof cachedQuery !== 'undefined' ?
                cachedQuery('img', contentElement, { all: true }) :
                contentElement.querySelectorAll('img');
            allImages = Array.from(imgElements);
            console.log(`Found ${allImages.length} images in content element`);
        }

        // 策略 2: 如果內容元素圖片少，從整個頁面的文章區域收集
        console.log('=== Image Collection Strategy 2: Article Regions ===');
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
                    console.log(`Found ${articleImages.length} images in ${selector}`);
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
        console.log('=== Image Collection Strategy 3: Selective Expansion ===');
        if (allImages.length < 1) {
            console.log(`Very few images found, attempting selective expansion...`);

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
                            console.log(`✗ Excluded image in ${selector}`);
                            return false; // 圖片在排除區域內
                        }
                    }
                }
                return true; // 圖片不在任何排除區域內
            });

            console.log(`Filtered ${docImages.length} total images -> ${filteredImages.length} content images (excluded ${docImages.length - filteredImages.length} from non-content areas)`);

            // 只添加不重複的圖片，且限制最多添加的數量
            let addedFromExpansion = 0;
            filteredImages.forEach(img => {
                if (!allImages.includes(img) && addedFromExpansion < 10) { // 最多從擴展搜索添加10張
                    allImages.push(img);
                    addedFromExpansion++;
                }
            });

            if (addedFromExpansion > 0) {
                console.log(`Added ${addedFromExpansion} images from selective expansion`);
            }
        }

        console.log(`Total images to process from strategies 1-3: ${allImages.length}`);

        // 使用批處理優化圖片處理性能
        if (typeof batchProcess !== 'undefined' && allImages.length > 5) {
            // 對於大量圖片使用批處理
            console.log(`🚀 Using batch processing for ${allImages.length} images`);

            try {
                const processedImages = await batchProcess(allImages, (img, index) => {
                    return processImageForCollection(img, index, featuredImage);
                });

                // 收集有效的圖片結果
                processedImages.forEach(result => {
                    if (result && result.url) {
                        additionalImages.push(result);
                    }
                });

            } catch (error) {
                console.warn('Batch processing failed, falling back to sequential processing:', error);
                // 回退到原始處理方式
                processImagesSequentially(allImages, featuredImage, additionalImages);
            }
        } else {
            // 對於少量圖片或沒有批處理功能時使用順序處理
            processImagesSequentially(allImages, featuredImage, additionalImages);
        }

        console.log(`Successfully collected ${additionalImages.length} valid images`);
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
        const src = extractImageSrc(img);
        if (!src) {
            console.log(`✗ No src found for image ${index + 1}`);
            return null;
        }

        try {
            const absoluteUrl = new URL(src, document.baseURI).href;
            const cleanedUrl = cleanImageUrl(absoluteUrl);

            if (!cleanedUrl || !isValidImageUrl(cleanedUrl)) {
                console.log(`✗ Invalid image URL ${index + 1}: ${cleanedUrl || src}`);
                return null;
            }

            // 避免重複添加封面圖
            if (featuredImage && cleanedUrl === featuredImage) {
                console.log(`✗ Skipped duplicate featured image at index ${index + 1}`);
                return null;
            }

            // 檢查圖片尺寸（性能優化：批量獲取尺寸信息）
            const width = img.naturalWidth || img.width || 0;
            const height = img.naturalHeight || img.height || 0;

            // 降低尺寸要求，只排除明顯的小圖標
            const isIcon = (width > 0 && width < 50) || (height > 0 && height < 50);
            const isSizeUnknown = width === 0 && height === 0;

            if (isIcon && !isSizeUnknown) {
                console.log(`✗ Skipped small icon ${index + 1}: ${width}x${height}`);
                return null;
            }

            console.log(`✓ Collected image ${index + 1}: ${cleanedUrl.substring(0, 80)}... (${width}x${height})`);
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
                console.warn(`Failed to process image ${index + 1}: ${src}`, error);
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
    let finalContentHtml = null;
    let finalTitle = document.title;
    let contentElement = null;
    const article = new Readability(document.cloneNode(true)).parse();

    if (isContentGood(article)) {
        console.log("Successfully extracted content with Readability.js");
        finalContentHtml = article.content;
        finalTitle = article.title;
        // 創建一個臨時元素來查找圖片
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = finalContentHtml;
        contentElement = tempDiv;
    } else {
        finalContentHtml = findContentCmsFallback();
        if (finalContentHtml) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = finalContentHtml;
            contentElement = tempDiv;
        }
    }

    if (finalContentHtml) {
        const blocks = convertHtmlToNotionBlocks(finalContentHtml);

        // 收集額外的圖片（更積極的策略）
        const imageBlocks = blocks.filter(b => b.type === 'image');
        console.log(`\n=== Image Collection Summary ===`);
        console.log(`Images found in main content: ${imageBlocks.length}`);

        // 如果圖片少於5張，嘗試收集更多（提高閾值）
        if (imageBlocks.length < 5) {
            console.log(`Attempting to collect additional images...`);
            const additionalImages = await collectAdditionalImages(contentElement);
            const existingUrls = new Set(imageBlocks.map(b => b.image.external.url));

            let addedCount = 0;
            additionalImages.forEach(imgInfo => {
                if (!existingUrls.has(imgInfo.url) && (imageBlocks.length + addedCount) < 15) { // 最多15張圖片
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
                    console.log(`✓ Added additional image ${addedCount}: ${imgInfo.url.substring(0, 80)}...`);
                }
            });
            console.log(`Added ${addedCount} additional images`);
        }

        // 標記處理已移到 background.js 中，這裡不再處理

        const finalImageCount = blocks.filter(b => b.type === 'image').length;
        console.log(`=== Final Result ===`);
        console.log(`Total blocks: ${blocks.length}`);
        console.log(`Total images: ${finalImageCount}`);
        console.log(`================================\n`);

        if (blocks.length > 0) {
            return { title: finalTitle, blocks: blocks };
        }
    }

    // 輸出性能統計（如果可用）
    if (performanceOptimizer) {
        const performanceStats = performanceOptimizer.getPerformanceStats();
        console.log('🚀 Content.js Performance Stats:', performanceStats);
    }

    return {
        title: document.title,
        blocks: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'Could not automatically extract article content.' } }] } }]
    };
})();
