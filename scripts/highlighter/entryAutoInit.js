/**
 * entryAutoInit.js
 *
 * Highlighter V2 的 runtime entry point（side-effect 模組）。
 *
 * 職責：
 * - 等待穩定 URL（waitForStableUrl）
 * - 並行初始化：頁面狀態、樣式配置
 * - 呼叫 setupHighlighter() 完成初始化
 * - 監聽 Chrome runtime 訊息（SET_STABLE_URL / showToolbar / GET_STABLE_URL）
 * - 監聽 chrome.storage.onChanged 以動態更新標註樣式
 *
 * ⚠️ 此模組包含 side effects，僅應由 scripts/content/index.js 引入。
 *    不得被 scripts/highlighter/index.js 反向 import（否則形成循環依賴）。
 */

import { setupHighlighter } from './index.js';
import { VALID_STYLES } from './utils/color.js';
import Logger from '../utils/Logger.js';

// 防止重複初始化（例如 HMR 或多次 import）
if (globalThis.window !== undefined && !globalThis.HighlighterV2) {
  let hasRetriedLateStableRestore = false;

  /**
   * 等待 Background Script 通過 SET_STABLE_URL 訊息發送穩定 URL。
   * 帶超時保護：若超時未收到，返回 null（頁面可能無穩定 URL）。
   *
   * @param {number} timeoutMs - 超時毫秒數
   * @returns {Promise<string|null>}
   */
  const waitForStableUrl = (timeoutMs = 1000) => {
    // 如果已經通過其他途徑設置了，直接返回
    if (globalThis.__NOTION_STABLE_URL__) {
      return Promise.resolve(globalThis.__NOTION_STABLE_URL__);
    }

    return new Promise(resolve => {
      let resolved = false;

      // 監聽 SET_STABLE_URL 訊息
      const handler = request => {
        if (request.action === 'SET_STABLE_URL' && request.stableUrl && !resolved) {
          resolved = true;
          globalThis.chrome?.runtime?.onMessage?.removeListener(handler);
          resolve(request.stableUrl);
        }
      };

      if (globalThis.chrome?.runtime?.onMessage) {
        globalThis.chrome.runtime.onMessage.addListener(handler);
      }

      // 超時保護：避免無限等待
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          globalThis.chrome?.runtime?.onMessage?.removeListener(handler);
          Logger.debug('[Highlighter] SET_STABLE_URL timeout, proceeding without stable URL', {
            action: 'waitForStableUrl',
          });
          resolve(null);
        }
      }, timeoutMs);
    });
  };

  // 🔑 異步初始化：先等待穩定 URL，再決定是否恢復標註和創建 Toolbar
  const initializeExtension = async () => {
    try {
      let skipRestore = false;
      let skipToolbar = true; // 默認不創建 Toolbar（頁面未保存或已刪除）
      let styleMode = 'background';

      // 並行加載：穩定 URL、頁面狀態、樣式配置
      const [stableUrl, pageStatus, settings] = await Promise.all([
        // 1. 等待 Background Script 發送穩定 URL
        waitForStableUrl(),
        // 2. 檢查頁面狀態（注意：Content Script 調用可能被 validateInternalRequest 拒絕）
        (async () => {
          if (!globalThis.chrome?.runtime?.sendMessage) {
            return null;
          }
          try {
            return await globalThis.chrome.runtime.sendMessage({ action: 'checkPageStatus' });
          } catch (error) {
            Logger.warn('[Highlighter] checkPageStatus failed', {
              error: error?.message,
              action: 'checkPageStatus',
            });
            return null;
          }
        })(),
        // 3. 加載標註樣式配置
        (async () => {
          if (!globalThis.chrome?.storage?.sync) {
            return {};
          }
          try {
            return (await globalThis.chrome.storage.sync.get(['highlightStyle'])) || {};
          } catch (error) {
            Logger.warn('[Highlighter] Failed to load settings', {
              error: error?.message,
              action: 'initializeExtension',
            });
            return {};
          }
        })(),
      ]);

      // 設置穩定 URL（優先使用 waitForStableUrl 的結果，回退到 pageStatus）
      const resolvedStableUrl = stableUrl || pageStatus?.stableUrl;
      if (resolvedStableUrl) {
        globalThis.__NOTION_STABLE_URL__ = resolvedStableUrl;
        Logger.debug('[Highlighter] Initialized with stable URL', {
          action: 'initializeExtension',
          stableUrl: resolvedStableUrl,
          source: stableUrl ? 'SET_STABLE_URL' : 'checkPageStatus',
        });
      }

      // 處理樣式配置，驗證值是否在允許的集合中
      if (settings?.highlightStyle && VALID_STYLES.includes(settings.highlightStyle)) {
        styleMode = settings.highlightStyle;
      } else if (settings?.highlightStyle) {
        Logger.warn('[Highlighter] Invalid highlightStyle value', {
          value: settings.highlightStyle,
          action: 'initializeExtension',
        });
      }

      // 處理頁面狀態（pageStatus 可能在 Content Script 中被拒絕，此時為 null 或 error）
      if (pageStatus?.wasDeleted) {
        skipRestore = true;
        Logger.info('[Highlighter] 🗑️ Page was deleted, skipping toolbar and restore', {
          action: 'initializeExtension',
        });
      } else if (pageStatus?.isSaved) {
        skipToolbar = false;
      }

      // 初始化 Highlighter
      setupHighlighter({ skipRestore, skipToolbar, styleMode });
    } catch (error) {
      Logger.error('初始化失敗', { action: 'initializeHighlighter', error });
      try {
        setupHighlighter({ skipRestore: true, skipToolbar: true });
      } catch (fallbackError) {
        Logger.error('回退初始化失敗', { action: 'fallbackInitialize', error: fallbackError });
      }
    }
  };

  // eslint-disable-next-line unicorn/prefer-top-level-await
  (async () => {
    await initializeExtension();
  })();

  // 🔑 監聽來自 Popup 的訊息（如保存完成後顯示 Toolbar）
  if (globalThis.chrome?.runtime?.onMessage) {
    globalThis.chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (request.action === 'SET_STABLE_URL' && request.stableUrl) {
        globalThis.__NOTION_STABLE_URL__ = request.stableUrl;

        const manager = globalThis.HighlighterV2?.manager;
        const restoreManager = globalThis.HighlighterV2?.restoreManager;
        const hasNoHighlights = typeof manager?.getCount === 'function' && manager.getCount() === 0;

        if (
          !hasRetriedLateStableRestore &&
          hasNoHighlights &&
          typeof restoreManager?.restore === 'function'
        ) {
          hasRetriedLateStableRestore = true;
          Promise.resolve(restoreManager.restore()).catch(error => {
            Logger.warn('[Highlighter] Late stable URL restore retry failed', {
              action: 'SET_STABLE_URL',
              error: error?.message ?? String(error),
            });
          });
        }

        return undefined;
      }

      if (request.action === 'showToolbar') {
        // 保存完成後，創建並顯示 Toolbar
        if (globalThis.notionHighlighter?.createAndShowToolbar) {
          try {
            globalThis.notionHighlighter.createAndShowToolbar();
            sendResponse({ success: true });
          } catch (error) {
            Logger.error('顯示工具欄失敗', { action: 'showToolbar', error });
            sendResponse({ success: false, error: error.message });
          }
        } else {
          sendResponse({ success: false, error: 'notionHighlighter not initialized' });
        }
        return true;
      }

      if (request.action === 'GET_STABLE_URL') {
        sendResponse({ stableUrl: globalThis.__NOTION_STABLE_URL__ });
        return true;
      }

      return undefined;
    });
  }

  // 🔑 監聽設定變更以動態更新標註樣式
  if (globalThis.chrome?.storage?.onChanged) {
    globalThis.chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.highlightStyle) {
        const newStyle = changes.highlightStyle.newValue;
        if (newStyle && VALID_STYLES.includes(newStyle) && globalThis.HighlighterV2?.manager) {
          globalThis.HighlighterV2.manager.updateStyleMode(newStyle);
        }
      }
    });
  }
}
