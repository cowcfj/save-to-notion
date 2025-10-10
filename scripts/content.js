// This script is injected into the active tab.

/* global PerformanceOptimizer, ImageUtils, batchProcess, ErrorHandler */

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
                await performanceOptimizer.smartPrewarm(document);
                console.log('✓ PerformanceOptimizer initialized in content script with smart prewarming');
            } else {
                console.warn('⚠️ PerformanceOptimizer not available in content script, using fallback queries');
            }
        } catch (perfError) {
            console.warn('⚠️ PerformanceOptimizer initialization failed in content script:', perfError);
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
            console.warn('ImageUtils not available, using fallback implementations');
            window.ImageUtils = {
                cleanImageUrl: function (url) {
                    if (!url || typeof url !== 'string') return null;
                    try {
                        return new URL(url).href;
                    } catch (e) {
                        return null;
                    }
                },
                isValidImageUrl: function (url) {
                    if (!url || typeof url !== 'string') return false;
                    return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(url);
                },
                extractImageSrc: function (imgNode) {
                    if (!imgNode) return null;
                    return imgNode.getAttribute('src') || imgNode.getAttribute('data-src') || null;
                },
                generateImageCacheKey: function (imgNode) {
                    if (!imgNode) return 'null';
                    return (imgNode.getAttribute('src') || '') + '|' + (imgNode.className || '');
                }
            };
        }

        const MIN_CONTENT_LENGTH = 250;
        const MAX_LINK_DENSITY = 0.3;

        function isContentGood(article) {
            if (!article || !article.content || article.length < MIN_CONTENT_LENGTH) return false;

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = article.content;

            // 計算連結密度（link density）— 但對於以點列/參考為主的文件（像 CLI docs）
            // 我們允許例外：如果內容包含大量的 <li> 項目，則視為有效內容。
            const links = tempDiv.querySelectorAll ? tempDiv.querySelectorAll('a') : cachedQuery('a', tempDiv);
            let linkTextLength = 0;
            Array.from(links).forEach(link => linkTextLength += (link.textContent || '').length);
            const linkDensity = linkTextLength / Math.max(1, article.length);

            const liNodes = tempDiv.querySelectorAll ? tempDiv.querySelectorAll('li') : cachedQuery('li', tempDiv);
            const liCount = liNodes ? liNodes.length : 0;

            // 如果頁面以長清單為主（如文件、命令列清單），允許通過
            const LIST_EXCEPTION_THRESHOLD = 8; // 8個以上的<li> 視為 list-heavy
            if (liCount >= LIST_EXCEPTION_THRESHOLD) {
                console.log(`Readability.js content accepted as list-heavy (liCount=${liCount}) despite link density ${linkDensity.toFixed(2)}`);
                return true;
            }

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
                    console.log(`Found element with selector "${selector}": ${textLength} characters`);
                    if (textLength >= MIN_CONTENT_LENGTH) {
                        console.log(`✅ CMS content found with selector: ${selector} (${textLength} chars)`);
                        return element.innerHTML;
                    } else {
                        console.log(`❌ Content too short with selector: ${selector} (${textLength} < ${MIN_CONTENT_LENGTH})`);
                    }
                } else {
                    console.log(`❌ No element found with selector: ${selector}`);
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
                    console.log(`Found element with selector "${selector}": ${textLength} characters`);
                    if (textLength >= MIN_CONTENT_LENGTH) {
                        console.log(`✅ Article content found with selector: ${selector} (${textLength} chars)`);
                        return element.innerHTML;
                    } else {
                        console.log(`❌ Content too short with selector: ${selector} (${textLength} < ${MIN_CONTENT_LENGTH})`);
                    }
                } else {
                    console.log(`❌ No element found with selector: ${selector}`);
                }
            }

            // Strategy 4: Generic "biggest content block" as a final attempt
            console.log("🔍 CMS structure not found. Reverting to generic content finder...");
            console.log(`📏 Minimum content length required: ${MIN_CONTENT_LENGTH} characters`);

            const candidates = cachedQuery('article, section, main, div', document);
            console.log(`🎯 Found ${candidates.length} potential content candidates`);

            let bestElement = null;
            let maxScore = 0;
            let candidateCount = 0;

            for (const el of candidates) {
                const text = el.textContent?.trim() || '';
                candidateCount++;

                if (text.length < MIN_CONTENT_LENGTH) {
                    console.log(`❌ Candidate ${candidateCount}: Too short (${text.length} < ${MIN_CONTENT_LENGTH})`);
                    continue;
                }

                const paragraphs = cachedQuery('p', el).length;
                const images = cachedQuery('img', el).length;
                const links = cachedQuery('a', el).length;

                // 給圖片加分，因為我們想要包含圖片的內容
                const score = text.length + (paragraphs * 50) + (images * 30) - (links * 25);

                console.log(`📊 Candidate ${candidateCount}: ${text.length} chars, ${paragraphs}p, ${images}img, ${links}links, score: ${score}`);

                if (score > maxScore) {
                    // 避免選擇嵌套的父元素
                    if (bestElement && el.contains(bestElement)) {
                        console.log(`⚠️ Skipping nested parent element`);
                        continue;
                    }
                    maxScore = score;
                    bestElement = el;
                    console.log(`✅ New best candidate found with score: ${score}`);
                }
            }

            if (bestElement) {
                console.log(`🎉 Best content found with ${bestElement.textContent.trim().length} characters`);
                return bestElement.innerHTML;
            } else {
                console.log(`❌ No suitable content found. All ${candidateCount} candidates were too short or scored too low.`);

                // 最後的嘗試：降低標準
                console.log(`🔄 Trying with lower standards (${MIN_CONTENT_LENGTH / 2} chars)...`);
                for (const el of candidates) {
                    const text = el.textContent?.trim() || '';
                    if (text.length >= MIN_CONTENT_LENGTH / 2) {
                        console.log(`🆘 Emergency fallback: Found content with ${text.length} characters`);
                        return el.innerHTML;
                    }
                }

                console.log(`💥 Complete failure: No content found even with lower standards`);
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
                console.log('🔎 Running extractLargestListFallback to find large <ul>/<ol>');

                const lists = Array.from(document.querySelectorAll('ul, ol'));
                if (!lists || lists.length === 0) {
                    console.log('✗ No lists found on page');
                    return null;
                }

                // 評分：以 <li> 數量為主，並加上文字長度作為次要指標
                let best = null;
                let bestScore = 0;

                lists.forEach((list, idx) => {
                    const liItems = Array.from(list.querySelectorAll('li'));
                    const liCount = liItems.length;
                    const textLength = (list.textContent || '').trim().length;
                    const score = (liCount * 10) + Math.min(500, Math.floor(textLength / 10));

                    console.log(`List ${idx + 1}: liCount=${liCount}, textLength=${textLength}, score=${score}`);

                    // 過濾太短或只有單一項目的 list
                    if (liCount < 4) return;

                    if (score > bestScore) {
                        bestScore = score;
                        best = list;
                    }
                });

                if (best) {
                    console.log(`✅ extractLargestListFallback chose a list with score ${bestScore} and ${best.querySelectorAll('li').length} items`);
                    // 嘗試把周邊標題包含進去（若存在相鄰的 <h1>-<h3>）
                    let containerHtml = best.innerHTML;
                    const prev = best.previousElementSibling;
                    if (prev && /^H[1-3]$/.test(prev.nodeName)) {
                        containerHtml = prev.outerHTML + '\n' + containerHtml;
                        console.log('Included preceding heading in fallback content');
                    }
                    return containerHtml;
                }

                console.log('✗ No suitable large list found');
                return null;
            } catch (e) {
                console.warn('extractLargestListFallback failed:', e);
                return null;
            }
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
            const cacheKey = ImageUtils.generateImageCacheKey(imgNode);
            if (imageExtractionCache.has(cacheKey)) {
                return imageExtractionCache.get(cacheKey);
            }

            // 使用統一的圖片提取邏輯
            const result = ImageUtils.extractImageSrc(imgNode);

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
                        console.warn('Failed to open <details> element', e);
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

                console.log(`✅ expandCollapsibleElements: expanded ${expanded.length} candidates`);
                return expanded;
            } catch (error) {
                console.warn('expandCollapsibleElements failed:', error);
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
            console.warn('Error while expanding collapsible elements before parsing:', e);
        }

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
                    console.log('✅ Using list fallback content');
                    finalContentHtml = listFallback;
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = finalContentHtml;
                    contentElement = tempDiv;
                }
            }
        }

        if (finalContentHtml) {
            console.log(`✅ Content extraction successful! Content length: ${finalContentHtml.length} characters`);
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
            console.log(`Title: "${finalTitle}"`);
            console.log(`================================\n`);

            if (blocks.length > 0) {
                return { title: finalTitle, blocks: blocks, rawHtml: finalContentHtml };
            } else {
                console.log(`❌ No blocks generated from content`);
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
            console.log(`❌ Content extraction failed completely`);
            console.log(`📊 Extraction attempt summary:`);
            console.log(`- Readability.js: ${article ? 'Found article but failed quality check' : 'Failed to parse'}`);
            console.log(`- CMS Fallback: Failed to find suitable content`);
            console.log(`- Page title: "${document.title}"`);
            console.log(`- Page URL: ${window.location.href}`);
            console.log(`- Page text length: ${document.body ? document.body.textContent.length : 0} characters`);

            // 輸出性能統計（如果可用）
            if (performanceOptimizer) {
                const performanceStats = performanceOptimizer.getPerformanceStats();
                console.log('🚀 Content.js Performance Stats:', performanceStats);
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
