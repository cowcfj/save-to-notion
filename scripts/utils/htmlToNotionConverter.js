/**
 * HTML to Notion Blocks Converter
 * 使用 Turndown 將 HTML 轉換為 Markdown，再轉換為 Notion blocks
 * 保留格式：列表、代碼塊、標題、粗體、斜體等
 */

// 注意：這個文件將被注入到頁面中，所以需要使用全局變數
// 確保 Logger 可用（從 utils.js 或其他地方）
if (typeof window.Logger === 'undefined') {
    Logger = console; // 回退到 console
}

// Turndown 庫需要在使用前加載

/**
 * 初始化 Turndown 服務
 */
function initTurndownService() {
    if (typeof TurndownService === 'undefined') {
        Logger.warn('⚠️ TurndownService not loaded, using fallback');
        return null;
    }

    const turndownService = new TurndownService({
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        fence: '```',
        emDelimiter: '_',
        strongDelimiter: '**',
        linkStyle: 'inlined',
        linkReferenceStyle: 'full',
        // 保留嵌套列表的縮排
        blankReplacement: function (content, node) {
            return node.isBlock ? '\n\n' : '';
        }
    });

    // 添加 GitHub Flavored Markdown 支持（如果有）
    if (typeof turndownPluginGfm !== 'undefined') {
        turndownService.use(turndownPluginGfm.gfm);
    }

    // 自定義規則：保留嵌套列表結構
    turndownService.addRule('nestedLists', {
        filter: ['ul', 'ol'],
        replacement: function (content, node, options) {
            const parent = node.parentNode;
            if (parent && (parent.nodeName === 'LI')) {
                // 這是嵌套列表，添加適當的縮排
                const lines = content.trim().split('\n');
                const indentedLines = lines.map(line => {
                    if (line.trim()) {
                        return '  ' + line; // 每層嵌套添加2個空格
                    }
                    return line;
                });
                return '\n' + indentedLines.join('\n') + '\n';
            }
            return content;
        }
    });

    // 自定義規則：保留代碼塊的語言標記
    turndownService.addRule('fencedCodeBlock', {
        filter: function (node, options) {
            return (
                options.codeBlockStyle === 'fenced' &&
                node.nodeName === 'PRE' &&
                node.firstChild &&
                node.firstChild.nodeName === 'CODE'
            );
        },
        replacement: function (content, node, options) {
            const className = node.firstChild.getAttribute('class') || '';
            const language = (className.match(/language-(\S+)/) ||
                            className.match(/lang-(\S+)/) ||
                            className.match(/highlight-source-(\S+)/) ||
                            [])[1] || '';

            const code = node.firstChild.textContent;
            const fence = options.fence;

            return '\n\n' + fence + language + '\n' +
                   code.replace(/\n$/, '') + '\n' +
                   fence + '\n\n';
        }
    });

    // 自定義規則：改進連結處理，確保正確的 Markdown 連結格式
    turndownService.addRule('improvedLinks', {
        filter: 'a',
        replacement: function (content, node) {
            const href = node.getAttribute('href');
            const title = node.getAttribute('title');

            if (!href) {
                return content; // 沒有連結，直接返回文本
            }

            // 對於 Markdown 網站，採用保守策略：只保留絕對 URL
            if (isValidAbsoluteUrl(href)) {
                // 標準 Markdown 連結格式
                let result = '[' + content + '](' + href;
                if (title) {
                    result += ' "' + title + '"';
                }
                result += ')';
                return result;
            } else {
                // 相對路徑、錨點連結等，直接返回文本避免 Notion API 問題

                return content;
            }
        }
    });

    return turndownService;
}

/**
 * 將 Markdown 轉換為 Notion blocks
 * 支持：標題、段落、列表（嵌套）、代碼塊、引用等
 */
function convertMarkdownToNotionBlocks(markdown) {
    const blocks = [];
    const lines = markdown.split('\n');



    const startTime = Date.now();
    const maxProcessingTime = 30000; // 30秒超時

    let i = 0;
    let inCodeBlock = false;
    let codeContent = [];
    let codeLanguage = 'plain text';

    // 列表處理堆疊：用於追蹤嵌套層級
    let listStack = [];

    // 統計資訊
    const stats = {
        images: 0,
        headings: 0,
        paragraphs: 0,
        lists: 0,
        codeBlocks: 0,
        quotes: 0,
        dividers: 0
    };

    // 輔助函數：清空列表堆疊，將頂層列表項加入 blocks
    function flushListStack() {
        if (listStack.length > 0) {

            // 只將頂層（level 0）的項目加入 blocks
            listStack.forEach(item => {
                if (item.level === 0) {
                    blocks.push(item.block);
                }
            });

            listStack = [];
        }
    }

    const markdownImageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g;

    function appendImageBlock(url, altText) {
        blocks.push({
            object: 'block',
            type: 'image',
            image: {
                type: 'external',
                external: { url },
                caption: altText ? [{ type: 'text', text: { content: altText } }] : []
            }
        });
        stats.images = (stats.images || 0) + 1;
    }

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        const imageMatches = [...trimmed.matchAll(markdownImageRegex)]
            .filter(match => isValidAbsoluteUrl(match[2]));

        // 進度追蹤（每10行報告一次，提供詳細信息）
        if (i > 0 && i % 10 === 0) {
            const elapsed = Date.now() - startTime;
            Logger.info(`📈 [進度] 已處理 ${i}/${lines.length} 行 (${elapsed}ms)`);
        }

        // 安全檢查：避免無限循環和超時
        const startI = i;
        const elapsed = Date.now() - startTime;
        if (elapsed > maxProcessingTime) {
            Logger.error(`❌ Processing timeout after ${elapsed}ms at line ${i}/${lines.length}`);
            Logger.error(`Current line: "${trimmed}"`);
            break;
        }

        try {
            // 處理代碼塊
            if (trimmed.startsWith('```')) {
                flushListStack(); // 代碼塊前清空列表
                if (inCodeBlock) {
                    // 結束代碼塊
                    if (codeContent.length > 0) {
                        blocks.push({
                            object: 'block',
                            type: 'code',
                            code: {
                                rich_text: [{
                                    type: 'text',
                                    text: { content: codeContent.join('\n') }
                                }],
                                language: codeLanguage
                            }
                        });
                        stats.codeBlocks++;
                    }
                    inCodeBlock = false;
                    codeContent = [];
                    codeLanguage = 'plain text';
                } else {
                    // 開始代碼塊
                    inCodeBlock = true;
                    const lang = trimmed.substring(3).trim();
                    codeLanguage = mapLanguage(lang) || 'plain text';
                }
                i++;
                continue;
            }

            if (inCodeBlock) {
                codeContent.push(line);
                i++;
                continue;
            }

            // 處理純圖片行
            if (imageMatches.length > 0 && trimmed.replace(markdownImageRegex, '').trim() === '') {
                flushListStack();
                imageMatches.forEach(match => {
                    const url = match[2];
                    const alt = match[1]?.trim();
                    appendImageBlock(url, alt);
                });
                i++;
                continue;
            }

            // 處理標題
            const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                flushListStack(); // 標題前清空列表
                const level = headingMatch[1].length;
                const text = headingMatch[2];
                const blockType = level === 1 ? 'heading_1' :
                                level === 2 ? 'heading_2' : 'heading_3';

                blocks.push({
                    object: 'block',
                    type: blockType,
                    [blockType]: {
                        rich_text: parseRichText(text)
                    }
                });
                stats.headings++;
                i++;
                continue;
            }

            // 處理無序列表（簡化處理，直接添加到 blocks）
            const unorderedListMatch = trimmed.match(/^[-*+]\s+(.+)$/);
            if (unorderedListMatch) {
                flushListStack(); // 清空之前的列表堆疊
                const content = unorderedListMatch[1];

                blocks.push({
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: {
                        rich_text: parseRichText(content)
                    }
                });
                stats.lists++;
                i++;
                continue;
            }

            // 處理有序列表（簡化處理，直接添加到 blocks）
            const orderedListMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
            if (orderedListMatch) {
                flushListStack(); // 清空之前的列表堆疊
                const content = orderedListMatch[2];

                blocks.push({
                    object: 'block',
                    type: 'numbered_list_item',
                    numbered_list_item: {
                        rich_text: parseRichText(content)
                    }
                });
                stats.lists++;
                i++;
                continue;
            }

            // 處理引用
            if (trimmed.startsWith('>')) {
                flushListStack(); // 引用前清空列表
                const quoteText = trimmed.substring(1).trim();
                if (quoteText) {
                    blocks.push({
                        object: 'block',
                        type: 'quote',
                        quote: {
                            rich_text: parseRichText(quoteText)
                        }
                    });
                    stats.quotes++;
                }
                i++;
                continue;
            }

            // 處理分隔線
            if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
                flushListStack(); // 分隔線前清空列表
                blocks.push({
                    object: 'block',
                    type: 'divider',
                    divider: {}
                });
                stats.dividers++;
                i++;
                continue;
            }

            // 處理段落
            if (trimmed) {
                flushListStack(); // 段落前清空列表
                // 收集連續的非空行作為一個段落
                const paragraphLines = [];
                let paragraphLine = trimmed;
                if (imageMatches.length > 0) {
                    imageMatches.forEach(match => {
                        appendImageBlock(match[2], match[1]?.trim());
                        paragraphLine = paragraphLine.replace(match[0], match[1] || '');
                    });
                }
                paragraphLine = paragraphLine.trim();
                if (paragraphLine) {
                    paragraphLines.push(paragraphLine);
                }
                i++;
                while (i < lines.length) {
                    const nextLine = lines[i];
                    const nextTrimmed = nextLine.trim();

                    // 空行或特殊格式開始，結束段落
                    if (!nextTrimmed ||
                        nextTrimmed.startsWith('#') ||
                        nextTrimmed.startsWith('-') ||
                        nextTrimmed.startsWith('*') ||
                        nextTrimmed.startsWith('+') ||
                        nextTrimmed.match(/^\d+\./) ||
                        nextTrimmed.startsWith('>') ||
                        nextTrimmed.startsWith('```')) {
                        break;
                    }
                    let nextParagraphLine = nextTrimmed;
                    const inlineImageMatches = [...nextTrimmed.matchAll(markdownImageRegex)]
                        .filter(match => isValidAbsoluteUrl(match[2]));
                    if (inlineImageMatches.length > 0) {
                        inlineImageMatches.forEach(match => {
                            appendImageBlock(match[2], match[1]?.trim());
                            nextParagraphLine = nextParagraphLine.replace(match[0], match[1] || '');
                        });
                    }
                    nextParagraphLine = nextParagraphLine.trim();
                    if (nextParagraphLine) {
                        paragraphLines.push(nextParagraphLine);
                    }
                    i++;
                }

                const paragraphText = paragraphLines.join(' ').trim();  // 用空格連接而不是\n
                if (!paragraphText) {
                    continue;
                }

                if (paragraphText) {
                    // 檢查段落長度，Notion 每個 rich_text 有長度限制
                    const maxLength = 2000;
                    if (paragraphText.length <= maxLength) {
                        blocks.push({
                            object: 'block',
                            type: 'paragraph',
                            paragraph: {
                                rich_text: parseRichText(paragraphText)
                            }
                        });
                        stats.paragraphs++;
                    } else {
                        // 分割長段落
                        const chunks = [];
                        for (let pos = 0; pos < paragraphText.length; pos += maxLength) {
                            chunks.push(paragraphText.substring(pos, pos + maxLength));
                        }
                        chunks.forEach(chunk => {
                            blocks.push({
                                object: 'block',
                                type: 'paragraph',
                                paragraph: {
                                    rich_text: [{ type: 'text', text: { content: chunk } }]
                                }
                            });
                        });
                        stats.paragraphs += chunks.length;

                    }
                }
                // 不使用 continue，讓程序進入下一個循環
            } else {
                // 空行，直接跳過
                i++;
            }

        } catch (error) {
            Logger.error(`❌ Error processing line ${i}: "${lines[i] ? lines[i].substring(0, 50) : 'undefined'}..."`);
            Logger.error('Error details:', error.message);
            Logger.error('Stack trace:', error.stack);
            // 繼續處理下一行，不讓單一錯誤停止整個處理
            i++;
        }

        // 安全檢查：確保 i 有增加
        if (i === startI) {
            Logger.warn(`⚠️ Line ${i} did not advance, forcing increment to avoid infinite loop`);
            Logger.warn(`Line content: "${lines[i] || 'undefined'}"`);
            i++;
        }
    }

    // 結束時清空剩餘的列表項

    flushListStack();

    const totalTime = Date.now() - startTime;

    // 顯示統計資訊
    Logger.info(`📊 [統計] 處理完成: ${totalTime}ms, ${blocks.length} 個區塊`);

    // 強制輸出最終狀態，即使有問題

    if (blocks.length > 0) {
        Logger.info(`✅ [成功] 創建了 ${blocks.length} 個區塊`);
    }

    if (blocks.length === 0) {
        Logger.warn('⚠️ No blocks were created! This might indicate a parsing problem.');
        // 返回一個默認段落避免空結果
        return [{
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: [{ type: 'text', text: { content: 'Processing completed but no content was parsed. This might indicate a formatting issue.' } }]
            }
        }];
    }

    // 強制最終輸出，確保調試信息完整
    Logger.info(`🔄 [完成] 返回 ${blocks.length} 個區塊`);

    return blocks;
}

/**
 * 驗證 URL 是否為有效的絕對 URL
 * @param {string} url - 要驗證的 URL
 * @param {boolean} allowRelative - 是否允許相對路徑（用於 Markdown 網站）
 * @param {string} baseUrl - 基本 URL（用於轉換相對路徑）
 */
function isValidUrl(url, allowRelative = false, baseUrl = '') {
    if (!url || typeof url !== 'string') return false;

    // 清理 URL：移除前後空白
    url = url.trim();

    // 過濾明顯無效的URL
    const invalidPatterns = [
        /^\s*$/, // 空白
        /^javascript:/i, // JavaScript連結
        /^mailto:/i, // 郵件連結（Notion可能不支持）
        /^tel:/i, // 電話連結
        /^data:/i, // Data URL
        /^file:/i // 本地文件
    ];

    for (const pattern of invalidPatterns) {
        if (pattern.test(url)) return false;
    }

    // 如果允許相對路徑（Markdown 網站模式）
    if (allowRelative) {
        // 相對路徑和錨點連結在 Markdown 網站中很常見
        if (url.startsWith('/') || url.startsWith('#') ||
            url.startsWith('./') || url.startsWith('../')) {

            // 嘗試轉換為絕對 URL（如果有 baseUrl）
            if (baseUrl && (url.startsWith('/') || url.startsWith('./') || url.startsWith('../'))) {
                try {
                    const absoluteUrl = new URL(url, baseUrl).href;
                    return isValidAbsoluteUrl(absoluteUrl);
                } catch (error) {
                    // 轉換失敗，但相對路徑仍可能有效
                    Logger.info(`⚠️ Could not convert relative URL to absolute: ${url}`);
                }
            }

            // 對於錨點連結，直接返回 false（Notion 不支持）
            if (url.startsWith('#')) {
                return false;
            }

            // 其他相對路徑暫時允許，但只用於簡單的格式
            if (/^[\/\.\w-]+[\/\w-]*$/.test(url)) {
                return true;
            }

            return false;
        }
    } else {
        // 嚴格模式：拒絕相對路徑和錨點連結
        if (url.startsWith('#') || url.startsWith('./') ||
            url.startsWith('../') || url.startsWith('/')) {
            return false;
        }
    }

    return isValidAbsoluteUrl(url);
}

/**
 * 驗證絕對 URL
 */
function isValidAbsoluteUrl(url) {
    try {
        const urlObj = new URL(url);

        // 只接受 http 和 https 協議
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
            return false;
        }

        // 檢查域名是否有效
        if (!urlObj.hostname || urlObj.hostname.length === 0) {
            return false;
        }

        // 檢查是否有特殊字符可能導致 Notion API 問題
        const problematicChars = /[\u0000-\u001f\u007f-\u009f]/; // 控制字符
        if (problematicChars.test(url)) {
            return false;
        }

        return true;
    } catch (error) {
        return false;
    }
}

/**
 * 解析富文本（支持粗體、斜體、代碼、連結等）
 */
function parseRichText(text) {
    if (!text) return [{ type: 'text', text: { content: '' } }];

    // 安全檢查：如果文本太長或太複雜，直接返回純文本
    if (text.length > 5000) {

        return [{ type: 'text', text: { content: text.substring(0, 2000) } }];
    }

    try {
        const richText = [];
        let currentIndex = 0;

        // 匹配各種格式的正則表達式
        const patterns = [
            { regex: /\[([^\]]+)\]\(([^)]+)\)/g, type: 'link' },     // [文字](URL)
            { regex: /`([^`]+)`/g, type: 'code' },                    // `代碼`
            { regex: /\*\*([^*]+)\*\*/g, type: 'bold' },              // **粗體**
            { regex: /\*([^*]+)\*/g, type: 'italic' },               // *斜體*
            { regex: /__([^_]+)__/g, type: 'bold' },                 // __粗體__
            { regex: /_([^_]+)_/g, type: 'italic' }                  // _斜體_
        ];

        // 找到所有匹配項並按位置排序
        const matches = [];
        patterns.forEach(pattern => {
            let match;
            const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
            let iterations = 0;
            while ((match = regex.exec(text)) !== null && iterations < 100) { // 防止無限循環
                matches.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    type: pattern.type,
                    fullMatch: match[0],
                    content: match[1],
                    url: match[2] // 僅對連結有效
                });
                iterations++;
            }
        });

        // 按開始位置排序
        matches.sort((a, b) => a.start - b.start);

        // 處理重疊的匹配項（優先選擇較長的）
        const validMatches = [];
        for (const match of matches) {
            const hasOverlap = validMatches.some(existing =>
                (match.start < existing.end && match.end > existing.start)
            );
            if (!hasOverlap) {
                validMatches.push(match);
            }
        }

        // 重新排序處理後的匹配項
        validMatches.sort((a, b) => a.start - b.start);

        // 構建富文本陣列
        for (const match of validMatches) {
            // 添加匹配前的普通文本
            if (match.start > currentIndex) {
                const plainText = text.substring(currentIndex, match.start);
                if (plainText) {
                    richText.push({
                        type: 'text',
                        text: { content: plainText }
                    });
                }
            }

            // 添加格式化文本
            switch (match.type) {
                case 'link':
                    // 只允許絕對 URL 作為 Notion 連結，相對路徑轉為純文本
                    if (isValidAbsoluteUrl(match.url)) {
                        richText.push({
                            type: 'text',
                            text: {
                                content: match.content,
                                link: { url: match.url }
                            }
                        });
                    } else {
                        // 相對路徑、錨點連結等，直接轉為純文本避免 API 問題
                        richText.push({
                            type: 'text',
                            text: { content: match.content }
                        });
                    }
                    break;
                case 'code':
                    richText.push({
                        type: 'text',
                        text: { content: match.content },
                        annotations: { code: true }
                    });
                    break;
                case 'bold':
                    richText.push({
                        type: 'text',
                        text: { content: match.content },
                        annotations: { bold: true }
                    });
                    break;
                case 'italic':
                    richText.push({
                        type: 'text',
                        text: { content: match.content },
                        annotations: { italic: true }
                    });
                    break;
            }

            currentIndex = match.end;
        }

        // 添加剩餘的普通文本
        if (currentIndex < text.length) {
            const remainingText = text.substring(currentIndex);
            if (remainingText) {
                richText.push({
                    type: 'text',
                    text: { content: remainingText }
                });
            }
        }

        // 如果沒有任何格式化內容，返回純文本
        if (richText.length === 0) {
            return [{ type: 'text', text: { content: text } }];
        }

        return richText;

    } catch (error) {
        Logger.error("❌ Error in parseRichText:", error);
        Logger.error(`Input text: "${text.substring(0, 100)}..."`);
        // 回退到純文本
        return [{ type: 'text', text: { content: text } }];
    }
}

/**
 * 解析格式化文本（已整合到 parseRichText 中，此函數保留作為備用）
 */
function parseFormattedText(text) {
    if (!text) return [];

    return [{
        type: 'text',
        text: { content: text }
    }];
}

/**
 * 映射語言名稱到 Notion 支持的語言
 */
function mapLanguage(lang) {
    const languageMap = {
        'js': 'javascript',
        'ts': 'typescript',
        'py': 'python',
        'rb': 'ruby',
        'sh': 'shell',
        'bash': 'shell',
        'zsh': 'shell',
        'yml': 'yaml',
        'md': '``',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'xml': 'xml',
        'sql': 'sql',
        'go': 'go',
        'rust': 'rust',
        'c': 'c',
        'cpp': 'c++',
        'c++': 'c++',
        'java': 'java',
        'kotlin': 'kotlin',
        'swift': 'swift',
        'php': 'php'
    };

    return languageMap[lang.toLowerCase()] || lang || 'plain text';
}

/**
 * 主要的 HTML 到 Notion blocks 轉換函數
 */
function convertHtmlToNotionBlocks(html) {


    // ✅ 策略 1：對於 Markdown 網站，優先嘗試獲取原始 Markdown 文件
    const currentUrl = window.location.href;

    // 檢查是否是 GitHub Pages 或類似的 Markdown 網站
    if (currentUrl.includes('github.io') || currentUrl.includes('/docs/')) {
        Logger.info('📄 [策略1] 檢測到 Markdown 網站，嘗試獲取原始文件');

        // 嘗試構建原始 Markdown URL
        let markdownUrl = null;

        if (currentUrl.includes('google-gemini.github.io/gemini-cli')) {
            markdownUrl = 'https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/commands.md';
        }
        // 可以添加更多網站的規則

        if (markdownUrl) {
            Logger.info(`🔗 [策略1] 嘗試獲取: ${markdownUrl}`);

            // 使用同步方法嘗試獲取（在 executeScript 上下文中）
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', markdownUrl, false); // 同步請求
                xhr.send();

                if (xhr.status === 200) {
                    const markdown = xhr.responseText;
                    Logger.info(`✅ [策略1] 成功獲取 Markdown (${markdown.length} 字符)`);

                    // 直接將 Markdown 轉換為 Notion 區塊
                    const blocks = convertMarkdownToNotionBlocks(markdown);

                    return blocks;
                }
            } catch (error) {
                Logger.warn('Failed to fetch original Markdown:', error);
            }
        }
    }

    // ✅ 策略 2：智能檢測技術文檔並選擇最佳處理策略
    const isTechnicalDoc =
        currentUrl.includes('github.io') ||
        currentUrl.includes('/docs/') ||
        currentUrl.includes('/cli/') ||
        currentUrl.includes('/api/') ||
        document.querySelector('.markdown-body, .markdown, [class*="markdown"]') !== null;

    if (isTechnicalDoc) {
        Logger.info('🔧 [策略2] 檢測到技術文檔，使用智能內容提取');

        // 對技術文檔使用特殊處理：直接提取最佳內容區域
        const techSelectors = ['.markdown-body', '.docs-content', '.documentation', 'article', 'main'];
        for (const selector of techSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim().length > 1000) {
                Logger.info(`📋 [策略2] 使用選擇器: ${selector} (${element.textContent.trim().length} 字符)`);
                html = element.innerHTML; // 更新為最佳內容

                break;
            }
        }
    }

    try {
        // 初始化 Turndown
        const turndownService = initTurndownService();

        if (turndownService) {
            Logger.info('📝 [轉換] HTML → Markdown');
            // HTML → Markdown

            const markdown = turndownService.turndown(html);
            Logger.info(`📄 [Markdown] 生成 ${markdown.length} 字符`);

            // 顯示 Markdown 前几行供調試
            const previewLines = markdown.split('\n').slice(0, 10).join('\n');
            Logger.info(`📋 [預覽] Markdown 前10行:\n${previewLines}`);

            // Markdown → Notion blocks
            Logger.info('🔄 [轉換] Markdown → Notion blocks');

            const blocks = convertMarkdownToNotionBlocks(markdown);

            // 顯示 blocks 類型分佈
            const blockTypes = {};
            blocks.forEach(block => {
                blockTypes[block.type] = (blockTypes[block.type] || 0) + 1;
            });
            Logger.info(`📊 [區塊] 類型分佈:`, blockTypes);

            return blocks;
        }
    } catch (error) {
        Logger.error('❌ HTML to Notion conversion failed:', error);
        Logger.error('Error stack:', error.stack);
    }

    // 回退：使用純文本處理
    Logger.warn('⚠️ Using fallback: plain text conversion');
    return fallbackHtmlToNotionBlocks(html);
}

/**
 * 回退方案：簡單的文本提取
 */
function fallbackHtmlToNotionBlocks(html) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const text = tempDiv.textContent || tempDiv.innerText || '';

    if (!text.trim()) {
        return [{
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: [{ type: 'text', text: { content: 'Could not extract content' } }]
            }
        }];
    }

    // 按段落分割
    const paragraphs = text.split('\n\n').filter(p => p.trim());

    return paragraphs.map(para => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
            rich_text: [{
                type: 'text',
                text: { content: para.trim().substring(0, 2000) }
            }]
        }
    }));
}

// 導出函數（在注入環境中）
if (typeof window !== 'undefined') {
    window.convertHtmlToNotionBlocks = convertHtmlToNotionBlocks;
    window.convertMarkdownToNotionBlocks = convertMarkdownToNotionBlocks;
}
