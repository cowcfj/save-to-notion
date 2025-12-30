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
import { HighlightStorage, RestoreManager } from './core/HighlightStorage.js';

import {
  serializeRange,
  deserializeRange,
  restoreRangeWithRetry,
  findRangeByTextContent,
  validateRange,
} from './core/Range.js';

// UI modules
import { Toolbar } from './ui/Toolbar.js';

// Utility modules
import { COLORS, convertBgColorToName, VALID_STYLES } from './utils/color.js';
import { supportsHighlightAPI, isValidElement, getVisibleText } from './utils/dom.js';
import { isValidColor, isValidRange, isValidHighlightData } from './utils/validation.js';
import { getNodePath, getNodeByPath } from './utils/path.js';
import { findTextInPage, findTextWithTreeWalker, findTextFuzzy } from './utils/textSearch.js';
import { waitForDOMStability } from './utils/domStability.js';

// Storage utility - 導入以設置 window.StorageUtil（由 HighlightStorage 使用）
import './utils/StorageUtil.js';

// Logger - 統一日誌記錄
import Logger from '../utils/Logger.js';

// 導入並掛載 normalizeUrl（供 HighlightManager/Storage 使用）
import { normalizeUrl } from '../utils/urlUtils.js';
if (typeof window !== 'undefined' && !window.normalizeUrl) {
  window.normalizeUrl = normalizeUrl;
}

/**
 * 創建並注入所有依賴模組到 HighlightManager
 * @param {HighlightManager} manager - HighlightManager 實例
 * @param {Object} options - 配置選項
 * @param {Toolbar} [toolbar=null] - 工具欄實例（可選）。
 *   僅由 HighlightStorage 使用，用於在恢復標註後自動隱藏工具欄。
 *   如果不需要此功能，可傳入 null 或省略此參數。
 * @returns {Object} 包含所有創建的模組實例
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
 * @returns {HighlightManager}
 */
export function initHighlighter(options = {}) {
  const manager = new HighlightManager(options);

  // 注入依賴
  const deps = createAndInjectDependencies(manager, options);

  // 驗證關鍵依賴是否成功創建
  if (!deps.styleManager || !deps.storage) {
    Logger.error('[initHighlighter] 關鍵依賴創建失敗，初始化中止');
    return manager; // 返回未初始化的 manager，避免後續錯誤
  }

  // 自動執行初始化
  manager.initializationComplete = manager.initialize();

  // 監聽來自 background 的消息
  if (window.chrome?.runtime && window.chrome.runtime.onMessage) {
    window.chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'toggleHighlighter') {
        if (window.notionHighlighter) {
          window.notionHighlighter.toggle();
          sendResponse({ success: true, isActive: window.notionHighlighter.isActive() });
          return true; // 只在實際發送響應時返回 true
        }
        // notionHighlighter 未初始化
        sendResponse({ success: false, error: 'notionHighlighter not initialized' });
        return true;
      }
      // 不處理的消息不返回 true
      return false;
    });
  }

  return manager;
}

/**
 * 初始化 Highlighter V2 (包含工具欄)
 * @param {Object} [options] - 初始化選項
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
export {
  // Core
  HighlightManager,
  Toolbar,
  RestoreManager, // Alias for HighlightStorage
  HighlightStorage,
  StyleManager,
  HighlightInteraction,
  HighlightMigration,
  serializeRange,
  deserializeRange,
  restoreRangeWithRetry,
  findRangeByTextContent,
  validateRange,

  // Utils
  COLORS,
  convertBgColorToName,
  supportsHighlightAPI,
  isValidElement,
  getVisibleText,
  isValidColor,
  isValidRange,
  isValidHighlightData,
  getNodePath,
  getNodeByPath,
  findTextInPage,
  findTextWithTreeWalker,
  findTextFuzzy,
  waitForDOMStability,
};

/**
 * 默認導出：自動初始化並設置到 window
 * @param {Object} [options] - 初始化選項
 * @param {boolean} [options.skipRestore] - 是否跳過恢復標註
 * @param {boolean} [options.skipToolbar] - 是否跳過創建工具欄
 */
export function setupHighlighter(options = {}) {
  if (typeof window === 'undefined') {
    throw new Error('Highlighter V2 requires a browser environment');
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
  window.HighlighterV2 = {
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
      if (window.HighlighterV2) {
        window.HighlighterV2.toolbar = currentToolbar;
      }

      return currentToolbar;
    } finally {
      isCreatingToolbar = false;
    }
  };

  window.notionHighlighter = {
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
  window.initHighlighter = () => {
    if (window.notionHighlighter) {
      window.notionHighlighter.show();
    }
    return window.notionHighlighter;
  };

  window.collectHighlights = () => {
    if (window.notionHighlighter) {
      return window.notionHighlighter.collectHighlights();
    }
    return [];
  };

  window.clearPageHighlights = () => {
    if (window.notionHighlighter) {
      window.notionHighlighter.clearAll();
    }
  };
  return { manager, toolbar, restoreManager };
}

// 自動初始化（在 browser 環境中）
if (typeof window !== 'undefined' && !window.HighlighterV2) {
  // 🔑 異步初始化：先檢查頁面狀態，決定是否恢復標註和創建 Toolbar
  const initializeExtension = async () => {
    try {
      let skipRestore = false;
      let skipToolbar = true; // 默認不創建 Toolbar（頁面未保存或已刪除）
      let styleMode = 'background';

      // 並行加載配置和頁面狀態
      const [pageStatus, settings] = await Promise.all([
        // 1. 檢查頁面狀態
        new Promise(resolve => {
          if (window.chrome?.runtime?.sendMessage) {
            window.chrome.runtime.sendMessage({ action: 'checkPageStatus' }, result => {
              // 檢查 lastError 以避免 runtime 錯誤（例如 extension context 無效）
              if (window.chrome.runtime.lastError) {
                Logger.warn(
                  '[Highlighter] checkPageStatus failed:',
                  window.chrome.runtime.lastError
                );
                resolve(null);
              } else {
                resolve(result);
              }
            });
          } else {
            resolve(null);
          }
        }),
        // 2. 加載標註樣式配置
        new Promise(resolve => {
          if (window.chrome?.storage?.sync) {
            window.chrome.storage.sync.get(['highlightStyle'], result => {
              if (window.chrome.runtime.lastError) {
                Logger.warn(
                  '[Highlighter] Failed to load settings:',
                  window.chrome.runtime.lastError
                );
                resolve({});
              } else {
                resolve(result || {});
              }
            });
          } else {
            resolve({});
          }
        }),
      ]);

      // 處理樣式配置，驗證值是否在允許的集合中
      if (settings?.highlightStyle && VALID_STYLES.includes(settings.highlightStyle)) {
        styleMode = settings.highlightStyle;
      } else if (settings?.highlightStyle) {
        // 設定值無效，記錄警告並使用預設值
        Logger.warn('[Highlighter] Invalid highlightStyle value:', settings.highlightStyle);
      }

      // 處理頁面狀態
      if (pageStatus?.wasDeleted) {
        // 頁面已在 Notion 刪除，跳過標註恢復和 Toolbar
        skipRestore = true;
        skipToolbar = true;
        Logger.log('[Highlighter] Page was deleted, skipping toolbar and restore.');
      } else if (pageStatus?.isSaved) {
        // 頁面已保存，創建 Toolbar
        skipToolbar = false;
      }
      // 如果 isSaved === false 且 wasDeleted === false，表示頁面未保存，不創建 Toolbar

      // 初始化 Highlighter
      setupHighlighter({ skipRestore, skipToolbar, styleMode });
    } catch (error) {
      Logger.error('[Highlighter] Initialization failed:', error);
      // 發生嚴重錯誤時，嘗試以安全模式初始化（不帶 Toolbar 和 Restore）
      // 以確保基本功能可用，或至少不導致頁面其他腳本崩潰
      try {
        setupHighlighter({ skipRestore: true, skipToolbar: true });
      } catch (fallbackError) {
        console.error('[Highlighter] Fallback initialization failed:', fallbackError);
      }
    }
  };

  initializeExtension();

  // 🔑 監聽來自 Popup 的消息（如保存完成後顯示 Toolbar）
  if (window.chrome?.runtime?.onMessage) {
    window.chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (request.action === 'showToolbar') {
        // 保存完成後，創建並顯示 Toolbar
        if (window.notionHighlighter?.createAndShowToolbar) {
          try {
            window.notionHighlighter.createAndShowToolbar();
            sendResponse({ success: true });
          } catch (error) {
            Logger.error('[Highlighter] Failed to show toolbar:', error);
            sendResponse({ success: false, error: error.message });
          }
        } else {
          sendResponse({ success: false, error: 'notionHighlighter not initialized' });
        }
      }
      return undefined;
    });
  }

  // 🔑 監聽設定變更以動態更新標註樣式
  if (window.chrome?.storage?.onChanged) {
    window.chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.highlightStyle) {
        const newStyle = changes.highlightStyle.newValue;
        if (newStyle && VALID_STYLES.includes(newStyle) && window.HighlighterV2?.manager) {
          window.HighlighterV2.manager.updateStyleMode(newStyle);
        }
      }
    });
  }
}
