/**
 * HTML to Notion Blocks Converter
 * 使用 Turndown 將 HTML 轉換為 Markdown，再轉換為 Notion blocks
 * 保留格式：列表、代碼塊、標題、粗體、斜體等
 */
/* global TurndownService, turndownPluginGfm */

// 注意：這個文件將被注入到頁面中，所以需要使用全局變數
// 確保 Logger 可用（從 utils.js 或其他地方）
if (typeof window.Logger === 'undefined') {
  window.Logger = console; // 回退到 console
}
// 直接使用 window.Logger，避免重複宣告

// Turndown 庫需要在使用前加載

/**
 * 初始化 Turndown 服務
 */
function initTurndownService() {
  if (typeof TurndownService === 'undefined') {
    window.Logger.warn('⚠️ TurndownService not loaded, using fallback');
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
    // content 參數為 TurndownService API 接口要求，當前實現未使用
    blankReplacement(_content, node) {
      return node.isBlock ? '\n\n' : '';
    },
  });

  // 添加 GitHub Flavored Markdown 支持（如果有）
  if (typeof turndownPluginGfm !== 'undefined') {
    turndownService.use(turndownPluginGfm.gfm);
  }

  // 自定義規則：保留嵌套列表結構
  turndownService.addRule('nestedLists', {
    filter: ['ul', 'ol'],
    replacement(content, node) {
      const parent = node.parentNode;
      if (parent?.nodeName === 'LI') {
        // 這是嵌套列表，添加適當的縮排
        const lines = content.trim().split('\n');
        const indentedLines = lines.map(line => {
          if (line.trim()) {
            return `  ${line}`; // 每層嵌套添加2個空格
          }
          return line;
        });
        return `\n${indentedLines.join('\n')}\n`;
      }
      return content;
    },
  });

  // 自定義規則：保留代碼塊的語言標記
  turndownService.addRule('fencedCodeBlock', {
    filter(node, options) {
      return (
        options.codeBlockStyle === 'fenced' &&
        node.nodeName === 'PRE' &&
        node.firstChild?.nodeName === 'CODE'
      );
    },
    replacement(content, node, options) {
      const className = node.firstChild.getAttribute('class') || '';
      const language =
        (className.match(/language-(\S+)/) ||
          className.match(/lang-(\S+)/) ||
          className.match(/highlight-source-(\S+)/) ||
          [])[1] || '';

      const code = node.firstChild.textContent;
      const fence = options.fence;

      return `\n\n${fence}${language}\n${code.replace(/\n$/, '')}\n${fence}\n\n`;
    },
  });

  // 自定義規則：改進連結處理，確保正確的 Markdown 連結格式
  turndownService.addRule('improvedLinks', {
    filter: 'a',
    replacement(content, node) {
      const href = node.getAttribute('href');
      const title = node.getAttribute('title');

      if (!href) {
        return content; // 沒有連結，直接返回文本
      }

      // 對於 Markdown 網站，採用保守策略：只保留絕對 URL
      if (isValidUrl(href)) {
        // 標準 Markdown 連結格式
        let result = `[${content}](${href}`;
        if (title) {
          result += ` "${title}"`;
        }
        result += ')';
        return result;
      }
      // 相對路徑、錨點連結等，直接返回文本避免 Notion API 問題

      return content;
    },
  });

  return turndownService;
}

// Markdown 圖片正則
const markdownImageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g;

/**
 * 添加圖片區塊
 * @param {Object} context - 處理上下文
 * @param {string} url - 圖片 URL
 * @param {string} altText - 圖片替代文本
 */
function appendImageBlock(context, url, altText) {
  context.blocks.push({
    object: 'block',
    type: 'image',
    image: {
      type: 'external',
      external: { url },
      caption: altText ? [{ type: 'text', text: { content: altText } }] : [],
    },
  });
  context.stats.images = (context.stats.images || 0) + 1;
}

/**
 * 處理純圖片行
 * @param {Object} context - 處理上下文
 * @returns {boolean} 是否已處理
 */
function handleImage(context) {
  const { lines, i } = context;
  const line = lines[i];
  const trimmed = line.trim();
  const imageMatches = [...trimmed.matchAll(markdownImageRegex)].filter(match =>
    isValidUrl(match[2])
  );

  if (imageMatches.length > 0 && trimmed.replace(markdownImageRegex, '').trim() === '') {
    imageMatches.forEach(match => {
      const url = match[2];
      const alt = match[1]?.trim();
      appendImageBlock(context, url, alt);
    });
    context.i++;
    return true;
  }
  return false;
}

/**
 * 處理段落
 * @param {Object} context - 處理上下文
 * @returns {boolean} 是否已處理
 */
function handleParagraph(context) {
  const { lines, i, blocks, stats } = context;
  const line = lines[i];
  const trimmed = line.trim();

  if (trimmed) {
    // 收集連續的非空行作為一個段落
    const paragraphLines = [];
    let paragraphLine = trimmed;
    const imageMatches = [...trimmed.matchAll(markdownImageRegex)].filter(match =>
      isValidUrl(match[2])
    );

    if (imageMatches.length > 0) {
      imageMatches.forEach(match => {
        appendImageBlock(context, match[2], match[1]?.trim());
        paragraphLine = paragraphLine.replace(match[0], match[1] || '');
      });
    }
    paragraphLine = paragraphLine.trim();
    if (paragraphLine) {
      paragraphLines.push(paragraphLine);
    }
    context.i++;

    while (context.i < lines.length) {
      const nextLine = lines[context.i];
      const nextTrimmed = nextLine.trim();

      // 空行或特殊格式開始，結束段落
      if (
        !nextTrimmed ||
        nextTrimmed.startsWith('#') ||
        nextTrimmed.startsWith('-') ||
        nextTrimmed.startsWith('*') ||
        nextTrimmed.startsWith('+') ||
        nextTrimmed.match(/^\d+\./) ||
        nextTrimmed.startsWith('>') ||
        nextTrimmed.startsWith('```')
      ) {
        break;
      }
      let nextParagraphLine = nextTrimmed;
      const inlineImageMatches = [...nextTrimmed.matchAll(markdownImageRegex)].filter(match =>
        isValidUrl(match[2])
      );
      if (inlineImageMatches.length > 0) {
        inlineImageMatches.forEach(match => {
          appendImageBlock(context, match[2], match[1]?.trim());
          nextParagraphLine = nextParagraphLine.replace(match[0], match[1] || '');
        });
      }
      nextParagraphLine = nextParagraphLine.trim();
      if (nextParagraphLine) {
        paragraphLines.push(nextParagraphLine);
      }
      context.i++;
    }

    const paragraphText = paragraphLines.join(' ').trim();
    if (!paragraphText) {
      return true;
    }

    const maxLength = 2000;
    // 處理超長文本
    if (paragraphText.length > maxLength) {
      for (let pos = 0; pos < paragraphText.length; pos += maxLength) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: { content: paragraphText.substring(pos, pos + maxLength) },
              },
            ],
          },
        });
        stats.paragraphs++;
      }
    } else {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: parseRichText(paragraphText),
        },
      });
      stats.paragraphs++;
    }
    return true;
  }
  return false;
}

/**
 * 將 Markdown 轉換為 Notion blocks
 * 支持：標題、段落、列表（嵌套）、代碼塊、引用等
 */
/**
 * 處理代碼塊
 * @param {Object} context - 處理上下文
 * @returns {boolean} 是否已處理
 */
function handleCodeBlock(context) {
  const { lines, i, blocks, stats, state } = context;
  const line = lines[i];
  const trimmed = line.trim();

  // 檢查是否是代碼塊標記
  if (trimmed.startsWith('```')) {
    if (state.inCodeBlock) {
      // 結束代碼塊
      if (state.codeContent.length > 0) {
        blocks.push({
          object: 'block',
          type: 'code',
          code: {
            rich_text: [
              {
                type: 'text',
                text: { content: state.codeContent.join('\n') },
              },
            ],
            language: state.codeLanguage,
          },
        });
        stats.codeBlocks++;
      }
      state.inCodeBlock = false;
      state.codeContent = [];
      state.codeLanguage = 'plain text';
    } else {
      // 開始代碼塊
      state.inCodeBlock = true;
      const lang = trimmed.substring(3).trim();
      state.codeLanguage = mapLanguage(lang) || 'plain text';
    }
    context.i++;
    return true;
  }

  // 如果在代碼塊內，收集內容
  if (state.inCodeBlock) {
    state.codeContent.push(line);
    context.i++;
    return true;
  }

  return false;
}

/**
 * 處理標題
 * @param {Object} context - 處理上下文
 * @returns {boolean} 是否已處理
 */
function handleHeading(context) {
  const { lines, i, blocks, stats } = context;
  const line = lines[i];
  const trimmed = line.trim();

  const headingMatch = trimmed.match(/^(#{1,6})\s+(\S.*)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const text = headingMatch[2];

    // Notion 只支援 heading_1, heading_2, heading_3
    // h4-h6 轉換為帶粗體格式的段落以保留語義
    if (level <= 3) {
      const blockType = level === 1 ? 'heading_1' : level === 2 ? 'heading_2' : 'heading_3';
      blocks.push({
        object: 'block',
        type: blockType,
        [blockType]: {
          rich_text: parseRichText(text),
        },
      });
      stats.headings++;
    } else {
      // h4-h6 轉為粗體段落
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: { content: text },
              annotations: { bold: true },
            },
          ],
        },
      });
      stats.paragraphs++;
    }
    context.i++;
    return true;
  }
  return false;
}

/**
 * 處理無序列表
 * @param {Object} context - 處理上下文
 * @returns {boolean} 是否已處理
 */
function handleUnorderedList(context) {
  const { lines, i, blocks, stats } = context;
  const line = lines[i];
  const trimmed = line.trim();

  // 處理無序列表
  const unorderedListMatch = trimmed.match(/^[-*+]\s+(\S.*)$/);
  if (unorderedListMatch) {
    const content = unorderedListMatch[1];
    const maxLength = 2000;

    // 處理超長文本：分割成多個區塊
    if (content.length > maxLength) {
      for (let pos = 0; pos < content.length; pos += maxLength) {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { type: 'text', text: { content: content.substring(pos, pos + maxLength) } },
            ],
          },
        });
        stats.lists++;
      }
    } else {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: parseRichText(content),
        },
      });
      stats.lists++;
    }
    context.i++;
    return true;
  }
  return false;
}

/**
 * 處理有序列表
 * @param {Object} context - 處理上下文
 * @returns {boolean} 是否已處理
 */
function handleOrderedList(context) {
  const { lines, i, blocks, stats } = context;
  const line = lines[i];
  const trimmed = line.trim();

  // 處理有序列表
  const orderedListMatch = trimmed.match(/^(\d+)\.\s+(\S.*)$/);
  if (orderedListMatch) {
    const content = orderedListMatch[2];
    const maxLength = 2000;

    // 處理超長文本：分割成多個區塊
    if (content.length > maxLength) {
      for (let pos = 0; pos < content.length; pos += maxLength) {
        blocks.push({
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: {
            rich_text: [
              { type: 'text', text: { content: content.substring(pos, pos + maxLength) } },
            ],
          },
        });
        stats.lists++;
      }
    } else {
      blocks.push({
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: parseRichText(content),
        },
      });
      stats.lists++;
    }
    context.i++;
    return true;
  }
  return false;
}

/**
 * 處理引用
 * @param {Object} context - 處理上下文
 * @returns {boolean} 是否已處理
 */
function handleQuote(context) {
  const { lines, i, blocks, stats } = context;
  const line = lines[i];
  const trimmed = line.trim();

  // 處理引用
  if (trimmed.startsWith('>')) {
    const quoteText = trimmed.substring(1).trim();
    if (quoteText) {
      const maxLength = 2000;

      // 處理超長文本：分割成多個區塊
      if (quoteText.length > maxLength) {
        for (let pos = 0; pos < quoteText.length; pos += maxLength) {
          blocks.push({
            object: 'block',
            type: 'quote',
            quote: {
              rich_text: [
                { type: 'text', text: { content: quoteText.substring(pos, pos + maxLength) } },
              ],
            },
          });
          stats.quotes++;
        }
      } else {
        blocks.push({
          object: 'block',
          type: 'quote',
          quote: {
            rich_text: parseRichText(quoteText),
          },
        });
        stats.quotes++;
      }
    }
    context.i++;
    return true;
  }
  return false;
}

/**
 * 處理分隔線
 * @param {Object} context - 處理上下文
 * @returns {boolean} 是否已處理
 */
function handleDivider(context) {
  const { lines, i, blocks, stats } = context;
  const line = lines[i];
  const trimmed = line.trim();

  // 處理分隔線
  // skipcq: JS-0113 - Valid check for divider
  if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
    blocks.push({
      object: 'block',
      type: 'divider',
      divider: {},
    });
    stats.dividers++;
    context.i++;
    return true;
  }
  return false;
}

/**
 * 將 Markdown 轉換為 Notion blocks
 * 支持：標題、段落、列表（嵌套）、代碼塊、引用等
 * @param {string} markdown - Markdown 文本
 * @returns {Array} Notion blocks 數組
 */
function convertMarkdownToNotionBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split('\n');

  const startTime = Date.now();
  const maxProcessingTime = 30000; // 30秒超時

  let i = 0; // 恢復 i 變量

  // 初始化上下文
  const context = {
    lines,
    i: 0,
    blocks,
    stats: {
      images: 0,
      headings: 0,
      paragraphs: 0,
      lists: 0,
      codeBlocks: 0,
      quotes: 0,
      dividers: 0,
    },
    state: {
      inCodeBlock: false,
      codeContent: [],
      codeLanguage: 'plain text',
    },
  };

  // 處理器列表
  const handlers = [
    handleCodeBlock,
    handleImage,
    handleHeading,
    handleUnorderedList,
    handleOrderedList,
    handleQuote,
    handleDivider,
    handleParagraph,
  ];

  // 為了方便訪問 stats，在局部作用域保留引用（或直接使用 context.stats）
  // const stats = context.stats; // Unused

  while (i < lines.length) {
    context.i = i; // 同步 context.i

    const line = lines[i];
    const trimmed = line.trim();

    // 進度追蹤
    if (i > 0 && i % 10 === 0) {
      const elapsed = Date.now() - startTime;
      window.Logger.info(`📈 [進度] 已處理 ${i}/${lines.length} 行 (${elapsed}ms)`);
    }

    // 安全檢查
    const startI = i;
    const elapsed = Date.now() - startTime;
    if (elapsed > maxProcessingTime) {
      window.Logger.error(`❌ Processing timeout after ${elapsed}ms at line ${i}/${lines.length}`);
      window.Logger.error(`Current line: "${trimmed}"`);
      break;
    }

    try {
      let handled = false;
      for (const handler of handlers) {
        if (handler(context)) {
          i = context.i; // 同步處理進度
          handled = true;
          break;
        }
      }

      if (handled) {
        continue;
      }

      // 如果沒有處理器處理（例如空行），手動前進
      i++;
    } catch (error) {
      window.Logger.error(
        `❌ Error processing line ${i}: "${lines[i] ? lines[i].substring(0, 50) : 'undefined'}..."`
      );
      window.Logger.error('Error details:', error.message);
      window.Logger.error('Stack trace:', error.stack);
      // 繼續處理下一行，不讓單一錯誤停止整個處理
      i++;
    }

    // 安全檢查：確保 i 有增加
    if (i === startI) {
      window.Logger.warn(`⚠️ Line ${i} did not advance, forcing increment to avoid infinite loop`);
      window.Logger.warn(`Line content: "${lines[i] || 'undefined'}"`);
      i++;
    }
  }

  const totalTime = Date.now() - startTime;

  // 顯示統計資訊
  window.Logger.info(`📊 [統計] 處理完成: ${totalTime}ms, ${blocks.length} 個區塊`);

  // 強制輸出最終狀態，即使有問題

  if (blocks.length > 0) {
    window.Logger.info(`✅ [成功] 創建了 ${blocks.length} 個區塊`);
  }

  if (blocks.length === 0) {
    window.Logger.warn('⚠️ No blocks were created! This might indicate a parsing problem.');
    // 返回一個默認段落避免空結果
    return [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content:
                  'Processing completed but no content was parsed. This might indicate a formatting issue.',
              },
            },
          ],
        },
      },
    ];
  }

  // 強制最終輸出，確保調試信息完整
  window.Logger.info(`🔄 [完成] 返回 ${blocks.length} 個區塊`);

  return blocks;
}

// 導出函數供測試使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    convertMarkdownToNotionBlocks,
    parseRichText, // 也導出這個輔助函數以便單獨測試
    isValidUrl,
    mapLanguage,
  };
}

/**
 * 驗證 URL 是否為有效的絕對 URL
 * @param {string} url - 要驗證的 URL
 * @param {boolean} allowRelative - 是否允許相對路徑（用於 Markdown 網站）
 * @param {string} baseUrl - 基本 URL（用於轉換相對路徑）
 */
function isValidUrl(url, allowRelative = false, baseUrl = '') {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // 清理 URL：移除前後空白
  url = url.trim();

  // 過濾明顯無效的URL
  const invalidPatterns = [
    /^\s*$/, // 空白
    /^javascript:/i, // JavaScript連結
    /^mailto:/i, // 郵件連結（Notion可能不支持）
    /^tel:/i, // 電話連結
    /^data:/i, // Data URL
    /^file:/i, // 本地文件
  ];

  for (const pattern of invalidPatterns) {
    if (pattern.test(url)) {
      return false;
    }
  }

  // 如果允許相對路徑（Markdown 網站模式）
  if (allowRelative) {
    // 相對路徑和錨點連結在 Markdown 網站中很常見
    if (
      url.startsWith('/') ||
      url.startsWith('#') ||
      url.startsWith('./') ||
      url.startsWith('../')
    ) {
      // 錨點連結直接視為有效
      if (url.startsWith('#')) {
        return true;
      }

      // 嘗試轉換為絕對 URL（如果有 baseUrl）
      if (baseUrl && (url.startsWith('/') || url.startsWith('./') || url.startsWith('../'))) {
        try {
          const absoluteUrl = new URL(url, baseUrl).href;
          return isValidAbsoluteUrl(absoluteUrl);
        } catch (error) {
          // 轉換失敗，但相對路徑仍可能有效
          const errorMessage = error instanceof Error ? error.message : String(error);
          window.Logger.info(
            `⚠️ Could not convert relative URL to absolute (${errorMessage}): ${url}`
          );
        }
      }

      // 在 allowRelative 模式下，相對路徑視為有效
      return true;
    }
  }

  return isValidAbsoluteUrl(url);
}

/**
 * 驗證 URL 是否為有效的絕對 URL
 * @param {string} url - 要驗證的 URL
 * @returns {boolean} 是否有效
 */
function isValidAbsoluteUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const urlObj = new URL(url);
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    window.Logger.warn(`⚠️ [URL 驗證] 無法解析 URL (${errorMessage}): ${url}`);
    return false;
  }
}

/**
 * 映射語言名稱到 Notion 支持的語言
 * @param {string} lang - 原始語言標記
 * @returns {string} Notion 支持的語言
 */
function mapLanguage(lang) {
  if (!lang) {
    return 'plain text';
  }

  const languageMap = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    java: 'java',
    cpp: 'cpp',
    'c++': 'cpp',
    c: 'c',
    cs: 'csharp',
    csharp: 'csharp',
    php: 'php',
    rb: 'ruby',
    ruby: 'ruby',
    go: 'go',
    rs: 'rust',
    rust: 'rust',
    sh: 'bash',
    bash: 'bash',
    shell: 'bash',
    sql: 'sql',
    html: 'html',
    xml: 'xml',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    markdown: 'markdown',
    swift: 'swift',
  };
  return languageMap[lang.toLowerCase()] || lang || 'plain text';
}

/**
 * 解析富文本格式,支援多種 Markdown 風格
 * 支援格式：
 * - 粗體: **text** 或 __text__
 * - 斜體: *text* 或 _text_
 *
 * 注意：此函數同時支援星號和下劃線兩種 Markdown 格式，
 * 以兼容 Turndown 的 emDelimiter: '_' 配置
 *
 * @param {string} text - 包含 Markdown 格式的文本
 * @returns {Array} Notion rich_text 對象數組
 */
function parseRichText(text) {
  if (!text) {
    return [{ type: 'text', text: { content: '' } }];
  }

  // 匹配粗體和斜體，支援 * 和 _ 兩種風格
  // 優先使用星號格式，只在明確的空白邊界處匹配下劃線格式
  // 這樣可以避免誤判變數名（如 user_name）

  // 策略：先處理星號格式（安全），再處理空白邊界的下劃線格式
  const starPattern = /(?:\*\*[^*]+\*\*|\*[^*]+\*)/g;

  // 使用臨時標記替換星號格式，避免干擾
  const matches = [];
  let tempText = text.replace(starPattern, match => {
    const index = matches.length;
    matches.push(match);
    return `___STAR_${index}___`;
  });

  // 處理下劃線格式，只在前後是空白字符或字串邊界時匹配
  // (?:^|\s) - 字串開頭或空白字符
  // (?=\s|$) - 空白字符或字串結尾（lookahead）
  // 這裡使用非捕獲組 (?:^|\s) 來匹配前綴，確保下劃線前後有邊界
  // 並且將前綴作為單獨的文本處理，不包含在格式化內容中
  const underscorePattern = /((?:^|\s))(__|_)([^\s_]+?)\2(?=\s|$)/g;

  tempText = tempText.replace(underscorePattern, (_fullMatch, prefix, delimiter, content) => {
    const index = matches.length;
    matches.push(`${delimiter}${content}${delimiter}`); // 存儲原始帶分隔符的內容
    return `${prefix}___UNDER_${index}___`; // 返回前綴和標記
  });

  // 現在重新組合
  const richText = [];
  const finalPattern = /___(?:STAR|UNDER)_(\d+)___/g;
  let lastIndex = 0;
  let match = null;

  while ((match = finalPattern.exec(tempText)) !== null) {
    // 添加匹配前的普通文本
    if (match.index > lastIndex) {
      const plainText = tempText.slice(lastIndex, match.index);
      if (plainText) {
        richText.push({
          type: 'text',
          text: { content: plainText },
        });
      }
    }

    const markerIndex = Number.parseInt(match[1], 10);
    const original = matches[markerIndex];

    // 判斷格式類型
    if (original.startsWith('**') && original.endsWith('**')) {
      richText.push({
        type: 'text',
        text: { content: original.slice(2, -2) },
        annotations: { bold: true },
      });
    } else if (original.startsWith('__') && original.endsWith('__')) {
      richText.push({
        type: 'text',
        text: { content: original.slice(2, -2) },
        annotations: { bold: true },
      });
    } else if (original.startsWith('*') && original.endsWith('*')) {
      richText.push({
        type: 'text',
        text: { content: original.slice(1, -1) },
        annotations: { italic: true },
      });
    } else if (original.startsWith('_') && original.endsWith('_')) {
      richText.push({
        type: 'text',
        text: { content: original.slice(1, -1) },
        annotations: { italic: true },
      });
    }

    lastIndex = finalPattern.lastIndex;
  }

  // 添加剩餘的文本
  if (lastIndex < tempText.length) {
    const remaining = tempText.slice(lastIndex);
    if (remaining) {
      richText.push({
        type: 'text',
        text: { content: remaining },
      });
    }
  }

  return richText.length > 0 ? richText : [{ type: 'text', text: { content: text } }];
}

/**
 * 主要的 HTML 到 Notion blocks 轉換函數
 *
 * 注意：頁面類型檢測已由 ContentExtractor + pageComplexityDetector 完成，
 * 此函數只負責將已提取的 HTML 轉換為 Notion blocks，不再重複檢測。
 */
function convertHtmlToNotionBlocks(html) {
  try {
    // 初始化 Turndown
    const turndownService = initTurndownService();

    if (turndownService) {
      window.Logger.info('📝 [轉換] HTML → Markdown');
      // HTML → Markdown

      const markdown = turndownService.turndown(html);
      window.Logger.info(`📄 [Markdown] 生成 ${markdown.length} 字符`);

      // 顯示 Markdown 前几行供調試
      const previewLines = markdown.split('\n').slice(0, 10).join('\n');
      window.Logger.info(`📋 [預覽] Markdown 前10行:\n${previewLines}`);

      // Markdown → Notion blocks
      window.Logger.info('🔄 [轉換] Markdown → Notion blocks');

      const blocks = convertMarkdownToNotionBlocks(markdown);

      // 顯示 blocks 類型分佈
      const blockTypes = {};
      blocks.forEach(block => {
        blockTypes[block.type] = (blockTypes[block.type] || 0) + 1;
      });
      window.Logger.info('📊 [區塊] 類型分佈:', blockTypes);

      return blocks;
    }
  } catch (error) {
    window.Logger.error('❌ HTML to Notion conversion failed:', error);
    window.Logger.error('Error stack:', error.stack);
  }

  // 回退：使用純文本處理
  window.Logger.warn('⚠️ Using fallback: plain text conversion');
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
    return [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: 'Could not extract content' } }],
        },
      },
    ];
  }

  // 按段落分割
  const paragraphs = text.split('\n\n').filter(para => para.trim());

  return paragraphs.map(para => ({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [
        {
          type: 'text',
          text: { content: para.trim().substring(0, 2000) },
        },
      ],
    },
  }));
}

// 導出函數（在注入環境中）
if (typeof window !== 'undefined') {
  window.convertHtmlToNotionBlocks = convertHtmlToNotionBlocks;
  window.convertMarkdownToNotionBlocks = convertMarkdownToNotionBlocks;
}
