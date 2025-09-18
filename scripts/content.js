// This script is injected into the active tab.

(function() {

    const MIN_CONTENT_LENGTH = 250;
    const MAX_LINK_DENSITY = 0.3;

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
     * A new, CMS-aware fallback function. It specifically looks for patterns
     * found in CMS like Drupal and other common website structures.
     * @returns {string|null} The combined innerHTML of the article components.
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
            'data-real-src'
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
        
        return null;
    }

    /**
     * 檢查 URL 是否為有效的圖片格式
     */
    function isValidImageUrl(url) {
        if (!url || typeof url !== 'string') return false;
        
        // 檢查是否為有效的 HTTP/HTTPS URL
        if (!url.match(/^https?:\/\//i)) return false;
        
        // 檢查常見的圖片文件擴展名
        const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif)(\?.*)?$/i;
        
        // 如果 URL 包含圖片擴展名，直接返回 true
        if (imageExtensions.test(url)) return true;
        
        // 對於沒有明確擴展名的 URL（如 CDN 圖片），檢查是否包含圖片相關的路徑
        const imagePathPatterns = [
            /\/image[s]?\//i,
            /\/img[s]?\//i,
            /\/photo[s]?\//i,
            /\/picture[s]?\//i,
            /\/media\//i,
            /\/upload[s]?\//i,
            /\/asset[s]?\//i,
            /\/file[s]?\//i
        ];
        
        return imagePathPatterns.some(pattern => pattern.test(url));
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
                            // 檢查是否為有效的圖片格式和 URL
                            if (isValidImageUrl(absoluteUrl) && !blocks.some(b => b.type === 'image' && b.image.external.url === absoluteUrl)) {
                                blocks.push({ 
                                    object: 'block', 
                                    type: 'image', 
                                    image: { 
                                        type: 'external', 
                                        external: { url: absoluteUrl } 
                                    } 
                                });
                                console.log(`Added image: ${absoluteUrl}`);
                            }
                        } catch (e) { 
                            console.warn(`Failed to process image URL: ${src}`, e);
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
     * 收集頁面中的所有相關圖片，作為內容提取的補充
     */
    function collectAdditionalImages(contentElement) {
        const additionalImages = [];
        const allImages = contentElement ? contentElement.querySelectorAll('img') : document.querySelectorAll('img');
        
        allImages.forEach(img => {
            const src = extractImageSrc(img);
            if (src) {
                try {
                    const absoluteUrl = new URL(src, document.baseURI).href;
                    if (isValidImageUrl(absoluteUrl)) {
                        // 檢查圖片是否足夠大（避免收集小圖標）
                        const width = img.naturalWidth || img.width || 0;
                        const height = img.naturalHeight || img.height || 0;
                        
                        // 只收集尺寸合理的圖片（寬度或高度至少 100px）
                        if (width >= 100 || height >= 100 || (width === 0 && height === 0)) {
                            additionalImages.push({
                                url: absoluteUrl,
                                alt: img.alt || '',
                                width: width,
                                height: height
                            });
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to process additional image: ${src}`, e);
                }
            }
        });
        
        return additionalImages;
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
        
        // 收集額外的圖片（如果主要內容中沒有足夠的圖片）
        const imageBlocks = blocks.filter(b => b.type === 'image');
        if (imageBlocks.length < 3) { // 如果圖片少於3張，嘗試收集更多
            const additionalImages = collectAdditionalImages(contentElement);
            const existingUrls = new Set(imageBlocks.map(b => b.image.external.url));
            
            additionalImages.forEach(imgInfo => {
                if (!existingUrls.has(imgInfo.url) && imageBlocks.length < 10) { // 最多10張圖片
                    blocks.push({
                        object: 'block',
                        type: 'image',
                        image: {
                            type: 'external',
                            external: { url: imgInfo.url }
                        }
                    });
                    existingUrls.add(imgInfo.url);
                    console.log(`Added additional image: ${imgInfo.url}`);
                }
            });
        }
        
        if (blocks.length > 0) {
            console.log(`Final content extracted with ${blocks.length} blocks, including ${blocks.filter(b => b.type === 'image').length} images`);
            return { title: finalTitle, blocks: blocks };
        }
    }

    return {
        title: document.title,
        blocks: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'Could not automatically extract article content.' } }] } }]
    };
})();
