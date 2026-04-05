/**
 * Highlighter V2 - ES6 Module Entry Point
 *
 * 整合所有模組並提供統一導出
 */

// Core modules
import { HighlightManager } from './core/HighlightManager.js';
import { StyleManager } from './core/StyleManager.js';
import { HighlightInteraction } from './core/HighlightInteraction.js';
import { HighlightMigration } from './core/HighlightMigration.js';
import { HighlightStorage } from './core/HighlightStorage.js';

import {
  serializeRange,
  deserializeRange,
  findRangeByTextContent,
  validateRange,
} from './core/Range.js';

// UI modules
import { Toolbar } from './ui/Toolbar.js';

// Utility modules
import { COLORS, VALID_STYLES } from './utils/color.js';
import { supportsHighlightAPI } from './utils/dom.js';
import { isValidColor, isValidRange, isValidHighlightData } from './utils/validation.js';
import { getNodePath, getNodeByPath } from './utils/path.js';
import { findTextInPage } from './utils/textSearch.js';
import { waitForDOMStability } from './utils/domStability.js';

// Storage utility - 導入以設置 window.StorageUtil（由 HighlightStorage 使用）
import './utils/StorageUtil.js';

// Logger - 統一日誌記錄
import Logger from '../utils/Logger.js';

// 導入並掛載 normalizeUrl（供 HighlightManager/Storage 使用）
import { normalizeUrl } from '../utils/urlUtils.js';
if (globalThis.window !== undefined && !globalThis.normalizeUrl) {
  globalThis.normalizeUrl = normalizeUrl;
}

/**
 * 創建並注入所有依賴模組到 HighlightManager
 *
 * @param {HighlightManager} manager - HighlightManager 實例
 * @param {object} options - 配置選項
 * @param {Toolbar} [toolbar=null] - 工具欄實例（可選）。
 *   僅由 HighlightStorage 使用，用於在恢復標註後自動隱藏工具欄。
 *   如果不需要此功能，可傳入 null 或省略此參數。
 * @returns {object} 包含所有創建的模組實例
 */
function createAndInjectDependencies(manager, options, toolbar = null) {
  const styleManager = new StyleManager(options);
  const interaction = new HighlightInteraction(manager);
  const migration = new HighlightMigration(manager);
  const storage = new HighlightStorage(manager, toolbar);

  manager.setDependencies({
    styleManager,
    interaction,
    migration,
    storage,
  });

  return { styleManager, interaction, migration, storage };
}

/**
 * 初始化 Highlighter V2 (僅 Manager)
 *
 * @param {object} [options={}] - 初始化選項
 * @returns {HighlightManager}
 */
export function initHighlighter(options = {}) {
  const manager = new HighlightManager(options);

  // 注入依賴
  const deps = createAndInjectDependencies(manager, options);

  // 驗證關鍵依賴是否成功創建
  if (!deps.styleManager || !deps.storage) {
    Logger.error('初始化標註器失敗，關鍵依賴創建失敗', { action: 'initHighlighter' });
    return manager; // 返回未初始化的 manager，避免後續錯誤
  }

  // 自動執行初始化
  manager.initializationComplete = manager.initialize();

  // 監聽來自 background 的訊息
  if (globalThis.chrome?.runtime?.onMessage) {
    globalThis.chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'toggleHighlighter') {
        if (globalThis.notionHighlighter) {
          globalThis.notionHighlighter.toggle();
          sendResponse({ success: true, isActive: globalThis.notionHighlighter.isActive() });
          return true; // 只在實際發送響應時返回 true
        }
        // notionHighlighter 未初始化
        sendResponse({ success: false, error: 'notionHighlighter not initialized' });
        return true;
      }
      // 不處理的訊息不返回 true
      return false;
    });
  }

  return manager;
}

/**
 * 初始化 Highlighter V2 (包含工具欄)
 *
 * @param {object} [options] - 初始化選項
 * @param {boolean} [options.skipRestore] - 是否跳過恢復標註
 * @param {boolean} [options.skipToolbar] - 是否跳過創建工具欄
 * @returns {{manager: HighlightManager, toolbar: Toolbar|null, storage: HighlightStorage}}
 *   返回值包含：
 *   - manager: HighlightManager 實例
 *   - toolbar: Toolbar 實例，如果 skipToolbar 為 true 則為 null
 *   - storage: HighlightStorage 實例（v2.19+ 新增，用於 setupHighlighter 訪問恢復功能）
 */
export function initHighlighterWithToolbar(options = {}) {
  const manager = new HighlightManager(options);

  // 如果 skipToolbar 為 true，不創建 Toolbar
  const toolbar = options.skipToolbar ? null : new Toolbar(manager);

  // 注入依賴 (注意：HighlightStorage 需要 toolbar)
  const { storage } = createAndInjectDependencies(manager, options, toolbar);

  // 自動執行初始化
  manager.initializationComplete = (async () => {
    // 初始化 Manager
    await manager.initialize(options.skipRestore);

    // 如果有 Toolbar，初始化並更新計數
    if (toolbar) {
      toolbar.initialize();
      toolbar.updateHighlightCount();
    }
  })();

  // 附加 storage 到返回值，方便 setupHighlighter 使用
  return { manager, toolbar, storage };
}

/**
 * 導出所有模組供外部使用
 */

/**
 * 默認導出：自動初始化並設置到 window
 *
 * @param {object} [options] - 初始化選項
 * @param {boolean} [options.skipRestore] - 是否跳過恢復標註
 * @param {boolean} [options.skipToolbar] - 是否跳過創建工具欄
 * @returns {object} 包含 manager, toolbar, restoreManager 的對象
 */
export function setupHighlighter(options = {}) {
  if (globalThis.window === undefined) {
    throw new TypeError('Highlighter V2 requires a browser environment');
  }

  // 初始化 manager 和 toolbar
  // 如果 skipRestore 為 true（頁面已刪除），同時跳過 Toolbar
  const effectiveOptions = {
    ...options,
    skipToolbar: options.skipToolbar ?? options.skipRestore,
  };

  // initHighlighterWithToolbar 現在返回注入的 storage
  const { manager, toolbar, storage } = initHighlighterWithToolbar(effectiveOptions);

  // 使用已經創建並注入的 HighlighStorage 作為 restoreManager
  const restoreManager = storage;

  // 設置新版 API 到 window for Chrome Extension compatibility
  globalThis.HighlighterV2 = {
    manager,
    toolbar,
    restoreManager,

    // Core functions
    serializeRange,
    deserializeRange,
    findRangeByTextContent,
    validateRange,

    // Utils
    COLORS,
    supportsHighlightAPI,
    isValidColor,
    isValidRange,
    isValidHighlightData,
    getNodePath,
    getNodeByPath,
    findTextInPage,
    waitForDOMStability,

    // Convenience methods
    init: opts => initHighlighter(opts),
    initWithToolbar: opts => initHighlighterWithToolbar(opts),
    getInstance: () => manager,
    getToolbar: () => toolbar,
    getRestoreManager: () => restoreManager,
  };

  // 🔑 向後兼容：設置舊版 API（處理 toolbar 為 null 的情況）
  // 使用閉包變量來追蹤動態創建的 toolbar
  let currentToolbar = toolbar;
  let isCreatingToolbar = false; // 防止重複創建的鎖

  /**
   * 動態創建 Toolbar（如果尚未創建）
   * 使用 isCreatingToolbar 標誌防止重複創建
   *
   * @returns {Toolbar}
   */
  const ensureToolbar = () => {
    // 如果已存在，直接返回
    if (currentToolbar) {
      return currentToolbar;
    }

    // 防止重複創建（理論上在同步代碼中不會發生，但作為防禦性編程）
    if (isCreatingToolbar) {
      throw new Error('Toolbar is being created, please wait');
    }

    try {
      isCreatingToolbar = true;

      // 動態創建 Toolbar
      currentToolbar = new Toolbar(manager);
      currentToolbar.initialize();
      currentToolbar.updateHighlightCount();

      // 更新 storage 的 toolbar 引用 (如果需要)
      if (storage) {
        storage.toolbar = currentToolbar;
      }

      // 更新 window.HighlighterV2.toolbar 引用
      if (globalThis.HighlighterV2) {
        globalThis.HighlighterV2.toolbar = currentToolbar;
      }

      return currentToolbar;
    } finally {
      isCreatingToolbar = false;
    }
  };

  globalThis.notionHighlighter = {
    manager,
    restoreManager,
    show: () => {
      const tb = ensureToolbar();
      tb.show();
    },
    hide: () => currentToolbar?.hide(),
    minimize: () => currentToolbar?.minimize(),
    toggle: () => {
      const tb = ensureToolbar();
      const state = tb.stateManager.currentState;
      if (state === 'hidden') {
        tb.show();
      } else {
        tb.hide();
      }
    },
    collectHighlights: () => manager.collectHighlightsForNotion(),
    clearAll: () => manager.clearAll(),
    getCount: () => manager.getCount(),
    // 🔑 新增：暴露 forceRestoreHighlights 以保持與 highlight-restore.js 的兼容性
    forceRestoreHighlights: () => restoreManager.restore(),
    // 🔑 新增：創建並顯示 Toolbar（保存完成後調用）
    createAndShowToolbar: () => {
      const tb = ensureToolbar();
      tb.show();
      return tb;
    },
  };

  // 🔑 全域函數別名（向後兼容）
  globalThis.initHighlighter = () => {
    if (globalThis.notionHighlighter) {
      globalThis.notionHighlighter.show();
    }
    return globalThis.notionHighlighter;
  };

  globalThis.collectHighlights = () => {
    if (globalThis.notionHighlighter) {
      return globalThis.notionHighlighter.collectHighlights();
    }
    return [];
  };

  globalThis.clearPageHighlights = () => {
    if (globalThis.notionHighlighter) {
      globalThis.notionHighlighter.clearAll();
    }
  };
  return { manager, toolbar, restoreManager };
}

// 自動初始化（在 browser 環境中）
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
export { RestoreManager, HighlightStorage } from './core/HighlightStorage.js';
export {
  restoreRangeWithRetry,
  serializeRange,
  deserializeRange,
  findRangeByTextContent,
  validateRange,
} from './core/Range.js';
export { convertBgColorToName, COLORS } from './utils/color.js';
export { isValidElement, getVisibleText, supportsHighlightAPI } from './utils/dom.js';
export { findTextWithTreeWalker, findTextFuzzy, findTextInPage } from './utils/textSearch.js';
export { HighlightManager } from './core/HighlightManager.js';
export { Toolbar } from './ui/Toolbar.js';
export { StyleManager } from './core/StyleManager.js';
export { HighlightInteraction } from './core/HighlightInteraction.js';
export { HighlightMigration } from './core/HighlightMigration.js';
export { isValidColor, isValidRange, isValidHighlightData } from './utils/validation.js';
export { getNodePath, getNodeByPath } from './utils/path.js';
export { waitForDOMStability } from './utils/domStability.js';
