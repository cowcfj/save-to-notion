/**
 * ContentBridge - 內容格式適配器
 *
 * 職責:
 * - 將 ContentExtractor 的輸出轉換為 background.js 預期的格式
 * - 整合 htmlToNotionConverter 進行 HTML → Notion Blocks 轉換
 * - 處理 featuredImage 和 siteIcon 的插入邏輯
 *
 * 輸入格式 (ContentExtractor.extract):
 * {
 *   content: string (HTML),
 *   type: 'html' | 'markdown',
 *   metadata: { title, author, description, favicon, siteIcon, featuredImage },
 *   rawArticle: object | null,
 *   debug: { complexity, selection }
 * }
 *
 * 輸出格式 (executeScript 預期):
 * {
 *   title: string,
 *   blocks: Array<NotionBlock>,
 *   siteIcon: string | null
 * }
 */

/* global Logger */

/**
 * 將 ContentExtractor 的提取結果轉換為 background.js 預期的格式
 *
 * @param {Object} extractedContent - ContentExtractor.extract() 的返回值
 * @param {Object} options - 配置選項
 * @param {boolean} options.includeFeaturedImage - 是否在 blocks 開頭插入封面圖
 * @param {Function} options.htmlConverter - HTML 轉換函數 (預設使用 window.convertHtmlToNotionBlocks)
 * @returns {Object} { title, blocks, siteIcon }
 */
function bridgeContentToBlocks(extractedContent, options = {}) {
  const { includeFeaturedImage = true, htmlConverter = getDefaultHtmlConverter() } = options;

  // 驗證輸入
  if (!extractedContent) {
    Logger.warn('⚠️ [ContentBridge] 收到空的 extractedContent');
    return createFallbackResult('Untitled', 'No content was extracted.');
  }

  const { content, type, metadata = {}, rawArticle } = extractedContent;

  // 1. 提取標題
  const title =
    metadata.title ||
    rawArticle?.title ||
    (typeof document !== 'undefined' ? document.title : '') ||
    'Untitled';
  Logger.log(`📌 [ContentBridge] 標題: ${title}`);

  // 2. 轉換內容為 Notion Blocks
  let blocks = [];

  if (content) {
    try {
      if (type === 'html' && htmlConverter) {
        Logger.log('🔄 [ContentBridge] 使用 HTML 轉換器');
        blocks = htmlConverter(content);
      } else if (type === 'markdown') {
        // Markdown 內容需要先轉換為 HTML 或直接處理
        Logger.log('🔄 [ContentBridge] Markdown 內容，使用 HTML 轉換器');
        blocks = htmlConverter(content);
      } else {
        Logger.warn('⚠️ [ContentBridge] 未知內容類型，使用回退處理');
        blocks = createTextBlocks(content);
      }
    } catch (error) {
      Logger.error('❌ [ContentBridge] 內容轉換失敗:', error);
      blocks = createTextBlocks(content);
    }
  }

  // 確保 blocks 是有效的陣列
  if (!Array.isArray(blocks) || blocks.length === 0) {
    Logger.warn('⚠️ [ContentBridge] 轉換結果為空，創建回退區塊');
    blocks = [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: { content: 'Content extraction completed but no blocks were generated.' },
            },
          ],
        },
      },
    ];
  }

  Logger.log(`✅ [ContentBridge] 生成了 ${blocks.length} 個區塊`);

  // 3. 插入封面圖
  if (includeFeaturedImage && metadata.featuredImage) {
    const featuredImageUrl = metadata.featuredImage;

    // 檢查是否已存在於 blocks 中
    const isDuplicate = blocks.some(
      block => block.type === 'image' && block.image?.external?.url === featuredImageUrl
    );

    if (!isDuplicate) {
      blocks.unshift({
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: { url: featuredImageUrl },
        },
      });
      Logger.log('✓ [ContentBridge] 封面圖已插入到區塊開頭');
    } else {
      Logger.log('✗ [ContentBridge] 封面圖已存在，跳過插入');
    }
  }

  // 4. 提取 siteIcon
  const siteIcon = metadata.siteIcon || metadata.favicon || null;

  return {
    title,
    blocks,
    siteIcon,
  };
}

/**
 * 獲取預設的 HTML 轉換器
 * @returns {Function|null}
 */
function getDefaultHtmlConverter() {
  if (typeof window !== 'undefined' && typeof window.convertHtmlToNotionBlocks === 'function') {
    return window.convertHtmlToNotionBlocks;
  }
  return null;
}

/**
 * 創建回退結果
 * @param {string} title - 標題
 * @param {string} message - 訊息
 * @returns {Object}
 */
function createFallbackResult(title, message) {
  return {
    title,
    blocks: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: message } }],
        },
      },
    ],
    siteIcon: null,
  };
}

/**
 * 將純文本轉換為段落區塊（回退方案）
 * @param {string} content - 文本內容
 * @returns {Array<Object>}
 */
function createTextBlocks(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }

  // 嘗試移除 HTML 標籤
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  const text = tempDiv.textContent || tempDiv.innerText || '';

  if (!text.trim()) {
    return [];
  }

  // 按段落分割
  const paragraphs = text.split('\n\n').filter(para => para.trim());
  const maxLength = 2000;

  const blocks = [];
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      continue;
    }

    // 處理長段落
    if (trimmed.length <= maxLength) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: trimmed } }],
        },
      });
    } else {
      // 分割長段落
      for (let pos = 0; pos < trimmed.length; pos += maxLength) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: trimmed.substring(pos, pos + maxLength) } },
            ],
          },
        });
      }
    }
  }

  return blocks;
}

/**
 * 執行完整的內容提取和轉換流程
 * 這是一個高階函數，整合 ContentExtractor 和 ContentBridge
 *
 * @param {Document} doc - DOM Document
 * @param {Object} options - 配置選項
 * @returns {Object} { title, blocks, siteIcon }
 */
function extractAndBridge(doc, options = {}) {
  // 動態導入 ContentExtractor
  // 注意：這個函數預期在注入的頁面環境中執行，ContentExtractor 應該已經載入
  const ContentExtractor = window.ContentExtractor;

  if (!ContentExtractor) {
    Logger.warn('⚠️ [ContentBridge] ContentExtractor 未載入，使用回退');
    return createFallbackResult(doc.title || 'Untitled', 'ContentExtractor is not available.');
  }

  // 1. 使用 ContentExtractor 提取內容
  const extractedContent = ContentExtractor.extract(doc, options);
  Logger.log('📦 [ContentBridge] ContentExtractor 提取完成');

  // 2. 轉換為 blocks 格式
  return bridgeContentToBlocks(extractedContent, options);
}

// 導出函數
if (typeof window !== 'undefined') {
  window.bridgeContentToBlocks = bridgeContentToBlocks;
  window.extractAndBridge = extractAndBridge;
  window.createTextBlocks = createTextBlocks;
}

// Node.js 環境導出（用於測試）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    bridgeContentToBlocks,
    extractAndBridge,
    createTextBlocks,
    createFallbackResult,
    getDefaultHtmlConverter,
  };
}
