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
 * @returns {{manager: HighlightManager, toolbar: Toolbar}}
 */
export function initHighlighterWithToolbar(options = {}) {
  const manager = new HighlightManager(options);
  const toolbar = new Toolbar(manager);

  // 自動執行初始化（傳遞 skipRestore 選項）
  manager.initializationComplete = manager.initialize(options.skipRestore).then(() => {
    // 初始化完成後更新計數
    toolbar.updateHighlightCount();
  });

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
 */
export function setupHighlighter(options = {}) {
  if (typeof window === 'undefined') {
    throw new Error('Highlighter V2 requires a browser environment');
  }

  // 初始化 manager 和 toolbar（傳遞 skipRestore 選項）
  const { manager, toolbar } = initHighlighterWithToolbar(options);

  // 🔑 初始化 RestoreManager 並自動恢復標註
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
    init: options => initHighlighter(options),
    initWithToolbar: options => initHighlighterWithToolbar(options),
    getInstance: () => manager,
    getToolbar: () => toolbar,
    getRestoreManager: () => restoreManager,
  };

  // 🔑 向後兼容：設置舊版 API
  window.notionHighlighter = {
    manager,
    restoreManager,
    show: () => toolbar.show(),
    hide: () => toolbar.hide(),
    minimize: () => toolbar.minimize(),
    toggle: () => {
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
  // 🔑 異步初始化：先檢查頁面狀態，防止在已刪除頁面上恢復標註
  const initializeExtension = async () => {
    let skipRestore = false;

    // 檢查頁面狀態（使用正常緩存機制，不帶 forceRefresh）
    // 只有當緩存過期（>60s）時，Background 才會進行 API 檢查
    // 如果發現頁面已刪除，會返回 wasDeleted: true
    if (window.chrome?.runtime?.sendMessage) {
      try {
        const response = await new Promise(resolve => {
          window.chrome.runtime.sendMessage({ action: 'checkPageStatus' }, result => {
            // 處理 Chrome runtime 錯誤（例如 extension context invalidated）
            if (window.chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(result);
            }
          });
        });

        if (response?.wasDeleted) {
          // 頁面已在 Notion 刪除，跳過標註恢復
          skipRestore = true;
          console.log('[Highlighter] Page was deleted in Notion, skipping highlight restore.');
        }
      } catch (error) {
        // 如果檢查失敗，默認恢復標註（Fail Safe）
        console.warn('[Highlighter] Failed to check page status:', error);
      }
    }

    // 初始化 Highlighter（傳入 skipRestore 選項）
    setupHighlighter({ skipRestore });
  };

  initializeExtension();
}
