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
import { RUNTIME_ERROR_MESSAGES } from '../config/messages/runtimeErrorMessages.js';
import { revealFloatingRail, withAvailableFloatingRail } from './utils/floatingRailAvailability.js';
import Logger from '../utils/Logger.js';
import { sanitizeUrlForLogging } from '../utils/LogSanitizer.js';
import {
  fetchHighlighterSettings,
  fetchPageStatus,
  resolveStyleMode,
} from './autoInit/initializationInputs.js';
import { createLateStableUrlRestoreController } from './autoInit/lateStableUrlRestore.js';
import { createRailInitializationController } from './autoInit/railInitialization.js';
import { createPersistentListeners } from './autoInit/persistentListeners.js';
import {
  applyResolvedStableUrl,
  resolveStableUrlForInit,
  waitForStableUrl,
} from './autoInit/stableUrlResolution.js';

// 防止重複初始化（例如 HMR 或多次 import）
if (globalThis.window !== undefined && !globalThis.HighlighterV2) {
  const STABLE_URL_TIMEOUT_MS = 1000;

  const railInitialization = createRailInitializationController();
  const { initializeFloatingRail, settleRailReady } = railInitialization;
  const lateStableUrlRestore = createLateStableUrlRestoreController();

  function fallbackInitialize() {
    try {
      lateStableUrlRestore.markSkipLateRestore(true);
      setupHighlighter({ skipRestore: true, skipToolbar: true });
      if (globalThis.HighlighterV2) {
        globalThis.HighlighterV2.skipRestore = true;
      }
      persistentListeners.register();
      settleRailReady({ success: false, error: RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED });
    } catch (fallbackError) {
      persistentListeners.unregister();
      Logger.error('回退初始化失敗', { action: 'setupHighlighter', error: fallbackError });
      settleRailReady({ success: false, error: RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED });
    }
  }

  async function handleShowToolbarMessage(sendResponse) {
    await withAvailableFloatingRail(sendResponse, revealFloatingRail);
  }

  const persistentListeners = createPersistentListeners({
    onSetStableUrl: lateStableUrlRestore.handleSetStableUrl,
    onShowToolbar: handleShowToolbarMessage,
    getStableUrl: () => globalThis.__NOTION_STABLE_URL__,
  });

  function initializeHighlighterAndRail(skipRestore, styleMode, autoShowRail) {
    if (skipRestore) {
      Logger.info('[Highlighter] 頁面已刪除，略過工具列與標註恢復', {
        action: 'initializeExtension',
      });
    }

    // 初始化 Highlighter（Phase 1: 始終 skipToolbar）
    lateStableUrlRestore.markSkipLateRestore(skipRestore);
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
        });
        return null;
      });

      const [pageStatus, settings] = await Promise.all([
        fetchPageStatus(),
        fetchHighlighterSettings(),
      ]);

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

      const initRailPromise = initializeHighlighterAndRail(skipRestore, styleMode, autoShowRail);
      if (initRailPromise) {
        await initRailPromise;
      }

      persistentListeners.register();
    } catch (error) {
      persistentListeners.unregister();
      Logger.error('初始化失敗', { action: 'initializeExtension', error });
      fallbackInitialize();
    }
  })();
  /* eslint-enable unicorn/prefer-top-level-await */
}
