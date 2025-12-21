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
 * - Readability.js - 第三方庫（與此 Bundle 一同注入）
 */

/* global chrome */

import Logger from '../utils/Logger.js';
import { ContentExtractor } from './extractors/ContentExtractor.js';
import { ConverterFactory } from './converters/ConverterFactory.js';
import { ImageCollector } from './extractors/ImageCollector.js';
// 合併 Highlighter bundle：導入以執行其自動初始化邏輯 (setupHighlighter)
import '../highlighter/index.js';

// ============================================================
// Preloader 快取接管
// ============================================================
const preloaderCache = window.__NOTION_PRELOADER_CACHE__;
if (preloaderCache) {
  Logger.log('🔄 [Content Bundle] Preloader cache detected:', {
    hasArticle: Boolean(preloaderCache.article),
    hasMainContent: Boolean(preloaderCache.mainContent),
    age: `${Date.now() - preloaderCache.timestamp}ms`,
  });
  // 快取可供 ContentExtractor 使用以跳過初始掃描
}

// 標記 Bundle 已就緒（供 Preloader 和 InjectionService 檢測）
window.__NOTION_BUNDLE_READY__ = true;

// ============================================================
// PING 響應機制（供 InjectionService.ensureBundleInjected 使用）
// ============================================================
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'PING') {
    sendResponse({
      status: 'bundle_ready',
      hasPreloaderCache: Boolean(preloaderCache),
    });
    return true;
  }
});

// 立即打印日誌證明腳本已加載
Logger.log('🚀 [Save to Notion] Content Bundle Loaded! Access via extension context.');

/**
 * 主要內容提取函數
 * 此函數會被 background.js 通過 executeScript 調用
 *
 * @returns {Promise<{title: string, blocks: Array, rawHtml: string}>}
 */
async function extractPageContent() {
  Logger.log('🚀 [Content Script] Starting content extraction...');

  try {
    // 1. 提取內容和元數據
    const extractResult = ContentExtractor.extract(document);

    if (!extractResult || !extractResult.content) {
      Logger.warn('⚠️ Content extraction failed or returned empty content');
      return {
        title: document.title || 'Untitled Page',
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
      };
    }

    const { content, type, metadata } = extractResult;

    // 2. 轉換為 Notion Blocks
    Logger.log(`📝 Converting content (type: ${type}) to Notion Blocks...`);
    const converter = ConverterFactory.getConverter(type);
    const blocks = converter.convert(content);

    Logger.log(`✅ Converted ${blocks.length} blocks`);

    // 3. 收集額外圖片（可選）
    let additionalImages = [];
    try {
      // 創建臨時容器來查找圖片
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;

      additionalImages = await ImageCollector.collectAdditionalImages(tempDiv);
      Logger.log(`📸 Collected ${additionalImages.length} additional images`);
    } catch (imageError) {
      Logger.warn('⚠️ Image collection failed:', imageError);
    }

    // 4. 返回結果
    return {
      title: metadata.title || document.title || 'Untitled Page',
      blocks,
      rawHtml: content,
      metadata, // 包含 author, description, favicon
      additionalImages,
      // 調試信息
      debug: {
        contentType: type,
        blockCount: blocks.length,
        imageCount: additionalImages.length,
        complexity: extractResult.debug?.complexity,
      },
    };
  } catch (error) {
    Logger.error('❌ [Content Script] Extraction failed:', error);

    return {
      title: document.title || 'Untitled Page',
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
    };
  }
}

// 導出函數供 IIFE 使用
export { extractPageContent };

// IIFE bundle 會將這個賦值給全局 ContentScript 對象
// 同時也需要直接暴露到 window 供 background.js 調用
if (typeof window !== 'undefined') {
  window.extractPageContent = extractPageContent;

  // 單元測試支持：如果檢測到測試環境，自動執行並暴露結果
  if (window.__UNIT_TESTING__) {
    extractPageContent().then(result => {
      window.__notion_extraction_result = result;
    });
  }
}
