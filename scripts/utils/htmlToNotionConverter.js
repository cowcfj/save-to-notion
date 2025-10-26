/**
 * HTML to Notion Blocks Converter
 * 使用 Turndown 將 HTML 轉換為 Markdown，再轉換為 Notion blocks
 * 保留格式：列表、代碼塊、標題、粗體、斜體等
 */

// 注意：這個文件將被注入到頁面中，所以需要使用全局變數
// 確保 Logger 可用（從 utils.js 或其他地方）
if (typeof window.Logger === 'undefined') {
    window.Logger = console; // 回退到 console
}
const Logger = window.Logger;

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
];
