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

import { CONTENT_QUALITY } from '../config/constants.js';
import Logger from '../utils/Logger.js';
import { ContentExtractor } from './extractors/ContentExtractor.js';
import { ConverterFactory } from './converters/ConverterFactory.js';
import { ImageCollector } from './extractors/ImageCollector.js';
import { mergeUniqueImages } from '../utils/imageUtils.js';
// 合併 Highlighter bundle：導入以執行其自動初始化邏輯 (setupHighlighter)
import '../highlighter/index.js';

const { DEFAULT_PAGE_TITLE } = CONTENT_QUALITY;

// ============================================================
// Preloader 快取接管
// ============================================================
const preloaderCache = globalThis.__NOTION_PRELOADER_CACHE__;
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
// PING 響應機制（供 InjectionService.ensureBundleInjected 使用）
// ============================================================
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'PING') {
    sendResponse({
      status: 'bundle_ready',
      hasPreloaderCache: Boolean(preloaderCache),
      // Phase 2: 從 preloaderCache 取得穩定 URL 元數據（由 preloader 提取並驗證）
      nextRouteInfo: preloaderCache?.nextRouteInfo || null,
      shortlink: preloaderCache?.shortlink || null,
    });
    return true;
  }

  if (request.action === 'showHighlighter') {
    // 顯示 highlighter toolbar
    if (globalThis.notionHighlighter) {
      globalThis.notionHighlighter.show();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Highlighter not initialized' });
    }
    return true;
  }

  if (request.action === 'SET_STABLE_URL') {
    if (request.stableUrl) {
      globalThis.__NOTION_STABLE_URL__ = request.stableUrl;
      Logger.debug('已接收並設置穩定 URL', {
        action: 'setStableUrl',
        stableUrl: request.stableUrl,
      });
    }
    return false;
  }

  // 未處理的訊息不需要異步響應
  return false;
});

// ============================================================
// 重放 Preloader 緩衝事件
// ============================================================
chrome.runtime.sendMessage({ action: 'REPLAY_BUFFERED_EVENTS' }, response => {
  if (chrome.runtime.lastError) {
    // Preloader 可能尚未載入或已移除，忽略錯誤
    return;
  }

  const events = response?.events;
  if (Array.isArray(events) && events.length > 0) {
    Logger.log('正在重放緩衝事件', { action: 'replayEvents', count: events.length });

    events.forEach(event => {
      if (event.type === 'shortcut') {
        // 觸發快捷鍵處理：顯示 highlighter toolbar
        if (globalThis.notionHighlighter) {
          Logger.log('重放快捷鍵事件，顯示工具欄', { action: 'replayEvents' });
          globalThis.notionHighlighter.show();
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
 * @returns {Promise<{title: string, blocks: Array, rawHtml: string, metadata: object, additionalImages: Array, coverImage: string|null, debug: object}>}
 */
async function extractPageContent() {
  Logger.log('開始內容提取', { action: 'extractPageContent' });

  try {
    // 1. 提取內容和元數據
    const extractResult = ContentExtractor.extract(document);
    const { content, type, metadata, blocks: preExtractedBlocks } = extractResult || {};

    // 檢查是否有有效內容 (HTML Content 或預提取的 Blocks)
    const hasContent = content && content.trim().length > 0;
    const hasBlocks = Array.isArray(preExtractedBlocks) && preExtractedBlocks.length > 0;

    if (!hasContent && !hasBlocks) {
      Logger.warn('內容提取失敗或返回空內容', { action: 'extractPageContent' });
      return {
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
        rawHtml: '',
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

      // 處理新的返回結構（包含 images 和 coverImage）
      // 安全地處理 null/undefined 返回值，並支援向後兼容
      const collectedImages =
        imageResult?.images || (Array.isArray(imageResult) ? imageResult : []);
      coverImage = imageResult?.coverImage || null;

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
      title: metadata.title || document.title || DEFAULT_PAGE_TITLE,
      blocks,
      rawHtml: content,
      metadata, // 包含 author, description, favicon
      additionalImages,
      coverImage, // 封面圖片 URL（供 Notion cover 使用）
      // 調試信息
      debug: {
        contentType: type,
        blockCount: blocks.length,
        imageCount: additionalImages.length,
        complexity: extractResult.debug?.complexity,
      },
    };
  } catch (error) {
    Logger.error('內容提取發生異常', {
      action: 'extractPageContent',
      error: error.message,
      stack: error.stack,
    });

    return {
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
      rawHtml: '',
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
