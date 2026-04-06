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
import { RUNTIME_ACTIONS } from '../config/runtimeActions.js';
import { VALID_STYLES } from './utils/color.js';
import Logger from '../utils/Logger.js';
import { sanitizeUrlForLogging } from '../utils/securityUtils.js';

// 防止重複初始化（例如 HMR 或多次 import）
if (globalThis.window !== undefined && !globalThis.HighlighterV2) {
  let hasRetriedLateStableRestore = false;
  let shouldSkipLateRestore = false;
  const STABLE_URL_TIMEOUT_MS = 1000;
  let persistentMessageHandler = null;
  let persistentStorageHandler = null;

  const registerPersistentListeners = () => {
    if (!persistentMessageHandler && globalThis.chrome?.runtime?.onMessage?.addListener) {
      persistentMessageHandler = (request, _sender, sendResponse) => {
        if (request.action === RUNTIME_ACTIONS.SET_STABLE_URL && request.stableUrl) {
          globalThis.__NOTION_STABLE_URL__ = request.stableUrl;

          const manager = globalThis.HighlighterV2?.manager;
          const restoreManager = globalThis.HighlighterV2?.restoreManager;
          const hasSkipRestoreFlag =
            shouldSkipLateRestore ||
            globalThis.HighlighterV2?.skipRestore === true ||
            globalThis.HighlighterV2?.wasDeleted === true;
          const hasNoHighlights =
            typeof manager?.getCount === 'function' && manager.getCount() === 0;

          if (
            !hasRetriedLateStableRestore &&
            !hasSkipRestoreFlag &&
            hasNoHighlights &&
            typeof restoreManager?.restore === 'function'
          ) {
            hasRetriedLateStableRestore = true;
            restoreManager.restore().catch(error => {
              Logger.warn('[Highlighter] 延後收到穩定 URL，重試恢復標註失敗', {
                action: 'SET_STABLE_URL',
                error: error?.message ?? String(error),
              });
            });
          }

          return undefined;
        }

        if (request.action === RUNTIME_ACTIONS.SHOW_TOOLBAR) {
          if (globalThis.notionHighlighter?.createAndShowToolbar) {
            try {
              globalThis.notionHighlighter.createAndShowToolbar();
              sendResponse({ success: true });
            } catch (error) {
              Logger.error('顯示工具欄失敗', { action: 'showToolbar', error });
              sendResponse({ success: false, error: error.message });
            }
          } else {
            sendResponse({ success: false, error: 'notionHighlighter 尚未初始化' });
          }
          return true;
        }

        if (request.action === RUNTIME_ACTIONS.GET_STABLE_URL) {
          sendResponse({ stableUrl: globalThis.__NOTION_STABLE_URL__ });
          return true;
        }

        return undefined;
      };

      globalThis.chrome.runtime.onMessage.addListener(persistentMessageHandler);
    }

    if (!persistentStorageHandler && globalThis.chrome?.storage?.onChanged?.addListener) {
      persistentStorageHandler = (changes, namespace) => {
        if (namespace === 'sync' && changes.highlightStyle) {
          const newStyle = changes.highlightStyle.newValue;
          if (newStyle && VALID_STYLES.includes(newStyle) && globalThis.HighlighterV2?.manager) {
            globalThis.HighlighterV2.manager.updateStyleMode(newStyle);
          }
        }
      };

      globalThis.chrome.storage.onChanged.addListener(persistentStorageHandler);
    }
  };

  const unregisterPersistentListeners = () => {
    if (persistentMessageHandler && globalThis.chrome?.runtime?.onMessage?.removeListener) {
      globalThis.chrome.runtime.onMessage.removeListener(persistentMessageHandler);
      persistentMessageHandler = null;
    }

    if (persistentStorageHandler && globalThis.chrome?.storage?.onChanged?.removeListener) {
      globalThis.chrome.storage.onChanged.removeListener(persistentStorageHandler);
      persistentStorageHandler = null;
    }
  };

  /**
   * 等待 Background Script 通過 SET_STABLE_URL 訊息發送穩定 URL。
   * 帶超時保護：若超時未收到，返回 null（頁面可能無穩定 URL）。
   *
   * @param {number} timeoutMs - 超時毫秒數
   * @returns {Promise<string|null>}
   */
  const waitForStableUrl = (timeoutMs = STABLE_URL_TIMEOUT_MS) => {
    // 如果已經通過其他途徑設置了，直接返回
    if (globalThis.__NOTION_STABLE_URL__) {
      return Promise.resolve(globalThis.__NOTION_STABLE_URL__);
    }

    return new Promise(resolve => {
      let resolved = false;

      // 監聽 SET_STABLE_URL 訊息
      const handler = request => {
        if (request.action === RUNTIME_ACTIONS.SET_STABLE_URL && request.stableUrl && !resolved) {
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
          Logger.debug('[Highlighter] 等待 SET_STABLE_URL 超時，將在沒有穩定 URL 的情況下繼續', {
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

      const stableUrlState = {
        resolved: false,
        value: null,
      };
      waitForStableUrl()
        .then(stableUrl => {
          stableUrlState.resolved = true;
          stableUrlState.value = stableUrl;
          return stableUrl;
        })
        .catch(error => {
          Logger.warn('[Highlighter] waitForStableUrl 發生未預期錯誤', {
            action: 'waitForStableUrl',
            error: error?.message ?? String(error),
          });
        });

      // 並行加載：頁面狀態、樣式配置；穩定 URL 另外等待，不阻塞初始化
      const [pageStatus, settings] = await Promise.all([
        // 1. 檢查頁面狀態（注意：Content Script 調用可能被 validateInternalRequest 拒絕）
        (async () => {
          if (!globalThis.chrome?.runtime?.sendMessage) {
            return null;
          }
          try {
            return await globalThis.chrome.runtime.sendMessage({
              action: RUNTIME_ACTIONS.CHECK_PAGE_STATUS,
            });
          } catch (error) {
            Logger.warn('[Highlighter] checkPageStatus 失敗', {
              error: error?.message,
              action: 'checkPageStatus',
            });
            return null;
          }
        })(),
        // 2. 加載標註樣式配置
        (async () => {
          if (!globalThis.chrome?.storage?.sync) {
            return {};
          }
          try {
            return (await globalThis.chrome.storage.sync.get(['highlightStyle'])) || {};
          } catch (error) {
            Logger.warn('[Highlighter] 載入設定失敗', {
              error: error?.message,
              action: 'initializeExtension',
            });
            return {};
          }
        })(),
      ]);

      // 設置穩定 URL（優先使用 pageStatus，若 waitForStableUrl 已快速完成則回退使用）
      const resolvedStableUrl = pageStatus?.stableUrl || stableUrlState.value;
      if (resolvedStableUrl) {
        globalThis.__NOTION_STABLE_URL__ = resolvedStableUrl;
        Logger.debug('[Highlighter] 已使用穩定 URL 完成初始化', {
          action: 'initializeExtension',
          stableUrl: sanitizeUrlForLogging(resolvedStableUrl),
          source:
            pageStatus?.stableUrl || !stableUrlState.resolved || !stableUrlState.value
              ? 'checkPageStatus'
              : 'SET_STABLE_URL',
        });
      }

      // 處理樣式配置，驗證值是否在允許的集合中
      if (settings?.highlightStyle && VALID_STYLES.includes(settings.highlightStyle)) {
        styleMode = settings.highlightStyle;
      } else if (settings?.highlightStyle) {
        Logger.warn('[Highlighter] highlightStyle 設定值無效', {
          value: settings.highlightStyle,
          action: 'initializeExtension',
        });
      }

      // 處理頁面狀態（pageStatus 可能在 Content Script 中被拒絕，此時為 null 或 error）
      if (pageStatus?.wasDeleted) {
        skipRestore = true;
        Logger.info('[Highlighter] 頁面已刪除，略過工具列與標註恢復', {
          action: 'initializeExtension',
        });
      } else if (pageStatus?.isSaved) {
        skipToolbar = false;
      }

      // 初始化 Highlighter
      shouldSkipLateRestore = skipRestore;
      setupHighlighter({ skipRestore, skipToolbar, styleMode });
      if (globalThis.HighlighterV2) {
        globalThis.HighlighterV2.skipRestore = skipRestore;
        globalThis.HighlighterV2.wasDeleted = pageStatus?.wasDeleted === true;
      }
      registerPersistentListeners();
    } catch (error) {
      unregisterPersistentListeners();
      Logger.error('初始化失敗', { action: 'initializeExtension', error });
      try {
        shouldSkipLateRestore = true;
        setupHighlighter({ skipRestore: true, skipToolbar: true });
        if (globalThis.HighlighterV2) {
          globalThis.HighlighterV2.skipRestore = true;
        }
        registerPersistentListeners();
      } catch (fallbackError) {
        unregisterPersistentListeners();
        Logger.error('回退初始化失敗', { action: 'setupHighlighter', error: fallbackError });
      }
    }
  };

  // eslint-disable-next-line unicorn/prefer-top-level-await
  (async () => {
    await initializeExtension();
  })();
}
