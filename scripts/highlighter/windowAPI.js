/**
 * windowAPI.js
 *
 * 負責將 Highlighter V2 的公開 API 掛載到 globalThis（window），
 * 包含新版 HighlighterV2 物件與向後兼容的 notionHighlighter 物件。
 *
 * 此模組為純掛載層，不包含任何業務邏輯，由 setupHighlighter() 呼叫。
 */

import { Toolbar } from './ui/Toolbar.js';
import {
  serializeRange,
  deserializeRange,
  findRangeByTextContent,
  validateRange,
} from './core/Range.js';
import { COLORS } from './utils/color.js';
import { supportsHighlightAPI } from './utils/dom.js';
import { isValidColor, isValidRange, isValidHighlightData } from './utils/validation.js';
import { getNodePath, getNodeByPath } from './utils/path.js';
import { findTextInPage } from './utils/textSearch.js';
import { waitForDOMStability } from './utils/domStability.js';

const TOOLBAR_COMPAT_ENABLED = globalThis.__UNIT_TESTING__ !== false;

/**
 * 動態創建 Toolbar（如果尚未創建）
 *
 * @param {object} state - 閉包狀態 { currentToolbar, isCreatingToolbar, manager, storage }
 * @returns {Toolbar|null}
 */
function ensureToolbar(state) {
  if (!TOOLBAR_COMPAT_ENABLED) {
    return null;
  }

  if (state.currentToolbar) {
    return state.currentToolbar;
  }

  // 防止重複創建（理論上在同步代碼中不會發生，但作為防禦性編程）
  if (state.isCreatingToolbar) {
    throw new Error('Toolbar is being created, please wait');
  }

  try {
    state.isCreatingToolbar = true;

    // 動態創建 Toolbar
    state.currentToolbar = new Toolbar(state.manager);
    state.currentToolbar.initialize();
    state.currentToolbar.updateHighlightCount();

    // 更新 storage 的 toolbar 引用 (如果需要)
    if (state.storage) {
      state.storage.toolbar = state.currentToolbar;
    }

    // 更新 window.HighlighterV2.toolbar 引用
    if (globalThis.HighlighterV2) {
      globalThis.HighlighterV2.toolbar = state.currentToolbar;
    }

    return state.currentToolbar;
  } finally {
    state.isCreatingToolbar = false;
  }
}

function getLegacyUiController(state) {
  return ensureToolbar(state) || globalThis.HighlighterV2?.rail || null;
}

/**
 * 將 Highlighter V2 API 掛載到 globalThis
 *
 * @param {import('./core/HighlightManager.js').HighlightManager} manager
 * @param {import('./ui/Toolbar.js').Toolbar|null} toolbar
 * @param {import('./core/HighlightStorage.js').HighlightStorage} storage
 * @param {{ init?: Function, initWithToolbar?: Function }} [fns={}] - 可選函數導入層，避免循環依賴
 */
export function mountWindowAPI(manager, toolbar, storage, fns = {}) {
  const restoreManager = storage;
  const state = {
    currentToolbar: toolbar,
    isCreatingToolbar: false,
    manager,
    storage,
  };

  // 新版 HighlighterV2 API
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
    getInstance: () => manager,
    getToolbar: () => state.currentToolbar,
    getRestoreManager: () => restoreManager,
    // 可選函數（將 initHighlighter / initHighlighterWithToolbar 從 index.js 導入）
    ...(fns.init ? { init: fns.init } : {}),
    ...(fns.initWithToolbar ? { initWithToolbar: fns.initWithToolbar } : {}),
  };

  // 🔑 向後兼容：設置舊版 notionHighlighter API
  globalThis.notionHighlighter = {
    manager,
    restoreManager,
    show: () => {
      getLegacyUiController(state)?.show?.();
    },
    hide: () => getLegacyUiController(state)?.hide?.(),
    minimize: () => {
      const legacyUi = getLegacyUiController(state);
      legacyUi?.minimize?.();
      legacyUi?.collapse?.();
    },
    isActive: () => {
      const toolbarState = state.currentToolbar?.stateManager?.currentState;
      if (typeof toolbarState === 'string') {
        return toolbarState !== 'hidden';
      }

      const rail = globalThis.HighlighterV2?.rail;
      if (!rail) {
        return false;
      }

      const railState = rail.stateManager?.currentState;
      const isHidden = rail.host?.style?.display === 'none';
      return !isHidden && typeof railState === 'string' && railState !== 'collapsed';
    },
    toggle: () => {
      const legacyUi = getLegacyUiController(state);
      if (!legacyUi) {
        return;
      }

      const toolbarState = legacyUi.stateManager?.currentState;
      const isRailHidden = legacyUi.host?.style?.display === 'none';

      if (toolbarState === 'hidden' || toolbarState === 'collapsed' || isRailHidden) {
        legacyUi.show?.();
      } else {
        legacyUi.hide?.();
      }
    },
    collectHighlights: () => manager.collectHighlightsForNotion(),
    clearAll: () => manager.clearAll(),
    getCount: () => manager.getCount(),
    forceRestoreHighlights: () => restoreManager.restore(),
    createAndShowToolbar: () => {
      const legacyUi = getLegacyUiController(state);
      legacyUi?.show?.();
      return legacyUi;
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
}
