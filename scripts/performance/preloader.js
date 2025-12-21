/**
 * Preloader - 極輕量預載器
 *
 * 職責：
 * 1. 監聽快捷鍵 (Ctrl+S / Cmd+S)
 * 2. 接收 Background 訊息
 * 3. 輕量預熱（快取 article 節點）
 * 4. 與主 Bundle 橋接
 *
 * 設計原則：
 * - 獨立運行，不依賴任何其他模組
 * - 極輕量 (< 5KB)
 * - 原生 API only
 *
 * @module performance/preloader
 */

/* global chrome */

'use strict';

(function () {
  // 防止重複初始化
  if (window.__NOTION_PRELOADER_INITIALIZED__) {
    return;
  }
  window.__NOTION_PRELOADER_INITIALIZED__ = true;

  /**
   * 輕量預熱：快取關鍵節點
   * 供主 Bundle 接管時使用
   */
  const preloaderCache = {
    article: document.querySelector('article'),
    mainContent: document.querySelector('main, [role="main"], #content, .content'),
    timestamp: Date.now(),
  };

  // 暴露快取供主 Bundle 接管
  window.__NOTION_PRELOADER_CACHE__ = preloaderCache;

  /**
   * 事件緩衝區
   * 若用戶在主 Bundle 注入前觸發動作，先緩衝
   */
  const eventBuffer = [];

  /**
   * 監聽快捷鍵 Ctrl+S / Cmd+S
   */
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();

      // 發送訊息給 Background
      chrome.runtime.sendMessage({ action: 'USER_ACTIVATE_SHORTCUT' }, _response => {
        if (chrome.runtime.lastError) {
          // 忽略連接錯誤（如 Background 尚未準備好）
          return;
        }

        // 若 Bundle 尚未注入，緩衝事件
        if (!window.__NOTION_BUNDLE_READY__) {
          eventBuffer.push({ type: 'shortcut', timestamp: Date.now() });
        }
      });
    }
  });

  /**
   * 監聽 Background 訊息
   */
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    // PING 檢測：用於 InjectionService.ensureBundleInjected
    if (request.action === 'PING') {
      sendResponse({
        status: window.__NOTION_BUNDLE_READY__ ? 'bundle_ready' : 'preloader_only',
        hasCache: Boolean(preloaderCache.article) || Boolean(preloaderCache.mainContent),
      });
      return true;
    }

    // 準備接收主 Bundle
    if (request.action === 'INIT_BUNDLE') {
      sendResponse({ ready: true, bufferedEvents: eventBuffer.length });
      return true;
    }

    // 重放緩衝事件（由主 Bundle 調用）
    if (request.action === 'REPLAY_BUFFERED_EVENTS') {
      const events = [...eventBuffer];
      eventBuffer.length = 0;
      sendResponse({ events });
      return true;
    }

    // 未處理的消息不需要異步響應
    return false;
  });

  // 除錯日誌（生產環境會被移除）

  console.log('🔌 [Notion Preloader] Loaded, cache:', {
    hasArticle: Boolean(preloaderCache.article),
    hasMainContent: Boolean(preloaderCache.mainContent),
  });
})();
