/**
 * Preloader - 極輕量預載器
 *
 * 職責：
 * 1. 監聽快捷鍵 (Ctrl+S / Cmd+S)
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

'use strict';

import { PRELOADER_ACTIONS } from '../config/runtimeActions/preloaderActions.js';

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

        // Schema Validation: Ensure critical fields exist and have correct types
        if (!data || typeof data !== 'object') {
          return null;
        }

        // Validate 'page' is a string
        if (typeof data.page !== 'string') {
          return null;
        }

        // Validate 'query' is an object (and not null)
        if (!data.query || typeof data.query !== 'object') {
          return null;
        }

        return { page: data.page, query: data.query, buildId: data.buildId };
      } catch {
        return null;
      }
    })(),
    // Phase 2a+: WordPress shortlink（穩定數字 ID URL）
    // 合法的 WordPress shortlink 一定有 query 參數（?p=12345），
    // 沒有 query 參數的（如首頁 URL）不是有效 shortlink。
    shortlink: (() => {
      const href = document.querySelector('link[rel="shortlink"]')?.href;
      if (!href) {
        return null;
      }
      try {
        const urlObj = new URL(href);
        // 有效 shortlink 必須包含 query 參數（如 ?p=12345）
        return urlObj.search.length > 0 ? href : null;
      } catch {
        return null;
      }
    })(),
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
  const runtime = globalThis.chrome?.runtime;
  const canSendRuntimeMessage = typeof runtime?.sendMessage === 'function';
  const canListenRuntimeMessage = typeof runtime?.onMessage?.addListener === 'function';

  /**
   * 監聽快捷鍵 Ctrl+S / Cmd+S
   */
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 's' && canSendRuntimeMessage) {
      event.preventDefault();

      // 發送訊息給 Background
      runtime.sendMessage({ action: PRELOADER_ACTIONS.USER_ACTIVATE_SHORTCUT }, _response => {
        if (runtime.lastError) {
          // 記錄連接錯誤以便診斷（如 Background 未準備好、權限問題等）
          console.error(
            '[Notion Preloader] Failed to send shortcut message:',
            runtime.lastError.message
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
  if (canListenRuntimeMessage) {
    runtime.onMessage.addListener((request, _sender, sendResponse) => {
      // PING 檢測：用於 InjectionService.ensureBundleInjected
      if (request.action === PRELOADER_ACTIONS.PING) {
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
      if (request.action === PRELOADER_ACTIONS.INIT_BUNDLE) {
        sendResponse({ ready: true, bufferedEvents: eventBuffer.length });
        return true;
      }

      // 重放緩衝事件（由主 Bundle 調用）
      if (request.action === PRELOADER_ACTIONS.REPLAY_BUFFERED_EVENTS) {
        const events = [...eventBuffer];
        eventBuffer.length = 0;
        sendResponse({ events });
        return true;
      }

      // 未處理的訊息不需要異步響應
      return false;
    });
  }
})();
