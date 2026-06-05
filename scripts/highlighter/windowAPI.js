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
import Logger from '../utils/Logger.js';

// Test-only build-time gate. `globalThis.__UNIT_TESTING__` is replaced with
// the literal `false` in production by [rollup/content.config.mjs](../../rollup/content.config.mjs),
// so the entire toolbar branch below is dead-code-eliminated by terser. The
// `Toolbar` import + `ensureToolbar` body only ship in test bundles. See
// [docs/plans/2026-05-14-windowapi-legacy-compat-hardening-plan.md](../../docs/plans/2026-05-14-windowapi-legacy-compat-hardening-plan.md).
const TOOLBAR_TEST_FIXTURE_ENABLED = globalThis.__UNIT_TESTING__ !== false;
const LEGACY_INACTIVE_UI_STATES = new Set(['hidden', 'collapsed']);

function ensureToolbar(state) {
  if (!TOOLBAR_TEST_FIXTURE_ENABLED) {
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
  const toolbar = ensureToolbar(state);
  if (toolbar) {
    return toolbar;
  }
  const rail = globalThis.HighlighterV2?.rail;
  if (rail) {
    return rail;
  }
  Logger.warn('[Highlighter] 舊版 UI 控制器不可用', {
    action: 'getLegacyUiController',
    reason: 'toolbar_disabled_and_rail_missing',
    toolbarTestFixtureEnabled: TOOLBAR_TEST_FIXTURE_ENABLED,
  });
  return null;
}

function resolveToolbarActiveState(state) {
  const toolbarState = state.currentToolbar?.stateManager?.currentState;
  if (typeof toolbarState !== 'string') {
    return null;
  }
  return toolbarState !== 'hidden';
}

function warnMissingActiveUi() {
  Logger.warn('[Highlighter] isActive 在無 UI 時被調用', {
    action: 'isActive',
    reason: 'toolbar_disabled_and_rail_missing',
  });
}

function isRailActive(rail) {
  if (rail.host?.style?.display === 'none') {
    return false;
  }

  const railState = rail.stateManager?.currentState;
  if (typeof railState !== 'string') {
    return false;
  }

  return !LEGACY_INACTIVE_UI_STATES.has(railState);
}

function isLegacyUiHiddenOrCollapsed(legacyUi) {
  if (legacyUi.host?.style?.display === 'none') {
    return true;
  }

  return LEGACY_INACTIVE_UI_STATES.has(legacyUi.stateManager?.currentState);
}

function buildHighlighterV2API({ manager, toolbar, restoreManager, toast, fns, state }) {
  const apiFns = fns ?? {};
  const api = {
    manager,
    toolbar,
    restoreManager,
    toast,

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
  };

  // 可選函數（將 initHighlighter / initHighlighterWithToolbar 從 index.js 導入）
  if (apiFns.init) {
    api.init = apiFns.init;
  }
  if (apiFns.initWithToolbar) {
    api.initWithToolbar = apiFns.initWithToolbar;
  }

  return api;
}

function buildLegacyHighlighterAPI(manager, restoreManager, state) {
  return {
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
      const toolbarActiveState = resolveToolbarActiveState(state);
      if (toolbarActiveState !== null) {
        return toolbarActiveState;
      }

      const rail = globalThis.HighlighterV2?.rail;
      if (!rail) {
        warnMissingActiveUi();
        return false;
      }

      return isRailActive(rail);
    },
    toggle: () => {
      const legacyUi = getLegacyUiController(state);
      if (!legacyUi) {
        return;
      }

      if (isLegacyUiHiddenOrCollapsed(legacyUi)) {
        legacyUi.show?.();
        return;
      }

      legacyUi.hide?.();
    },
    collectHighlights: () => manager.collectHighlightsForNotion(),
    clearAll: (options = {}) => manager.clearAll(options),
    getCount: () => manager.getCount(),
    forceRestoreHighlights: () => restoreManager.restore(),
  };
}

/**
 * 將 Highlighter V2 API 掛載到 globalThis
 *
 * @param {object} options
 * @param {import('./core/HighlightManager.js').HighlightManager} options.manager
 * @param {import('./ui/Toolbar.js').Toolbar|null} [options.toolbar=null]
 * @param {import('./core/HighlightStorage.js').HighlightStorage} options.storage
 * @param {{ init?: Function, initWithToolbar?: Function }} [options.fns={}] - 可選函數導入層，避免循環依賴
 * @param {import('./ui/Toast.js').Toast|null} [options.toast=null] - 可選的 Toast 實例；
 *   若提供，會暴露在 `HighlighterV2.toast` 供 dev tools / cleanup 使用，
 *   業務邏輯（addHighlight / removeHighlight）已透過 manager 注入直接觸發。
 */
export function mountWindowAPI({ manager, toolbar = null, storage, fns = {}, toast = null }) {
  const restoreManager = storage;
  const state = {
    currentToolbar: toolbar,
    isCreatingToolbar: false,
    manager,
    storage,
  };

  // 新版 HighlighterV2 API
  globalThis.HighlighterV2 = buildHighlighterV2API({
    manager,
    toolbar,
    restoreManager,
    toast,
    fns,
    state,
  });

  // 🔑 向後兼容：設置舊版 notionHighlighter API
  globalThis.notionHighlighter = buildLegacyHighlighterAPI(manager, restoreManager, state);

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
      globalThis.notionHighlighter.clearAll({ skipStorage: true });
    }
  };
}
