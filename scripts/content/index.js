/**
 * Content Script Entry Point
 *
 * 此文件整合所有模組化的 Content Script 組件，提供統一的內容提取接口。
 *
 * 執行模式：
 * - 由 background.js 通過 chrome.scripting.executeScript 動態注入
 * - 在頁面上下文中執行（可訪問 DOM、全局變量）
 * - 返回提取結果給 background.js
 *
 * 依賴：
 * - @mozilla/readability - 第三方庫（已透過 npm 打包進 bundle，不再單獨注入）
 */

/* global chrome */

import { CONTENT_QUALITY } from '../config/shared/content.js';
import Logger from '../utils/Logger.js';
import { ContentExtractor } from './extractors/ContentExtractor.js';
import { ConverterFactory } from './converters/ConverterFactory.js';
import { ImageCollector } from './extractors/ImageCollector.js';
import { CONTENT_BRIDGE_ACTIONS } from '../config/runtimeActions/contentBridgeActions.js';
import { HIGHLIGHTER_ACTIONS } from '../config/runtimeActions/highlighterActions.js';
import { RUNTIME_ERROR_MESSAGES } from '../config/runtimeActions/errorMessages.js';
import {
  formatRuntimeErrorMessage,
  revealFloatingRail,
  withAvailableFloatingRail,
} from '../highlighter/utils/floatingRailAvailability.js';
import { mergeUniqueImages } from '../utils/imageUtils.js';
import { isRootUrl } from '../utils/urlUtils.js';
// 載入 Highlighter runtime side-effect entry。
// 自動初始化邏輯已從 highlighter/index.js 拆分至 entryAutoInit.js。
import '../highlighter/entryAutoInit.js';

const { DEFAULT_PAGE_TITLE } = CONTENT_QUALITY;

// ============================================================
// Preloader 快取接管
// ============================================================
let preloaderCache = null;

// 嘗試透過事件獲取快取 (Decoupling Phase 8)
const cacheResponseHandler = event => {
  preloaderCache = event.detail;
  // 保持向後相容，供其他可能舊有的腳本讀取
  globalThis.__NOTION_PRELOADER_CACHE__ = preloaderCache;
};
document.addEventListener('notion-preloader-response', cacheResponseHandler);
document.dispatchEvent(new CustomEvent('notion-preloader-request'));

if (preloaderCache) {
  Logger.debug('偵測到 Preloader 快取', {
    action: 'initializeContentBundle',
    hasArticle: Boolean(preloaderCache.article),
    hasMainContent: Boolean(preloaderCache.mainContent),
    age: `${Date.now() - preloaderCache.timestamp}ms`,
  });
  // 快取可供 ContentExtractor 使用以跳過初始掃描
}

// 標記 Bundle 已就緒（供 Preloader 和 InjectionService 檢測）
globalThis.__NOTION_BUNDLE_READY__ = true;

// ============================================================
// 訊息處理器（抽取以降低認知複雜度）
// ============================================================

/**
 * 處理 PING 請求，回報 bundle 狀態
 *
 * @param {Function} sendResponse - 回應函數
 */
function handlePing(sendResponse) {
  sendResponse({
    status: globalThis.__NOTION_BUNDLE_READY__ ? 'bundle_ready' : 'preloader_only',
    hasPreloaderCache: Boolean(preloaderCache),
    nextRouteInfo: preloaderCache?.nextRouteInfo || null,
    shortlink: preloaderCache?.shortlink || null,
  });
}

/**
 * 處理顯示 Highlighter 請求（legacy alias → rail）
 *
 * @param {Function} sendResponse - 回應函數
 */
async function handleShowHighlighter(sendResponse) {
  await withAvailableFloatingRail(sendResponse, revealFloatingRail);
}

/**
 * 啟動 Floating Rail 標註模式
 *
 * @param {object} rail - Floating Rail instance
 * @returns {void|Promise<void>}
 */
function activateFloatingRailHighlighting(rail) {
  const revealResult = revealFloatingRail(rail);
  if (Boolean(revealResult) && typeof revealResult.then === 'function') {
    return revealResult.then(() => {
      if (typeof rail?.activateHighlighting !== 'function') {
        throw new TypeError(RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTIVATE_METHOD_MISSING);
      }

      return rail.activateHighlighting();
    });
  }

  if (typeof rail?.activateHighlighting !== 'function') {
    throw new TypeError(RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTIVATE_METHOD_MISSING);
  }

  return rail.activateHighlighting();
}

/**
 * 處理顯示 Floating Rail 請求
 *
 * @param {Function} sendResponse - 回應函數
 */
async function handleShowFloatingRail(sendResponse) {
  await withAvailableFloatingRail(sendResponse, revealFloatingRail);
}

/**
 * 處理啟動 Floating Rail 標註模式請求
 *
 * @param {Function} sendResponse - 回應函數
 */
async function handleActivateFloatingRailHighlight(sendResponse) {
  await withAvailableFloatingRail(sendResponse, activateFloatingRailHighlighting);
}

/**
 * 處理移除標註 DOM 請求
 *
 * @param {string} highlightId - 標註 ID
 * @param {Function} sendResponse - 回應函數
 */
function handleRemoveHighlightDom(highlightId, sendResponse) {
  try {
    const removed = globalThis.HighlighterV2?.manager?.removeHighlight?.(highlightId);

    if (removed === undefined) {
      Logger.warn('Highlighter 尚未初始化，略過移除標註 DOM', {
        action: 'REMOVE_HIGHLIGHT_DOM',
        highlightId,
      });
      sendResponse({ success: false, error: 'Highlighter 尚未初始化' });
    } else {
      sendResponse({ success: Boolean(removed) });
    }
  } catch (error) {
    Logger.error('移除標註 DOM 失敗', { action: 'REMOVE_HIGHLIGHT_DOM', error });
    sendResponse({
      success: false,
      error: error?.message ?? '移除標註 DOM 失敗',
    });
  }
}

/**
 * 驗證 URL 是否可作為穩定 URL
 *
 * @param {string} url - 待驗證的 URL
 * @returns {boolean} - true 表示有效，false 表示無效
 */
function isValidStableUrl(url) {
  if (isRootUrl(url)) {
    Logger.debug('拒絕設置首頁 URL 為穩定 URL', { action: 'setStableUrl', rejected: url });
    return false;
  }
  try {
    new URL(url);
    return true;
  } catch {
    Logger.debug('拒絕設置無效 URL 為穩定 URL', { action: 'setStableUrl', rejected: url });
    return false;
  }
}

/**
 * 處理設置穩定 URL 請求（同步處理，不需要 sendResponse）
 *
 * @param {string|undefined} stableUrl - 穩定 URL
 */
function handleSetStableUrl(stableUrl) {
  if (!stableUrl || !isValidStableUrl(stableUrl)) {
    return;
  }
  globalThis.__NOTION_STABLE_URL__ = stableUrl;
  Logger.debug('已接收並設置穩定 URL', { action: 'setStableUrl', stableUrl });
}

const runtimeMessageHandlers = {
  [CONTENT_BRIDGE_ACTIONS.PING]: (_request, sendResponse) => {
    handlePing(sendResponse);
    return true;
  },
  [HIGHLIGHTER_ACTIONS.SHOW_HIGHLIGHTER]: (_request, sendResponse) => {
    handleShowHighlighter(sendResponse);
    return true;
  },
  [CONTENT_BRIDGE_ACTIONS.SHOW_FLOATING_RAIL]: (_request, sendResponse) => {
    handleShowFloatingRail(sendResponse);
    return true;
  },
  [CONTENT_BRIDGE_ACTIONS.SHOW_TOAST]: request => {
    globalThis.HighlighterV2?.toast?.show(request.messageKey, { level: request.level });
    return false;
  },
  [HIGHLIGHTER_ACTIONS.ACTIVATE_FLOATING_RAIL_HIGHLIGHT]: (_request, sendResponse) => {
    handleActivateFloatingRailHighlight(sendResponse);
    return true;
  },
  [HIGHLIGHTER_ACTIONS.REMOVE_HIGHLIGHT_DOM]: (request, sendResponse) => {
    handleRemoveHighlightDom(request.highlightId, sendResponse);
    return true;
  },
  [CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL]: request => {
    handleSetStableUrl(request.stableUrl);
    return false;
  },
};

function handleRuntimeMessage(request, sendResponse) {
  const handler = runtimeMessageHandlers[request.action];
  if (!handler) {
    return false;
  }

  return handler(request, sendResponse);
}

// ============================================================
// PING 響應機制（供 InjectionService.ensureBundleInjected 使用）
// ============================================================
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) =>
  handleRuntimeMessage(request, sendResponse)
);

// ============================================================
// 重放 Preloader 緩衝事件
// ============================================================
function replayShortcutBufferedEvent() {
  const rail = globalThis.HighlighterV2?.rail;
  if (!rail) {
    Logger.warn('Highlighter 不可用，無法重放', { action: 'replayEvents' });
    return;
  }

  try {
    Logger.log('重放快捷鍵事件，啟動浮動側欄標註', { action: 'replayEvents' });
    rail.show();
    rail.activateHighlighting();
  } catch (error) {
    Logger.warn('重放快捷鍵事件失敗，繼續處理後續事件', {
      action: 'replayEvents',
      error,
      errorMessage: formatRuntimeErrorMessage(error, RUNTIME_ERROR_MESSAGES.SHORTCUT_REPLAY_FAILED),
    });
  }
}

function replayBufferedEvent(event) {
  if (event.type === 'shortcut') {
    replayShortcutBufferedEvent();
  }
}

chrome.runtime.sendMessage({ action: CONTENT_BRIDGE_ACTIONS.REPLAY_BUFFERED_EVENTS }, response => {
  if (chrome.runtime.lastError) {
    // Preloader 可能尚未載入或已移除，忽略錯誤
    return;
  }

  const events = response?.events;
  if (Array.isArray(events) && events.length > 0) {
    Logger.log('正在重放緩衝事件', { action: 'replayEvents', count: events.length });
    events.forEach(event => replayBufferedEvent(event));
  }
});

// 立即打印日誌證明腳本已加載
Logger.log('Content Bundle 已載入', { action: 'loadBundle' });

// ============================================================
// 內容提取與輔助函數
// ============================================================

/**
 * 建立段落後備區塊
 *
 * @param {string} content - 段落內容
 * @returns {object} - Notion 段落區塊
 */
function createParagraphFallbackBlock(content) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [
        {
          type: 'text',
          text: {
            content,
          },
        },
      ],
    },
  };
}

/**
 * 建立空提取結果
 *
 * @returns {object} - 失敗提取結果
 */
function createEmptyExtractionResult() {
  return {
    extractionStatus: 'failed',
    title: document.title || DEFAULT_PAGE_TITLE,
    blocks: [
      createParagraphFallbackBlock(
        'Content extraction failed. The page may be empty or protected.'
      ),
    ],
    additionalImages: [],
    coverImage: null,
  };
}

/**
 * 建立提取錯誤結果
 *
 * @param {Error} error - 錯誤物件
 * @returns {object} - 失敗提取結果
 */
function createExtractionErrorResult(error) {
  return {
    extractionStatus: 'failed',
    title: document.title || DEFAULT_PAGE_TITLE,
    blocks: [createParagraphFallbackBlock(`Extraction error: ${error.message || 'Unknown error'}`)],
    error: error.message,
    additionalImages: [],
    coverImage: null,
  };
}

/**
 * 檢查是否有有效提取內容
 *
 * @param {string} content - 提取的內容 HTML
 * @param {Array} preExtractedBlocks - 預提取區塊
 * @returns {boolean} - 是否有有效內容
 */
function hasExtractedContent(content, preExtractedBlocks) {
  const hasContent = content && content.trim().length > 0;
  const hasBlocks = Array.isArray(preExtractedBlocks) && preExtractedBlocks.length > 0;
  return Boolean(hasContent || hasBlocks);
}

/**
 * 解析與轉換 Notion 區塊
 *
 * @param {object} params - 參數
 * @param {string} params.content - HTML 內容
 * @param {string} params.type - 內容類型
 * @param {Array} params.preExtractedBlocks - 預提取區塊
 * @returns {object} - { blocks, mainImageCount }
 */
function resolveExtractedBlocks({ content, type, preExtractedBlocks }) {
  const hasBlocks = Array.isArray(preExtractedBlocks) && preExtractedBlocks.length > 0;
  let blocks = [];
  let mainImageCount = 0;

  if (hasBlocks) {
    Logger.log('使用預提取的 Notion 區塊', {
      action: 'extractPageContent',
      type,
      count: preExtractedBlocks.length,
    });
    blocks = preExtractedBlocks;
    mainImageCount = blocks.filter(block => block.type === 'image').length;
  } else {
    Logger.log('正在將內容轉換為 Notion 區塊', { action: 'extractPageContent', type });
    const converter = ConverterFactory.getConverter(type);
    blocks = converter.convert(content);
    mainImageCount = converter.imageCount || 0;
    Logger.log('內容轉換完成', { action: 'extractPageContent', blockCount: blocks.length });
  }

  return { blocks, mainImageCount };
}

/**
 * 解析 HTML 內容為 DOM 元素
 *
 * @param {string} content - HTML 內容
 * @returns {Element|null} - body 元素 or null
 */
function parseContentElement(content) {
  if (!content || content.trim().length === 0) {
    return null;
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  return doc.body;
}

/**
 * 標準化圖片收集結果
 *
 * @param {object|Array} imageResult - 圖片收集結果
 * @returns {object} - { collectedImages, coverImage, metrics }
 */
function normalizeImageCollectionResult(imageResult) {
  const collectedImages = imageResult?.images || (Array.isArray(imageResult) ? imageResult : []);
  const coverImage = imageResult?.coverImage || null;
  const metrics = imageResult?.metrics ?? null;
  return { collectedImages, coverImage, metrics };
}

/**
 * 必要時將首張額外圖片提升至文章開頭
 *
 * @param {Array} blocks - 區塊列表
 * @param {Array} additionalImages - 額外圖片列表
 * @param {number} mainImageCount - 主要圖片數量
 */
function promoteLeadImageIfNeeded(blocks, additionalImages, mainImageCount) {
  if (mainImageCount === 0 && additionalImages.length > 0) {
    const leadImage = additionalImages.shift();
    blocks.unshift(leadImage);
    Logger.log('正文無圖片，已將首張額外圖片插入文章開頭', {
      action: 'extractPageContent',
      imageUrl: `${leadImage?.image?.external?.url?.slice(0, 50)}...`,
    });
  }
}

/**
 * 收集頁面額外圖片
 *
 * @param {object} params - 參數
 * @param {string} params.content - HTML 內容
 * @param {string} params.type - 內容類型
 * @param {Array} params.preExtractedBlocks - 預提取區塊
 * @param {Array} params.blocks - 已轉換區塊
 * @param {number} params.mainImageCount - 主要圖片數量
 * @returns {Promise<object>} - { additionalImages, coverImage, imageMetrics }
 */
async function collectPageImages({ content, type, preExtractedBlocks, blocks, mainImageCount }) {
  try {
    const contentElement = parseContentElement(content);
    const imageResult = await ImageCollector.collectAdditionalImages(contentElement, {
      nextJsBlocks: type === 'nextjs' ? preExtractedBlocks : null,
      mainContentImageCount: mainImageCount,
    });

    const { collectedImages, coverImage, metrics } = normalizeImageCollectionResult(imageResult);
    const additionalImages = mergeUniqueImages(blocks, collectedImages);

    promoteLeadImageIfNeeded(blocks, additionalImages, mainImageCount);

    Logger.log('額外圖片收集完成 (已去重)', {
      action: 'extractPageContent',
      originalCount: collectedImages.length,
      finalCount: additionalImages.length,
      hasCoverImage: Boolean(coverImage),
    });

    return { additionalImages, coverImage, imageMetrics: metrics };
  } catch (imageError) {
    Logger.warn('圖片收集失敗', { action: 'extractPageContent', error: imageError.message });
    return { additionalImages: [], coverImage: null, imageMetrics: null };
  }
}

/**
 * 建立成功提取結果
 *
 * @param {object} params - 參數
 * @param {object} params.extractResult - 提取器結果
 * @param {string} params.type - 內容類型
 * @param {object} params.metadata - 元數據
 * @param {Array} params.blocks - 區塊列表
 * @param {Array} params.additionalImages - 額外圖片
 * @param {string|null} params.coverImage - 封面圖 URL
 * @param {object|null} params.imageMetrics - 圖片收集統計
 * @returns {object} - 成功提取結果
 */
function createSuccessfulExtractionResult({
  extractResult,
  type,
  metadata,
  blocks,
  additionalImages,
  coverImage,
  imageMetrics,
}) {
  return {
    extractionStatus: 'success',
    title: metadata.title || document.title || DEFAULT_PAGE_TITLE,
    blocks,
    metadata,
    additionalImages,
    coverImage,
    debug: {
      contentType: type,
      blockCount: blocks.length,
      imageCount: additionalImages.length,
      complexity: extractResult.debug?.complexity,
      imageMetrics,
    },
  };
}

/**
 * 主要內容提取函數
 * 此函數會被 background.js 通過 executeScript 調用
 *
 * @returns {Promise<{title: string, blocks: Array, metadata: object, additionalImages: Array, coverImage: string|null, debug: object}>}
 */
async function extractPageContent() {
  Logger.log('開始內容提取', { action: 'extractPageContent' });

  try {
    const extractResult = await ContentExtractor.extractAsync(document);
    const { content, type, metadata, blocks: preExtractedBlocks } = extractResult || {};

    if (!hasExtractedContent(content, preExtractedBlocks)) {
      Logger.warn('內容提取失敗或返回空內容', { action: 'extractPageContent' });
      return createEmptyExtractionResult();
    }

    const { blocks, mainImageCount } = resolveExtractedBlocks({
      content,
      type,
      preExtractedBlocks,
    });

    const { additionalImages, coverImage, imageMetrics } = await collectPageImages({
      content,
      type,
      preExtractedBlocks,
      blocks,
      mainImageCount,
    });

    return createSuccessfulExtractionResult({
      extractResult,
      type,
      metadata,
      blocks,
      additionalImages,
      coverImage,
      imageMetrics,
    });
  } catch (error) {
    Logger.error('內容提取發生異常', {
      action: 'extractPageContent',
      error: error.message,
      stack: error.stack,
    });

    return createExtractionErrorResult(error);
  }
}

// 導出函數供 IIFE 使用
export { extractPageContent };

// IIFE bundle 會將這個賦值給全局 ContentScript 對象
// 同時也需要直接暴露到 window 供 background.js 調用
if (globalThis.window !== undefined) {
  globalThis.extractPageContent = extractPageContent;

  // 單元測試支持：如果檢測到測試環境，暴露 extraction promise 以便測試端 await
  if (globalThis.__UNIT_TESTING__) {
    // eslint-disable-next-line unicorn/prefer-top-level-await
    globalThis.__notion_extraction_promise = (async () => {
      globalThis.__notion_extraction_result = undefined;
      try {
        globalThis.__notion_extraction_result = await extractPageContent();
      } catch (error) {
        globalThis.__notion_extraction_result = {
          extractionStatus: 'failed',
          error: error?.message ?? String(error),
        };
        console.error('[Test] Failed to extract page content:', error);
      }
      return globalThis.__notion_extraction_result;
    })();
  }
}
