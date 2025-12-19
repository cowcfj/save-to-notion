/**
 * Highlighter V2 - ES6 Module Entry Point
 *
 * 整合所有模組並提供統一導出
 * @version 2.9.12
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
import '../utils/StorageUtil.js';

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
 * @returns {{manager: HighlightManager, toolbar: Toolbar}}
 */
export function initHighlighterWithToolbar(options = {}) {
  const manager = new HighlightManager(options);
  const toolbar = new Toolbar(manager);

  // 自動執行初始化
  // 自動執行初始化
  manager.initializationComplete = manager.initialize().then(() => {
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
 */
export function setupHighlighter() {
  if (typeof window === 'undefined') {
    throw new Error('Highlighter V2 requires a browser environment');
  }

  // 初始化 manager 和 toolbar
  const { manager, toolbar } = initHighlighterWithToolbar();

  // 設置新版 API 到 window for Chrome Extension compatibility
  window.HighlighterV2 = {
    manager,
    toolbar,

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
  };

  // 🔑 向後兼容：設置舊版 API
  window.notionHighlighter = {
    manager,
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

  return { manager, toolbar };
}

// 自動初始化（在 browser 環境中）
if (typeof window !== 'undefined' && !window.HighlighterV2) {
  setupHighlighter();

  // 🔑 通知 background 檢查頁面狀態並更新 badge
  // 這確保在頁面載入後 extension icon 的 badge 立即更新
  if (typeof window !== 'undefined' && window.chrome?.runtime?.sendMessage) {
    window.chrome.runtime.sendMessage({ action: 'checkPageStatus' }, _response => {
      // 靜默處理，不需要回應
      if (window.chrome.runtime.lastError) {
        // 忽略錯誤（例如 background script 未就緒）
      }
    });
  }
}
