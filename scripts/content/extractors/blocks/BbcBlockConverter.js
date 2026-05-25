/**
 * BbcBlockConverter.js
 * 專門負責 BBC blocks 格式轉換為 Notion 區塊的 pure functions 模組
 */

import { BBC_DEFAULT_IMAGE_WIDTH, BBC_IMAGE_BASE_URL } from '../../../config/shared/content.js';

/**
 * 偵測是否為 BBC {type, model} 格式
 * BBC blocks 使用 `type` + `model`，而非 `blockType` + `text`
 *
 * @param {Array} blocks
 * @returns {boolean}
 */
export function isBbcFormat(blocks) {
  if (!Array.isArray(blocks)) {
    return false;
  }
  return blocks.some(
    block =>
      block != null &&
      typeof block === 'object' &&
      typeof block.type === 'string' &&
      block.model != null &&
      typeof block.model === 'object' &&
      !block.blockType
  );
}

/**
 * 轉換 BBC {type, model} 巢狀 blocks 為 Notion Blocks
 *
 * @param {Array} blocks - BBC 頂層 blocks 陣列
 * @param {object} deps - 外部依賴
 * @param {Function} deps.richTextChunkBuilder - 建立富文本 chunks 的函式
 * @returns {Array} Notion blocks
 */
export function convertBbcBlocks(blocks, deps) {
  if (!Array.isArray(blocks)) {
    return [];
  }
  const result = [];
  for (const block of blocks) {
    processSingleBbcBlock(block, result, deps);
  }
  return result;
}

/**
 * 處理單一 BBC Block，將轉碼結果附加到 result 陣列中
 *
 * @param {object} block - 單一 block 物件
 * @param {Array} result - 收集區塊結果的陣列
 * @param {object} deps - 外部依賴
 */
export function processSingleBbcBlock(block, result, deps) {
  if (!block || typeof block !== 'object') {
    return;
  }

  const { type, model } = block;

  if (!type || !model) {
    return;
  }

  switch (type) {
    case 'headline': {
      const h1Block = buildBbcHeadingBlock(model, false, deps);
      if (h1Block) {
        result.push(h1Block);
      }
      break;
    }

    case 'subheadline': {
      const h2Block = buildBbcHeadingBlock(model, true, deps);
      if (h2Block) {
        result.push(h2Block);
      }
      break;
    }

    case 'text': {
      result.push(...buildBbcTextBlocks(model, deps));
      break;
    }

    case 'image': {
      const imgBlock = buildBbcImageBlock(model, deps);
      if (imgBlock) {
        result.push(imgBlock);
      }
      break;
    }

    // 跳過頁面雜訊 block 類型
    case 'byline':
    case 'relatedContent':
    case 'wsoj':
    case 'include':
    case 'social-embed': {
      break;
    }

    default: {
      // 嘗試通用文字提取（作為安全網）
      const fallbackBlock = buildBbcFallbackBlock(model, deps);
      if (fallbackBlock) {
        result.push(fallbackBlock);
      }
      break;
    }
  }
}

/**
 * 遞歸提取 BBC model 中的純文字
 *
 * @param {object} model - BBC model 物件
 * @returns {string} 合併後的純文字
 */
export function extractBbcText(model) {
  if (!model || typeof model !== 'object') {
    return '';
  }

  // 直接有 text 屬性（fragment 層級）
  if (typeof model.text === 'string' && model.text.trim()) {
    return model.text.trim();
  }

  // 遞歸遍歷子 blocks
  if (Array.isArray(model.blocks)) {
    return model.blocks
      .map(child =>
        child && typeof child === 'object' ? extractBbcText(child.model || child) : ''
      )
      .filter(Boolean)
      .join('');
  }

  return '';
}

/**
 * 建立 BBC Heading (H1 / H2) Block
 *
 * @param {object} model
 * @param {boolean} isSubheading
 * @param {object} deps
 * @returns {object|null}
 */
export function buildBbcHeadingBlock(model, isSubheading, deps) {
  const text = extractBbcText(model);
  if (!text) {
    return null;
  }
  const blockType = isSubheading ? 'heading_2' : 'heading_1';
  return {
    object: 'block',
    type: blockType,
    [blockType]: { rich_text: deps.richTextChunkBuilder(text) },
  };
}

/**
 * 建立 BBC Text Blocks (可能有多個 Paragraphs)
 *
 * @param {object} model
 * @param {object} deps
 * @returns {Array}
 */
export function buildBbcTextBlocks(model, deps) {
  const result = [];
  const paragraphs = Array.isArray(model.blocks) ? model.blocks : [];
  for (const para of paragraphs) {
    if (!para || typeof para !== 'object') {
      continue;
    }
    if (para.type === 'paragraph' || para.type === 'introduction') {
      const paraText = extractBbcText(para.model || {});
      if (paraText) {
        result.push({
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: deps.richTextChunkBuilder(paraText) },
        });
      }
    }
  }
  return result;
}

/**
 * 建立 BBC Image Block
 *
 * @param {object} model
 * @param {object} deps
 * @returns {object|null}
 */
export function buildBbcImageBlock(model, deps) {
  const subBlocks = Array.isArray(model.blocks) ? model.blocks : [];
  const rawImage = subBlocks.find(blk => blk.type === 'rawImage');
  const captionBlock = subBlocks.find(blk => blk.type === 'caption');

  if (rawImage?.model?.locator && rawImage?.model?.originCode) {
    const { locator, originCode } = rawImage.model;
    const imageUrl = `${BBC_IMAGE_BASE_URL}/${BBC_DEFAULT_IMAGE_WIDTH}/${originCode}/${locator}.webp`;
    const captionText = captionBlock ? extractBbcText(captionBlock.model || {}) : '';

    return {
      object: 'block',
      type: 'image',
      image: {
        type: 'external',
        external: { url: imageUrl },
        caption: captionText ? deps.richTextChunkBuilder(captionText) : [],
      },
    };
  }
  return null;
}

/**
 * 建立 BBC 通用 Fallback Text Block
 *
 * @param {object} model
 * @param {object} deps
 * @returns {object|null}
 */
export function buildBbcFallbackBlock(model, deps) {
  if (model.blocks || model.text) {
    const fallbackText = extractBbcText(model);
    if (fallbackText) {
      return {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: deps.richTextChunkBuilder(fallbackText) },
      };
    }
  }
  return null;
}
