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
function handleShowHighlighter(sendResponse) {
  if (globalThis.HighlighterV2?.rail) {
    try {
      globalThis.HighlighterV2.rail.show();
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({
        success: false,
        error: formatRuntimeErrorMessage(error, RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTION_FAILED),
      });
    }
  } else {
    sendResponse({ success: false, error: RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_NOT_INITIALIZED });
  }
}

/**
 * 顯示或喚回 Floating Rail
 *
 * @param {object} rail - Floating Rail instance
 * @returns {void|Promise<void>}
 */
function revealFloatingRail(rail) {
  if (rail?.stateManager?.isDismissed && typeof rail.undismiss === 'function') {
    return rail.undismiss();
  }

  if (typeof rail?.show !== 'function') {
    throw new TypeError(RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_SHOW_METHOD_MISSING);
  }

  return rail.show();
}

/**
 * 將 runtime error 正規化為可顯示字串
 *
 * @param {unknown} error - 錯誤物件
 * @param {string} fallbackMessage - 後備錯誤訊息
 * @returns {string}
 */
function formatRuntimeErrorMessage(error, fallbackMessage) {
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  if (typeof error?.message === 'string' && error.message.length > 0) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return fallbackMessage;
    }
  }

  return fallbackMessage;
}

/**
 * 回傳 Floating Rail 錯誤
 *
 * @param {Function} sendResponse - 回應函數
 * @param {unknown} error - 錯誤物件
 */
function sendFloatingRailError(sendResponse, error) {
  sendResponse({
    success: false,
    error: formatRuntimeErrorMessage(error, RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTION_FAILED),
  });
}

/**
 * 判斷值是否為 promise-like
 *
 * @param {unknown} value - 待檢查的值
 * @returns {value is Promise<unknown>}
 */
function isPromiseLike(value) {
  return Boolean(value) && typeof value.then === 'function';
}

/**
 * 清理待完成的 Floating Rail ready promise
 */
function resetFloatingRailReady() {
  globalThis.__NOTION_RAIL_READY__ = undefined;
}

/**
 * 執行依賴 Floating Rail 可用性的 action
 *
 * @param {Function} sendResponse - 回應函數
 * @param {(rail: object) => (void|Promise<void>)} onRailReady - rail action callback
 */
async function withAvailableFloatingRail(sendResponse, onRailReady) {
  const activeRail = globalThis.HighlighterV2?.rail;
  if (activeRail) {
    try {
      const activeResult = onRailReady(activeRail);
      if (isPromiseLike(activeResult)) {
        await activeResult;
      }
      sendResponse({ success: true });
    } catch (error) {
      sendFloatingRailError(sendResponse, error);
    }
    return;
  }

  const railReadyPromise = globalThis.__NOTION_RAIL_READY__;
  if (!railReadyPromise) {
    sendResponse({ success: false, error: RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_NOT_INITIALIZED });
    return;
  }

  try {
    const readyResult = await railReadyPromise;
    if (!readyResult?.success || !readyResult.rail) {
      resetFloatingRailReady();
      sendResponse({
        success: false,
        error: readyResult?.error || RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED,
      });
      return;
    }

    try {
      const readyActionResult = onRailReady(readyResult.rail);
      if (isPromiseLike(readyActionResult)) {
        await readyActionResult;
      }
      sendResponse({ success: true });
    } catch (error) {
      resetFloatingRailReady();
      sendFloatingRailError(sendResponse, error);
    }
  } catch {
    resetFloatingRailReady();
    sendResponse({ success: false, error: RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED });
  }
}

/**
 * 啟動 Floating Rail 標註模式
 *
 * @param {object} rail - Floating Rail instance
 * @returns {void|Promise<void>}
 */
function activateFloatingRailHighlighting(rail) {
  const revealResult = revealFloatingRail(rail);
  if (isPromiseLike(revealResult)) {
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

// ============================================================
// PING 響應機制（供 InjectionService.ensureBundleInjected 使用）
// ============================================================
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  switch (request.action) {
    case CONTENT_BRIDGE_ACTIONS.PING: {
      handlePing(sendResponse);
      return true;
    }

    case HIGHLIGHTER_ACTIONS.SHOW_HIGHLIGHTER: {
      handleShowHighlighter(sendResponse);
      return true;
    }

    case CONTENT_BRIDGE_ACTIONS.SHOW_FLOATING_RAIL: {
      handleShowFloatingRail(sendResponse);
      return true;
    }

    case HIGHLIGHTER_ACTIONS.ACTIVATE_FLOATING_RAIL_HIGHLIGHT: {
      handleActivateFloatingRailHighlight(sendResponse);
      return true;
    }

    case HIGHLIGHTER_ACTIONS.REMOVE_HIGHLIGHT_DOM: {
      handleRemoveHighlightDom(request.highlightId, sendResponse);
      return true;
    }

    case CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL: {
      handleSetStableUrl(request.stableUrl);
      return false;
    }

    default: {
      return false;
    }
  }
});

// ============================================================
// 重放 Preloader 緩衝事件
// ============================================================
chrome.runtime.sendMessage({ action: CONTENT_BRIDGE_ACTIONS.REPLAY_BUFFERED_EVENTS }, response => {
  if (chrome.runtime.lastError) {
    // Preloader 可能尚未載入或已移除，忽略錯誤
    return;
  }

  const events = response?.events;
  if (Array.isArray(events) && events.length > 0) {
    Logger.log('正在重放緩衝事件', { action: 'replayEvents', count: events.length });

    events.forEach(event => {
      if (event.type === 'shortcut') {
        // 觸發快捷鍵處理：啟動 rail 標註模式
        if (globalThis.HighlighterV2?.rail) {
          try {
            Logger.log('重放快捷鍵事件，啟動浮動側欄標註', { action: 'replayEvents' });
            globalThis.HighlighterV2.rail.show();
            globalThis.HighlighterV2.rail.activateHighlighting();
          } catch (error) {
            Logger.warn('重放快捷鍵事件失敗，繼續處理後續事件', {
              action: 'replayEvents',
              error: formatRuntimeErrorMessage(
                error,
                RUNTIME_ERROR_MESSAGES.SHORTCUT_REPLAY_FAILED
              ),
            });
          }
        } else {
          Logger.warn('Highlighter 不可用，無法重放', { action: 'replayEvents' });
        }
      }
    });
  }
});

// 立即打印日誌證明腳本已加載
Logger.log('Content Bundle 已載入', { action: 'loadBundle' });

/**
 * 主要內容提取函數
 * 此函數會被 background.js 通過 executeScript 調用
 *
 * @returns {Promise<{title: string, blocks: Array, metadata: object, additionalImages: Array, coverImage: string|null, debug: object}>}
 */
async function extractPageContent() {
  Logger.log('開始內容提取', { action: 'extractPageContent' });

  try {
    // 1. 提取內容和元數據
    const extractResult = await ContentExtractor.extractAsync(document);
    const { content, type, metadata, blocks: preExtractedBlocks } = extractResult || {};

    // 檢查是否有有效內容 (HTML Content 或預提取的 Blocks)
    const hasContent = content && content.trim().length > 0;
    const hasBlocks = Array.isArray(preExtractedBlocks) && preExtractedBlocks.length > 0;

    if (!hasContent && !hasBlocks) {
      Logger.warn('內容提取失敗或返回空內容', { action: 'extractPageContent' });
      return {
        extractionStatus: 'failed',
        title: document.title || DEFAULT_PAGE_TITLE,
        blocks: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Content extraction failed. The page may be empty or protected.',
                  },
                },
              ],
            },
          },
        ],
        additionalImages: [],
        coverImage: null,
      };
    }

    // 2. 獲取或轉換 Notion Blocks
    let blocks = [];
    let mainImageCount = 0; // [New] Track main images
    if (hasBlocks) {
      Logger.log('使用預提取的 Notion 區塊', {
        action: 'extractPageContent',
        type,
        count: preExtractedBlocks.length,
      });
      blocks = preExtractedBlocks;
      // 簡單統計圖片數量
      mainImageCount = blocks.filter(block => block.type === 'image').length;
    } else {
      Logger.log('正在將內容轉換為 Notion 區塊', { action: 'extractPageContent', type });
      const converter = ConverterFactory.getConverter(type);
      blocks = converter.convert(content);
      mainImageCount = converter.imageCount || 0;
      Logger.log('內容轉換完成', { action: 'extractPageContent', blockCount: blocks.length });
    }

    // 3. 收集額外圖片（可選）
    let additionalImages = [];
    let coverImage = null;
    let imageMetrics = null;
    try {
      // 創建臨時容器來查找圖片
      // 使用 DOMParser 安全解析 HTML 內容，避免直接操作 innerHTML
      let contentElement = null;
      if (content && content.trim().length > 0) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');
        contentElement = doc.body;
      }

      // ImageCollector 預期一個 Element，傳入 doc.body 即可
      const imageResult = await ImageCollector.collectAdditionalImages(contentElement, {
        nextJsBlocks: type === 'nextjs' ? preExtractedBlocks : null,
        mainContentImageCount: mainImageCount,
      });

      // 處理新的返回結構（包含 images、coverImage 和 metrics）
      // 安全地處理 null/undefined 返回值，並支援向後兼容
      const collectedImages =
        imageResult?.images || (Array.isArray(imageResult) ? imageResult : []);
      coverImage = imageResult?.coverImage || null;
      imageMetrics = imageResult?.metrics ?? imageMetrics;

      // 使用工具函數去重
      additionalImages = mergeUniqueImages(blocks, collectedImages);

      // [New] 如果正文沒有圖片，將第一張額外圖片插入到文章開頭
      if (mainImageCount === 0 && additionalImages.length > 0) {
        const leadImage = additionalImages.shift(); // 取出第一張
        blocks.unshift(leadImage); // 插入到開頭
        Logger.log('正文無圖片，已將首張額外圖片插入文章開頭', {
          action: 'extractPageContent',
          imageUrl: `${leadImage?.image?.external?.url?.slice(0, 50)}...`,
        });
      }

      Logger.log('額外圖片收集完成 (已去重)', {
        action: 'extractPageContent',
        originalCount: collectedImages.length,
        finalCount: additionalImages.length,
        hasCoverImage: Boolean(coverImage),
      });
    } catch (imageError) {
      Logger.warn('圖片收集失敗', { action: 'extractPageContent', error: imageError.message });
    }

    // 4. 返回結果
    return {
      extractionStatus: 'success',
      title: metadata.title || document.title || DEFAULT_PAGE_TITLE,
      blocks,
      metadata, // 包含 author, description, favicon
      additionalImages,
      coverImage, // 封面圖片 URL（供 Notion cover 使用）
      // 調試信息
      debug: {
        contentType: type,
        blockCount: blocks.length,
        imageCount: additionalImages.length,
        complexity: extractResult.debug?.complexity,
        imageMetrics,
      },
    };
  } catch (error) {
    Logger.error('內容提取發生異常', {
      action: 'extractPageContent',
      error: error.message,
      stack: error.stack,
    });

    return {
      extractionStatus: 'failed',
      title: document.title || DEFAULT_PAGE_TITLE,
      blocks: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `Extraction error: ${error.message || 'Unknown error'}`,
                },
              },
            ],
          },
        },
      ],
      error: error.message,
      additionalImages: [],
      coverImage: null,
    };
  }
}

// 導出函數供 IIFE 使用
export { extractPageContent };

// IIFE bundle 會將這個賦值給全局 ContentScript 對象
// 同時也需要直接暴露到 window 供 background.js 調用
if (globalThis.window !== undefined) {
  globalThis.extractPageContent = extractPageContent;

  // 單元測試支持：如果檢測到測試環境，自動執行並暴露結果
  if (globalThis.__UNIT_TESTING__) {
    // eslint-disable-next-line unicorn/prefer-top-level-await
    (async () => {
      try {
        globalThis.__notion_extraction_result = await extractPageContent();
      } catch (error) {
        // 僅在測試環境下記錄
        console.error('[Test] Failed to extract page content:', error);
      }
    })();
  }
}
