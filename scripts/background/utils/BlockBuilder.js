/**
 * Notion Block Builder 工具類
 *
 * 提供無狀態的工廠方法，用於構建各種 Notion Block 結構。
 * 這些方法在 background script 端使用，處理從 content script 提取的內容。
 *
 * @author Content Extraction Team
 */

// 導入統一配置（從統一入口點導入，保持一致性）
import { TEXT_PROCESSING } from '../../config/index.js';
import { NOTION_API } from '../../config/extension/notionApi.js';
import { NOTION_CODE_LANGUAGE_PLAIN_TEXT } from '../../config/notionCodeLanguages.js';

/**
 * 文本內容最大長度（從統一配置獲取）
 *
 * @constant {number}
 */
const MAX_TEXT_LENGTH = TEXT_PROCESSING?.MAX_RICH_TEXT_LENGTH || 2000;

/**
 * 智能分割最小比例門檻
 *
 * @constant {number}
 */
const MIN_SPLIT_RATIO = 0.5;

/**
 * 高亮標記區域標題（從統一配置獲取）
 *
 * @constant {string}
 */
const HIGHLIGHT_SECTION_HEADER = NOTION_API?.HIGHLIGHT_SECTION_HEADER || '📝 頁面標記';

/**
 * 創建 rich_text 對象
 *
 * @param {string} content - 文本內容
 * @param {object} options - 選項
 * @param {string} options.color - 文本顏色 (default, gray, brown, orange, yellow, green, blue, purple, pink, red)
 * @param {boolean} options.bold - 粗體
 * @param {boolean} options.italic - 斜體
 * @param {boolean} options.strikethrough - 刪除線
 * @param {boolean} options.underline - 底線
 * @param {boolean} options.code - 代碼樣式
 * @param {string} options.link - 連結 URL
 * @returns {object} rich_text 對象
 */
function createRichText(content, options = {}) {
  const text = (content || '').slice(0, Math.max(0, MAX_TEXT_LENGTH));

  const richText = {
    type: 'text',
    text: { content: text },
  };

  // 添加連結
  if (options.link) {
    richText.text.link = { url: options.link };
  }

  // 添加樣式註解
  const annotations = {};
  if (options.color && options.color !== 'default') {
    annotations.color = options.color;
  }
  if (options.bold) {
    annotations.bold = true;
  }
  if (options.italic) {
    annotations.italic = true;
  }
  if (options.strikethrough) {
    annotations.strikethrough = true;
  }
  if (options.underline) {
    annotations.underline = true;
  }
  if (options.code) {
    annotations.code = true;
  }

  if (Object.keys(annotations).length > 0) {
    richText.annotations = annotations;
  }

  return richText;
}

/**
 * 創建段落區塊
 *
 * @param {string} content - 段落內容
 * @param {object} options - rich_text 選項
 * @returns {object} Notion paragraph block
 */
function createParagraph(content, options = {}) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [createRichText(content, options)],
    },
  };
}

/**
 * 創建標題區塊
 *
 * @param {string} content - 標題內容
 * @param {number} level - 標題層級 (1, 2, 3)
 * @returns {object} Notion heading block
 */
function createHeading(content, level = 2) {
  const validLevel = Math.min(Math.max(level, 1), 3);
  const headingType = `heading_${validLevel}`;

  return {
    object: 'block',
    type: headingType,
    [headingType]: {
      rich_text: [createRichText(content)],
    },
  };
}

/**
 * 創建圖片區塊
 *
 * @param {string} url - 圖片 URL
 * @param {string} caption - 圖片說明 (可選)
 * @returns {object} Notion image block
 */
function createImage(url, caption = '') {
  const block = {
    object: 'block',
    type: 'image',
    image: {
      type: 'external',
      external: { url },
    },
  };

  if (caption) {
    block.image.caption = [createRichText(caption)];
  }

  return block;
}

/**
 * 創建代碼區塊
 *
 * @param {string} code - 代碼內容
 * @param {string} language - 程式語言 (默認 plain text)
 * @returns {object} Notion code block
 */
function createCodeBlock(code, language = NOTION_CODE_LANGUAGE_PLAIN_TEXT) {
  return {
    object: 'block',
    type: 'code',
    code: {
      rich_text: [createRichText(code)],
      language,
    },
  };
}

/**
 * 創建項目符號列表項
 *
 * @param {string} content - 列表項內容
 * @returns {object} Notion bulleted_list_item block
 */
function createBulletItem(content) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: [createRichText(content)],
    },
  };
}

/**
 * 創建編號列表項
 *
 * @param {string} content - 列表項內容
 * @returns {object} Notion numbered_list_item block
 */
function createNumberedItem(content) {
  return {
    object: 'block',
    type: 'numbered_list_item',
    numbered_list_item: {
      rich_text: [createRichText(content)],
    },
  };
}

/**
 * 創建引用區塊
 *
 * @param {string} content - 引用內容
 * @returns {object} Notion quote block
 */
function createQuote(content) {
  return {
    object: 'block',
    type: 'quote',
    quote: {
      rich_text: [createRichText(content)],
    },
  };
}

/**
 * 創建分隔線
 *
 * @returns {object} Notion divider block
 */
function createDivider() {
  return {
    object: 'block',
    type: 'divider',
    divider: {},
  };
}

/**
 * 計算文本智能分割索引
 *
 * @param {string} remaining - 剩餘文本
 * @param {number} maxLength - 最大長度
 * @returns {number} 分割索引（> 0 保證可切出非空 chunk）
 */
function _findSplitIndex(remaining, maxLength) {
  const safeMax = Math.floor(Number(maxLength));

  if (!Number.isFinite(maxLength) || safeMax <= 0) {
    return 0;
  }

  const punctuation = ['\n\n', '\n', '\u3002', '.', '\uFF1F', '?', '\uFF01', '!'];
  for (const punct of punctuation) {
    const idx = remaining.lastIndexOf(punct, safeMax - 1);
    if (idx > safeMax * MIN_SPLIT_RATIO) {
      return idx + punct.length;
    }
  }

  const spaceIdx = remaining.lastIndexOf(' ', safeMax - 1);
  if (spaceIdx > safeMax * MIN_SPLIT_RATIO) {
    return spaceIdx;
  }

  return safeMax;
}

/**
 * 將長文本分割成符合 Notion 限制的片段 (智能分割)
 * Notion API 限制每個 rich_text 區塊最多 2000 字符
 *
 * @param {string} text - 原始文本
 * @param {number} maxLength - 最大長度
 * @returns {string[]} 分割後的文本片段
 */
function splitTextForHighlight(text, maxLength = 2000) {
  if (!text) {
    return [''];
  }

  const safeMax = Math.floor(Number(maxLength));

  if (!Number.isFinite(maxLength) || safeMax <= 0) {
    return [text];
  }

  if (text.length <= safeMax) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= safeMax) {
      chunks.push(remaining);
      break;
    }

    const splitIndex = _findSplitIndex(remaining, safeMax);
    if (splitIndex <= 0) {
      chunks.push(remaining);
      break;
    }

    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  return chunks.filter(chunk => chunk.length > 0);
}
function buildHighlightBlocks(highlights, title = HIGHLIGHT_SECTION_HEADER) {
  if (!highlights || highlights.length === 0) {
    return [];
  }

  const blocks = [createHeading(title, 3)];

  highlights.forEach(highlight => {
    const text = highlight.text || '';
    // Use smart splitting logic
    const textChunks = splitTextForHighlight(text, MAX_TEXT_LENGTH);

    textChunks.forEach(chunk => {
      blocks.push(
        createParagraph(chunk, {
          color: highlight.color || 'default',
        })
      );
    });
  });

  return blocks;
}

/**
 * 將純文本內容轉換為段落區塊數組
 *
 * @param {string} text - 純文本內容
 * @param {object} options - 選項
 * @param {number} options.minLength - 最小段落長度 (默認 10)
 * @returns {Array} Notion paragraph blocks 數組
 */
function textToParagraphs(text, options = {}) {
  const { minLength = 10 } = options;

  if (!text || typeof text !== 'string') {
    return [];
  }

  const paragraphs = text
    .split('\n\n')
    .map(para => para.trim())
    .filter(para => para.length >= minLength);

  return paragraphs.map(para => createParagraph(para));
}

/**
 * 創建錯誤回退區塊
 *
 * @param {string} message - 錯誤訊息
 * @returns {Array} 包含錯誤訊息的 blocks 數組
 */
function createFallbackBlocks(message = 'Content extraction failed.') {
  return [createParagraph(message)];
}

/**
 * 驗證區塊結構是否有效
 *
 * @param {object} block - Notion block 對象
 * @returns {boolean} 是否為有效區塊
 */
function isValidBlock(block) {
  if (!block || typeof block !== 'object') {
    return false;
  }
  return block.object === 'block' && typeof block.type === 'string';
}

// 模組導出（ES6 語法）
export {
  // 常量
  MAX_TEXT_LENGTH,

  // 基礎創建函數
  createRichText,
  createParagraph,
  createHeading,
  createImage,
  createCodeBlock,
  createBulletItem,
  createNumberedItem,
  createQuote,
  createDivider,

  // 高級構建函數
  buildHighlightBlocks,
  splitTextForHighlight,
  textToParagraphs,
  createFallbackBlocks,

  // 驗證函數
  isValidBlock,
};
