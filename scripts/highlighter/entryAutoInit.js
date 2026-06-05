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
import { PAGE_SAVE_ACTIONS } from '../config/runtimeActions/pageSaveActions.js';
import { RUNTIME_ERROR_MESSAGES } from '../config/runtimeActions/errorMessages.js';
import { VALID_STYLES } from './utils/color.js';
import { revealFloatingRail, withAvailableFloatingRail } from './utils/floatingRailAvailability.js';
import Logger from '../utils/Logger.js';
import { sanitizeUrlForLogging } from '../utils/LogSanitizer.js';
import { createRailInitializationController } from './autoInit/railInitialization.js';
import { createPersistentListeners } from './autoInit/persistentListeners.js';
import {
  applyResolvedStableUrl,
  resolveStableUrlForInit,
  waitForStableUrl,
} from './autoInit/stableUrlResolution.js';

// 防止重複初始化（例如 HMR 或多次 import）
if (globalThis.window !== undefined && !globalThis.HighlighterV2) {
  let hasRetriedLateStableRestore = false;
  let shouldSkipLateRestore = false;
  const STABLE_URL_TIMEOUT_MS = 1000;

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

  const railInitialization = createRailInitializationController();
  const { failRailReady, initializeFloatingRail, settleRailReady } = railInitialization;

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

  const persistentListeners = createPersistentListeners({
    onSetStableUrl: handleLateStableUrlRestore,
    onShowToolbar: handleShowToolbarMessage,
    getStableUrl: () => globalThis.__NOTION_STABLE_URL__,
  });

  function registerPersistentListeners() {
    persistentListeners.register();
  }

  function unregisterPersistentListeners() {
    persistentListeners.unregister();
  }

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
      const runtimeStableUrlPromise = waitForStableUrl({
        globalScope: globalThis,
        timeoutMs: STABLE_URL_TIMEOUT_MS,
        contentBridgeActions: CONTENT_BRIDGE_ACTIONS,
        logger: Logger,
      }).catch(error => {
        Logger.warn('[Highlighter] waitForStableUrl 發生未預期錯誤', {
          action: 'waitForStableUrl',
          error,
          errorMessage: error?.message ?? String(error),
        });
        return null;
      });

      const [pageStatus, settings] = await Promise.all([fetchPageStatus(), fetchSettings()]);

      const { resolvedStableUrl, stableUrlSource } = await resolveStableUrlForInit({
        globalScope: globalThis,
        pageStatus,
        runtimeStableUrlPromise,
      });
      applyResolvedStableUrl({
        globalScope: globalThis,
        resolvedStableUrl,
        stableUrlSource,
        logger: Logger,
        sanitizeUrlForLogging,
      });

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
