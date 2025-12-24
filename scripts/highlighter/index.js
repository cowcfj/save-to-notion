/**
 * Highlighter V2 - ES6 Module Entry Point
 *
 * 整合所有模組並提供統一導出
 * @version 2.19.0
 */

// Core modules
import { HighlightManager } from './core/HighlightManager.js';
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
import { COLORS, convertBgColorToName } from './utils/color.js';
import { supportsHighlightAPI, isValidElement, getVisibleText } from './utils/dom.js';
import { isValidColor, isValidRange, isValidHighlightData } from './utils/validation.js';
import { getNodePath, getNodeByPath } from './utils/path.js';
import { findTextInPage, findTextWithTreeWalker, findTextFuzzy } from './utils/textSearch.js';
import { waitForDOMStability } from './utils/domStability.js';

// Storage utility - 導入以設置 window.StorageUtil（由 HighlightManager 使用）
import './utils/StorageUtil.js';

// Logger - 統一日誌記錄
import Logger from '../utils/Logger.js';

// 導入並掛載 normalizeUrl（供 HighlightManager.restoreHighlights 使用）
import { normalizeUrl } from '../utils/urlUtils.js';
if (typeof window !== 'undefined' && !window.normalizeUrl) {
  window.normalizeUrl = normalizeUrl;
}

// Restore module - 標註恢復管理器
import { RestoreManager } from './core/RestoreManager.js';

/**
 * 初始化 Highlighter V2 (僅 Manager)
 * @returns {HighlightManager}
 */
export function initHighlighter(options = {}) {
  const manager = new HighlightManager(options);

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
 * @returns {{manager: HighlightManager, toolbar: Toolbar|null}}
 */
export function initHighlighterWithToolbar(options = {}) {
  const manager = new HighlightManager(options);

  // 如果 skipToolbar 為 true，不創建 Toolbar
  const toolbar = options.skipToolbar ? null : new Toolbar(manager);

  // 自動執行初始化
  manager.initializationComplete = (async () => {
    // 初始化 Manager
    await manager.initialize(options.skipRestore);

    // 如果有 Toolbar，初始化並更新計數
    if (toolbar) {
      await toolbar.initialize();
      toolbar.updateHighlightCount();
    }
  })();

  return { manager, toolbar };
}

/**
 * 導出所有模組供外部使用
 */
export {
  // Core
  HighlightManager,
  Toolbar,
  RestoreManager,
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

  const { manager, toolbar } = initHighlighterWithToolbar(effectiveOptions);

  // 🔑 初始化 RestoreManager（即使沒有 toolbar 也需要）
  const restoreManager = new RestoreManager(manager, toolbar);

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
  window.notionHighlighter = {
    manager,
    restoreManager,
    show: () => toolbar?.show(),
    hide: () => toolbar?.hide(),
    minimize: () => toolbar?.minimize(),
    toggle: () => {
      if (!toolbar) {
        return;
      }
      const state = toolbar.stateManager.currentState;
      if (state === 'hidden') {
        toolbar.show();
      } else {
        toolbar.hide();
      }
    },
    collectHighlights: () => manager.collectHighlightsForNotion(),
    clearAll: () => manager.clearAll(),
    getCount: () => manager.getCount(),
    // 🔑 新增：暴露 forceRestoreHighlights 以保持與 highlight-restore.js 的兼容性
    forceRestoreHighlights: () => restoreManager.restore(),
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
    let skipRestore = false;
    let skipToolbar = true; // 默認不創建 Toolbar（頁面未保存或已刪除）

    // 檢查頁面狀態
    if (window.chrome?.runtime?.sendMessage) {
      try {
        const response = await new Promise(resolve => {
          window.chrome.runtime.sendMessage({ action: 'checkPageStatus' }, result => {
            if (window.chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(result);
            }
          });
        });

        if (response?.wasDeleted) {
          // 頁面已在 Notion 刪除，跳過標註恢復和 Toolbar
          skipRestore = true;
          skipToolbar = true;
          Logger.log('[Highlighter] Page was deleted, skipping toolbar and restore.');
        } else if (response?.isSaved) {
          // 頁面已保存，創建 Toolbar
          skipToolbar = false;
        }
        // 如果 isSaved === false 且 wasDeleted === false，表示頁面未保存，不創建 Toolbar
      } catch (error) {
        Logger.warn('[Highlighter] Failed to check page status:', error);
      }
    }

    // 初始化 Highlighter
    setupHighlighter({ skipRestore, skipToolbar });
  };

  initializeExtension();
}
