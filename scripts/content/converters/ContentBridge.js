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

import { TEXT_PROCESSING } from '../../config/shared/content.js';

/**
 * 將 ContentExtractor 的提取結果轉換為 background.js 預期的格式
 *
 * @param {object} extractedContent - ContentExtractor.extract() 的返回值
 * @param {object} options - 配置選項
 * @param {boolean} options.includeFeaturedImage - 是否在 blocks 開頭插入封面圖
 * @param {Function} options.htmlConverter - HTML 轉換函數 (預設使用 window.convertHtmlToNotionBlocks)
 * @returns {object} { title, blocks, siteIcon }
 */
function bridgeContentToBlocks(extractedContent, options = {}) {
  const { includeFeaturedImage = true, includeTitle = false } = options;

  // 驗證輸入
  if (!extractedContent) {
    Logger.warn('收到空的提取內容', { action: 'bridgeContentToBlocks' });
    return createFallbackResult('Untitled', 'No content was extracted.');
  }

  const { content, type, metadata = {}, rawArticle } = extractedContent;

  // 1. 提取標題
  const title = _extractTitle(metadata, rawArticle);
  Logger.debug('[ContentBridge] 處理標題', {
    action: 'bridgeContentToBlocks',
    titleLength: title ? title.length : 0,
  });

  // 2. 轉換內容為 Notion Blocks
  const blocks = _ensureBlocks(_convertContent(content, type, options));

  Logger.success('[ContentBridge] 區塊生成完成', {
    action: 'bridgeContentToBlocks',
    count: blocks.length,
  });

  // 3. 插入元數據 (封面圖等)
  _insertMetaBlocks(blocks, metadata, { includeFeaturedImage, includeTitle });

  return {
    title,
    blocks,
    siteIcon: _extractSiteIcon(metadata),
  };
}

function _ensureBlocks(blocks) {
  if (Array.isArray(blocks) && blocks.length > 0) {
    return blocks;
  }

  Logger.warn('轉換結果為空，創建回退區塊', { action: 'bridgeContentToBlocks' });
  return _createFallbackBlocks();
}

function _extractSiteIcon(metadata) {
  if (metadata.siteIcon) {
    return metadata.siteIcon;
  }

  if (metadata.favicon) {
    return metadata.favicon;
  }

  return null;
}

function _extractTitle(metadata, rawArticle) {
  return (
    metadata.title ||
    rawArticle?.title ||
    (typeof document === 'undefined' ? '' : document.title) ||
    'Untitled'
  );
}

function _convertContent(content, type, options) {
  if (!content) {
    return [];
  }

  if (!_isConvertibleContentType(type)) {
    Logger.warn('未知內容類型，使用回退處理', { action: 'bridgeContentToBlocks', type });
    return createTextBlocks(content);
  }

  try {
    Logger.info('[ContentBridge] 準備轉換內容', { action: 'bridgeContentToBlocks', type });
    const converter = _resolveConverter(type, options);

    if (!converter) {
      Logger.warn('轉換器不可用', { action: 'bridgeContentToBlocks', type });
      return createTextBlocks(content);
    }

    return converter.convert(content);
  } catch (error) {
    Logger.error('內容轉換失敗', { action: 'bridgeContentToBlocks', error: error.message });
    return createTextBlocks(content);
  }
}

function _isConvertibleContentType(type) {
  return type === 'html' || type === 'markdown';
}

function _resolveConverter(type, options) {
  if (options.htmlConverter) {
    return options.htmlConverter;
  }

  if (globalThis.domConverter) {
    return globalThis.domConverter;
  }

  if (!globalThis.ConverterFactory) {
    return null;
  }

  return globalThis.ConverterFactory.getConverter(type);
}

function _createFallbackBlocks() {
  return [_createParagraphBlock('Content extraction completed but no blocks were generated.')];
}

function _insertMetaBlocks(blocks, metadata, options = {}) {
  const { includeFeaturedImage = true, includeTitle = false } = options;

  _insertTitleBlock(blocks, metadata, includeTitle);
  _insertFeaturedImageBlock(blocks, metadata, includeFeaturedImage);
}

function _insertTitleBlock(blocks, metadata, includeTitle) {
  if (!includeTitle) {
    return;
  }

  if (!metadata.title) {
    return;
  }

  const truncatedTitle = _truncateRichText(metadata.title);
  if (_hasHeadingTitle(blocks, truncatedTitle)) {
    return;
  }

  blocks.splice(0, 0, _createHeadingBlock(truncatedTitle));
}

function _truncateRichText(text) {
  return text.slice(0, TEXT_PROCESSING.MAX_RICH_TEXT_LENGTH);
}

function _hasHeadingTitle(blocks, title) {
  return blocks.some(
    block => block.type === 'heading_1' && block.heading_1?.rich_text?.[0]?.text?.content === title
  );
}

function _createHeadingBlock(content) {
  return {
    object: 'block',
    type: 'heading_1',
    heading_1: {
      rich_text: [
        {
          type: 'text',
          text: { content },
        },
      ],
    },
  };
}

function _insertFeaturedImageBlock(blocks, metadata, includeFeaturedImage) {
  if (!includeFeaturedImage) {
    return;
  }

  const featuredImageUrl = metadata.featuredImage;
  if (!featuredImageUrl) {
    return;
  }

  if (_hasImageBlock(blocks, featuredImageUrl)) {
    Logger.debug('[ContentBridge] 封面圖已存在，跳過插入', { action: 'bridgeContentToBlocks' });
    return;
  }

  blocks.unshift(_createImageBlock(featuredImageUrl));
  Logger.debug('[ContentBridge] 封面圖已插入到區塊開頭', { action: 'bridgeContentToBlocks' });
}

function _hasImageBlock(blocks, url) {
  return blocks.some(block => block.type === 'image' && block.image?.external?.url === url);
}

function _createImageBlock(url) {
  return {
    object: 'block',
    type: 'image',
    image: {
      type: 'external',
      external: { url },
    },
  };
}

/**
 * 創建回退結果
 *
 * @param {string} title - 標題
 * @param {string} message - 訊息
 * @returns {object}
 */
function createFallbackResult(title, message) {
  return {
    title,
    blocks: [_createParagraphBlock(message)],
    siteIcon: null,
  };
}

/**
 * 將純文本轉換為段落區塊（回退方案）
 *
 * @param {string} content - 文本內容
 * @returns {Array<object>}
 */
function createTextBlocks(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }

  // 嘗試移除 HTML 標籤
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  const text = doc.body.textContent || '';

  if (!text.trim()) {
    return [];
  }

  return _splitTextIntoParagraphs(text).flatMap(paragraph =>
    _createChunkedParagraphBlocks(paragraph)
  );
}

function _splitTextIntoParagraphs(text) {
  return text
    .split('\n\n')
    .map(para => para.trim())
    .filter(Boolean);
}

function _createChunkedParagraphBlocks(text) {
  const blocks = [];

  for (let pos = 0; pos < text.length; pos += TEXT_PROCESSING.MAX_RICH_TEXT_LENGTH) {
    blocks.push(_createParagraphBlock(text.slice(pos, pos + TEXT_PROCESSING.MAX_RICH_TEXT_LENGTH)));
  }

  return blocks;
}

function _createParagraphBlock(content) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content } }],
    },
  };
}

/**
 * 執行完整的內容提取和轉換流程
 * 這是一個高階函數，整合 ContentExtractor 和 ContentBridge
 *
 * @param {Document} doc - DOM Document
 * @param {object} options - 配置選項
 * @returns {object} { title, blocks, siteIcon }
 */
function extractAndBridge(doc, options = {}) {
  // 動態導入 ContentExtractor
  // 注意：這個函數預期在注入的頁面環境中執行，ContentExtractor 應該已經載入
  const ContentExtractor = globalThis.ContentExtractor;

  if (!ContentExtractor) {
    Logger.warn('ContentExtractor 未載入，使用回退', { action: 'extractAndBridge' });
    return createFallbackResult(doc.title || 'Untitled', 'ContentExtractor is not available.');
  }

  // 1. 使用 ContentExtractor 提取內容
  const extractedContent = ContentExtractor.extract(doc);
  Logger.success('[ContentBridge] ContentExtractor 提取完成', { action: 'extractAndBridge' });

  // 2. 轉換為 blocks 格式
  return bridgeContentToBlocks(extractedContent, options);
}

// 導出函數
if (globalThis.window !== undefined) {
  globalThis.bridgeContentToBlocks = bridgeContentToBlocks;
  globalThis.extractAndBridge = extractAndBridge;
  globalThis.createTextBlocks = createTextBlocks;
}

// Node.js 環境導出（用於測試）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    bridgeContentToBlocks,
    extractAndBridge,
    createTextBlocks,
    createFallbackResult,
  };
}
