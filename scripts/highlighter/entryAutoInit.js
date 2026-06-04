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
import { CONTENT_BRIDGE_ACTIONS } from '../config/runtimeActions/contentBridgeActions.js';
import { HIGHLIGHTER_ACTIONS } from '../config/runtimeActions/highlighterActions.js';
import { PAGE_SAVE_ACTIONS } from '../config/runtimeActions/pageSaveActions.js';
import { RUNTIME_ERROR_MESSAGES } from '../config/runtimeActions/errorMessages.js';
import { VALID_STYLES } from './utils/color.js';
import { revealFloatingRail, withAvailableFloatingRail } from './utils/floatingRailAvailability.js';
import Logger from '../utils/Logger.js';
import { sanitizeUrlForLogging } from '../utils/LogSanitizer.js';

// 防止重複初始化（例如 HMR 或多次 import）
if (globalThis.window !== undefined && !globalThis.HighlighterV2) {
  let hasRetriedLateStableRestore = false;
  let shouldSkipLateRestore = false;
  const STABLE_URL_TIMEOUT_MS = 1000;
  let persistentMessageHandler = null;
  let persistentStorageHandler = null;

  function resolveStyleMode(settings) {
    if (settings?.highlightStyle && VALID_STYLES.includes(settings.highlightStyle)) {
      return settings.highlightStyle;
    }
    if (settings?.highlightStyle) {
      Logger.warn('[Highlighter] highlightStyle 設定值無效', {
        value: settings.highlightStyle,
        action: 'initializeExtension',
      });
    }
    return 'background';
  }

  let railReadyResolve;
  let isRailReadySettled = false;
  const railReadyPromise = new Promise(resolve => {
    railReadyResolve = resolve;
  });
  globalThis.__NOTION_RAIL_READY__ = railReadyPromise;

  function settleRailReady(result) {
    if (isRailReadySettled) {
      return;
    }
    isRailReadySettled = true;
    if (!result?.success) {
      globalThis.__NOTION_RAIL_READY__ = undefined;
    }
    railReadyResolve(result);
  }

  function failRailReady(error, fallbackMessage) {
    settleRailReady({
      success: false,
      error: fallbackMessage || error?.message,
    });
  }

  async function initializeFloatingRail(manager, autoShowRail) {
    try {
      const { FloatingRail } = await import('./ui/FloatingRail.js');
      const rail = new FloatingRail(manager);
      await rail.initialize();
      globalThis.HighlighterV2.rail = rail;
      if (!autoShowRail) {
        rail.hide();
      }
      settleRailReady({ success: true, rail });
    } catch (railError) {
      Logger.warn('[Highlighter] Floating Rail 初始化失敗', {
        action: 'initializeExtension',
        error: railError?.message,
      });
      failRailReady(railError, RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED);
    }
  }

  function fallbackInitialize(cause) {
    try {
      shouldSkipLateRestore = true;
      setupHighlighter({ skipRestore: true, skipToolbar: true });
      if (globalThis.HighlighterV2) {
        globalThis.HighlighterV2.skipRestore = true;
      }
      registerPersistentListeners();
      failRailReady(cause, RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED);
    } catch (fallbackError) {
      unregisterPersistentListeners();
      Logger.error('回退初始化失敗', { action: 'setupHighlighter', error: fallbackError });
      failRailReady(fallbackError, RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED);
    }
  }

  async function handleShowToolbarMessage(sendResponse) {
    await withAvailableFloatingRail(sendResponse, revealFloatingRail);
  }

  function hasHighlighterSkipRestoreFlag() {
    if (shouldSkipLateRestore) {
      return true;
    }
    if (globalThis.HighlighterV2?.skipRestore === true) {
      return true;
    }
    return globalThis.HighlighterV2?.wasDeleted === true;
  }

  function canRetryLateStableUrlRestore(manager, restoreManager) {
    if (hasRetriedLateStableRestore) {
      return false;
    }
    if (hasHighlighterSkipRestoreFlag()) {
      return false;
    }
    if (typeof manager?.getCount !== 'function') {
      return false;
    }
    if (manager.getCount() !== 0) {
      return false;
    }
    return typeof restoreManager?.restore === 'function';
  }

  function handleLateStableUrlRestore(request, sendResponse) {
    globalThis.__NOTION_STABLE_URL__ = request.stableUrl;

    const manager = globalThis.HighlighterV2?.manager;
    const restoreManager = globalThis.HighlighterV2?.restoreManager;

    if (!canRetryLateStableUrlRestore(manager, restoreManager)) {
      sendResponse({ success: true });
      return true;
    }

    hasRetriedLateStableRestore = true;
    restoreManager
      .restore()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        Logger.warn('[Highlighter] 延後收到穩定 URL，重試恢復標註失敗', {
          action: 'SET_STABLE_URL',
          error,
          errorMessage: error?.message ?? String(error),
        });
        sendResponse({ success: false, error: String(error) });
      });

    return true; // 異步回應
  }

  function handleGetStableUrl(sendResponse) {
    sendResponse({ stableUrl: globalThis.__NOTION_STABLE_URL__ });
    return true;
  }

  function handleStorageStyleChange(changes, namespace) {
    if (namespace !== 'sync') {
      return;
    }

    const changedStyle = changes.highlightStyle;
    if (!changedStyle) {
      return;
    }

    const newStyle = changedStyle.newValue;
    if (!newStyle) {
      return;
    }

    if (!VALID_STYLES.includes(newStyle)) {
      return;
    }

    const manager = globalThis.HighlighterV2?.manager;
    if (!manager) {
      return;
    }

    manager.updateStyleMode(newStyle);
  }

  function handleSetStableUrlMessage(request, sendResponse) {
    if (!request.stableUrl) {
      return undefined;
    }
    return handleLateStableUrlRestore(request, sendResponse);
  }

  function handlePersistentShowToolbarMessage(_request, sendResponse) {
    handleShowToolbarMessage(sendResponse);
    return true;
  }

  const PERSISTENT_MESSAGE_HANDLERS = {
    [CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL]: handleSetStableUrlMessage,
    [HIGHLIGHTER_ACTIONS.SHOW_TOOLBAR]: handlePersistentShowToolbarMessage,
    [CONTENT_BRIDGE_ACTIONS.GET_STABLE_URL]: (_request, sendResponse) =>
      handleGetStableUrl(sendResponse),
  };

  function handlePersistentMessage(request, _sender, sendResponse) {
    const handler = PERSISTENT_MESSAGE_HANDLERS[request.action];
    if (!handler) {
      return undefined;
    }
    return handler(request, sendResponse);
  }

  const registerPersistentListeners = () => {
    if (!persistentMessageHandler && globalThis.chrome?.runtime?.onMessage?.addListener) {
      persistentMessageHandler = handlePersistentMessage;
      globalThis.chrome.runtime.onMessage.addListener(persistentMessageHandler);
    }

    if (!persistentStorageHandler && globalThis.chrome?.storage?.onChanged?.addListener) {
      persistentStorageHandler = (changes, namespace) => {
        handleStorageStyleChange(changes, namespace);
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

      const settle = value => {
        if (resolved) {
          return;
        }
        resolved = true;
        globalThis.chrome?.runtime?.onMessage?.removeListener(handler);
        resolve(value);
      };

      // 監聽 SET_STABLE_URL 訊息
      const handler = request => {
        if (request.action === CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL && request.stableUrl) {
          settle(request.stableUrl);
        }
      };

      if (globalThis.chrome?.runtime?.onMessage) {
        globalThis.chrome.runtime.onMessage.addListener(handler);
      }

      // 超時保護：避免無限等待
      setTimeout(() => {
        if (!resolved) {
          Logger.debug('[Highlighter] 等待 SET_STABLE_URL 超時，將在沒有穩定 URL 的情況下繼續', {
            action: 'waitForStableUrl',
          });
          settle(null);
        }
      }, timeoutMs);
    });
  };

  async function fetchPageStatus() {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      return null;
    }
    try {
      return await globalThis.chrome.runtime.sendMessage({
        action: PAGE_SAVE_ACTIONS.CHECK_PAGE_STATUS,
      });
    } catch (error) {
      Logger.warn('[Highlighter] checkPageStatus 失敗', {
        error: error?.message,
        action: 'checkPageStatus',
      });
      return null;
    }
  }

  async function fetchSettings() {
    if (!globalThis.chrome?.storage?.sync) {
      return {};
    }
    try {
      return (
        (await globalThis.chrome.storage.sync.get(['highlightStyle', 'floatingRailEnabled'])) || {}
      );
    } catch (error) {
      Logger.warn('[Highlighter] 載入設定失敗', {
        error: error?.message,
        action: 'initializeExtension',
      });
      return {};
    }
  }

  function resolveStableUrlForInit(pageStatus, runtimeStableUrlPromise) {
    const pendingRuntimeStableUrl = Symbol('pending_runtime_stable_url');
    return Promise.race([runtimeStableUrlPromise, Promise.resolve(pendingRuntimeStableUrl)]).then(
      runtimeStableUrlResult => {
        const runtimeStableUrl =
          runtimeStableUrlResult === pendingRuntimeStableUrl ? null : runtimeStableUrlResult;

        // 設置穩定 URL 優先權（Phase 3 regression fix）：
        // SET_STABLE_URL 是 Background 在 preloader 解析完成後主動推送的，
        // 代表最新且最權威的 canonical source。
        // checkPageStatus 的 stableUrl 可能來自較舊的快取，優先級較低。
        const resolvedStableUrl =
          globalThis.__NOTION_STABLE_URL__ || runtimeStableUrl || pageStatus?.stableUrl || null;
        const stableUrlSource =
          globalThis.__NOTION_STABLE_URL__ || runtimeStableUrl
            ? 'SET_STABLE_URL'
            : 'checkPageStatus';

        return { resolvedStableUrl, stableUrlSource };
      }
    );
  }

  function applyResolvedStableUrl(resolvedStableUrl, stableUrlSource) {
    if (resolvedStableUrl) {
      globalThis.__NOTION_STABLE_URL__ = resolvedStableUrl;
      Logger.debug('[Highlighter] 已使用穩定 URL 完成初始化', {
        action: 'initializeExtension',
        stableUrl: sanitizeUrlForLogging(resolvedStableUrl),
        source: stableUrlSource,
      });
    }
  }

  function initializeHighlighterAndRail({ skipRestore, styleMode, autoShowRail }) {
    if (skipRestore) {
      Logger.info('[Highlighter] 頁面已刪除，略過工具列與標註恢復', {
        action: 'initializeExtension',
      });
    }

    // 初始化 Highlighter（Phase 1: 始終 skipToolbar）
    shouldSkipLateRestore = skipRestore;
    setupHighlighter({ skipRestore, skipToolbar: true, styleMode });
    if (globalThis.HighlighterV2) {
      globalThis.HighlighterV2.skipRestore = skipRestore;
      globalThis.HighlighterV2.wasDeleted = skipRestore;
    }

    if (skipRestore) {
      settleRailReady({ success: false, error: '浮動側欄初始化已略過' });
      return null;
    }
    if (globalThis.HighlighterV2?.manager) {
      return initializeFloatingRail(globalThis.HighlighterV2.manager, autoShowRail);
    }
    settleRailReady({ success: false, error: '浮動側欄初始化缺少 manager' });
    return null;
  }

  // 🔑 異步初始化：runtime stable URL 與 pageStatus/settings 並行收集。
  // 若 pageStatus 已提供 stableUrl，不等待 waitForStableUrl timeout。
  /* eslint-disable unicorn/prefer-top-level-await -- content bundle outputs UMD; top-level await breaks Rollup */
  void (async () => {
    try {
      const runtimeStableUrlPromise = waitForStableUrl().catch(error => {
        Logger.warn('[Highlighter] waitForStableUrl 發生未預期錯誤', {
          action: 'waitForStableUrl',
          error,
          errorMessage: error?.message ?? String(error),
        });
        return null;
      });

      const [pageStatus, settings] = await Promise.all([fetchPageStatus(), fetchSettings()]);

      const { resolvedStableUrl, stableUrlSource } = await resolveStableUrlForInit(
        pageStatus,
        runtimeStableUrlPromise
      );
      applyResolvedStableUrl(resolvedStableUrl, stableUrlSource);

      const styleMode = resolveStyleMode(settings);
      const skipRestore = pageStatus?.wasDeleted === true;
      const autoShowRail = settings?.floatingRailEnabled !== false;

      const initRailPromise = initializeHighlighterAndRail({
        skipRestore,
        styleMode,
        autoShowRail,
      });
      if (initRailPromise) {
        await initRailPromise;
      }

      registerPersistentListeners();
    } catch (error) {
      unregisterPersistentListeners();
      Logger.error('初始化失敗', { action: 'initializeExtension', error });
      fallbackInitialize(error);
    }
  })();
  /* eslint-enable unicorn/prefer-top-level-await */
}
