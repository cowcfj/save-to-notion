/**
 * BbcBlockConverter.js
 * 專門負責 BBC blocks 格式轉換為 Notion 區塊的 pure functions 模組
 */

import { BBC_DEFAULT_IMAGE_WIDTH, BBC_IMAGE_BASE_URL } from '../../../config/shared/content.js';

const SKIPPED_BBC_BLOCK_TYPES = new Set([
  'byline',
  'relatedContent',
  'wsoj',
  'include',
  'social-embed',
]);

function wrapSingleBlock(block) {
  return block ? [block] : [];
}

const BBC_BLOCK_HANDLERS = {
  headline: (model, deps) => wrapSingleBlock(buildBbcHeadingBlock(model, false, deps)),
  subheadline: (model, deps) => wrapSingleBlock(buildBbcHeadingBlock(model, true, deps)),
  text: (model, deps) => buildBbcTextBlocks(model, deps),
  image: (model, deps) => wrapSingleBlock(buildBbcImageBlock(model, deps)),
};

function defaultBbcHandler(model, deps) {
  return wrapSingleBlock(buildBbcFallbackBlock(model, deps));
}

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

  if (SKIPPED_BBC_BLOCK_TYPES.has(type)) {
    return;
  }

  const handler = BBC_BLOCK_HANDLERS[type] || defaultBbcHandler;
  result.push(...handler(model, deps));
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

  const direct = getDirectBbcText(model);
  if (direct) {
    return direct;
  }

  if (Array.isArray(model.blocks)) {
    return joinBbcChildText(model.blocks);
  }

  return '';
}

function getDirectBbcText(model) {
  if (typeof model.text !== 'string') {
    return '';
  }
  return model.text.trim();
}

function joinBbcChildText(blocks) {
  return blocks
    .map(child => (child && typeof child === 'object' ? extractBbcText(child.model || child) : ''))
    .filter(Boolean)
    .join('');
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
  const paragraphs = Array.isArray(model.blocks) ? model.blocks : [];
  return paragraphs.map(para => buildBbcParagraphBlock(para, deps)).filter(Boolean);
}

const BBC_PARAGRAPH_TYPES = new Set(['paragraph', 'introduction']);

function buildBbcParagraphBlock(para, deps) {
  if (!isBbcParagraphLike(para)) {
    return null;
  }
  const paraText = extractBbcText(para.model || {});
  if (!paraText) {
    return null;
  }
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: deps.richTextChunkBuilder(paraText) },
  };
}

function isBbcParagraphLike(para) {
  if (!para || typeof para !== 'object') {
    return false;
  }
  return BBC_PARAGRAPH_TYPES.has(para.type);
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
  const imageUrl = extractBbcImageUrl(subBlocks);
  if (!imageUrl) {
    return null;
  }
  const captionText = extractBbcImageCaption(subBlocks);
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

function extractBbcImageUrl(subBlocks) {
  const rawImage = subBlocks.find(blk => blk.type === 'rawImage');
  const locator = rawImage?.model?.locator;
  const originCode = rawImage?.model?.originCode;
  if (!locator || !originCode) {
    return null;
  }
  return `${BBC_IMAGE_BASE_URL}/${BBC_DEFAULT_IMAGE_WIDTH}/${originCode}/${locator}.webp`;
}

function extractBbcImageCaption(subBlocks) {
  const captionBlock = subBlocks.find(blk => blk.type === 'caption');
  return captionBlock ? extractBbcText(captionBlock.model || {}) : '';
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
