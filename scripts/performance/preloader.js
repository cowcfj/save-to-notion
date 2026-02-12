/**
 * Preloader - 極輕量預載器
 *
 * 職責：
 * 1. 監聯快捷鍵 (Ctrl+S / Cmd+S)
 * 2. 接收 Background 訊息
 * 3. 輕量預熱（快取 article 節點）
 * 4. 與主 Bundle 橋接
 * 5. 提取穩定 URL 所需的頁面元數據（Phase 2）
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
  if (globalThis.__NOTION_PRELOADER_INITIALIZED__) {
    return;
  }
  globalThis.__NOTION_PRELOADER_INITIALIZED__ = true;

  /**
   * 輕量預熱：快取關鍵節點
   * 供主 Bundle 接管時使用
   */
  const preloaderCache = {
    article: document.querySelector('article'),
    mainContent: document.querySelector('main, [role="main"], #content, .content'),
    // Phase 2a: Next.js Pages Router 路由資訊
    nextRouteInfo: (() => {
      try {
        const el = document.querySelector('#__NEXT_DATA__');
        if (!el) {
          return null;
        }
        const text = el.textContent;
        // 安全上限：避免解析過大的 JSON 阻塞頁面
        if (!text || text.length > 1_048_576) {
          return null;
        }
        const data = JSON.parse(text);
        // Only return if critical fields exist
        if (!data || typeof data !== 'object' || !data.page || !data.query) {
          return null;
        }
        return { page: data.page, query: data.query, buildId: data.buildId };
      } catch {
        return null;
      }
    })(),
    // Phase 2a+: WordPress shortlink（穩定數字 ID URL）
    shortlink: document.querySelector('link[rel="shortlink"]')?.href || null,
    timestamp: Date.now(),
  };

  // 監聽請求事件並回應快取 (Decoupling Phase 8)
  document.addEventListener('notion-preloader-request', () => {
    document.dispatchEvent(
      new CustomEvent('notion-preloader-response', {
        detail: preloaderCache,
        bubbles: false,
        cancelable: false,
      })
    );
  });

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
          // 記錄連接錯誤以便診斷（如 Background 未準備好、權限問題等）
          console.warn(
            '[Notion Preloader] Failed to send shortcut message:',
            chrome.runtime.lastError.message
          );
          return;
        }

        // 若 Bundle 尚未注入，緩衝事件
        if (!globalThis.__NOTION_BUNDLE_READY__) {
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
      // 若 Bundle 已就緒，讓 Bundle 的監聽器處理（避免競爭條件）
      if (globalThis.__NOTION_BUNDLE_READY__) {
        return false; // 不處理，讓 Bundle 監聽器響應
      }

      // Bundle 尚未載入，Preloader 響應
      sendResponse({
        status: 'preloader_only',
        hasCache: Boolean(preloaderCache.article) || Boolean(preloaderCache.mainContent),
        nextRouteInfo: preloaderCache.nextRouteInfo,
        shortlink: preloaderCache.shortlink,
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

    // 未處理的訊息不需要異步響應
    return false;
  });

  // 調試模式：在 DevTools Console 執行 localStorage.setItem('NOTION_DEBUG', '1') 啟用
  // 啟用後重新載入頁面即可看到調試訊息
  try {
    if (localStorage.getItem('NOTION_DEBUG')) {
      console.info('Notion Preloader initialized:', preloaderCache, {
        hasArticle: Boolean(preloaderCache.article),
        hasMainContent: Boolean(preloaderCache.mainContent),
        hasNextRouteInfo: Boolean(preloaderCache.nextRouteInfo),
        hasShortlink: Boolean(preloaderCache.shortlink),
      });
    }
  } catch {
    // 忽略 localStorage 訪問錯誤（如隱私模式或禁用 Cookie）
    // 避免因調試功能導致整個腳本崩潰
  }
})();
