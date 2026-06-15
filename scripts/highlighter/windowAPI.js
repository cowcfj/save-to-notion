/**
 * windowAPI.js
 *
 * 負責將 Highlighter V2 的公開 API 掛載到 globalThis（window），
 * 包含新版 HighlighterV2 物件與向後兼容的 notionHighlighter 物件。
 *
 * 此模組為純掛載層，不包含任何業務邏輯，由 setupHighlighter() 呼叫。
 */

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

const LEGACY_INACTIVE_UI_STATES = new Set(['hidden', 'collapsed']);

function getLegacyUiController() {
  const rail = globalThis.HighlighterV2?.rail;
  if (rail) {
    return rail;
  }
  Logger.warn('[Highlighter] 舊版 UI 控制器不可用', {
    action: 'getLegacyUiController',
    reason: 'rail_missing',
  });
  return null;
}

function warnMissingActiveUi() {
  Logger.warn('[Highlighter] isActive 在無 UI 時被調用', {
    action: 'isActive',
    reason: 'rail_missing',
    result: 'blocked',
  });
}

function isLegacyUiActive(legacyUi) {
  if (legacyUi.host?.style?.display === 'none') {
    return false;
  }

  const uiState = legacyUi.stateManager?.currentState;
  if (typeof uiState !== 'string') {
    return false;
  }

  return !LEGACY_INACTIVE_UI_STATES.has(uiState);
}

function buildHighlighterV2API({ manager, restoreManager, toast, fns }) {
  const apiFns = fns ?? {};
  const api = {
    manager,
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
    getRestoreManager: () => restoreManager,
  };

  // 可選函數（將 initHighlighter 從 index.js 導入）
  if (apiFns.init) {
    api.init = apiFns.init;
  }

  return api;
}

function buildLegacyHighlighterAPI(manager, restoreManager) {
  return {
    manager,
    restoreManager,
    show: () => {
      getLegacyUiController()?.show?.();
    },
    hide: () => getLegacyUiController()?.hide?.(),
    minimize: () => {
      const legacyUi = getLegacyUiController();
      legacyUi?.minimize?.();
      legacyUi?.collapse?.();
    },
    isActive: () => {
      const rail = globalThis.HighlighterV2?.rail;
      if (!rail) {
        warnMissingActiveUi();
        return false;
      }

      return isLegacyUiActive(rail);
    },
    toggle: () => {
      const legacyUi = getLegacyUiController();
      if (!legacyUi) {
        return;
      }

      if (isLegacyUiActive(legacyUi)) {
        legacyUi.hide?.();
        return;
      }

      legacyUi.show?.();
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
 * @param {import('./core/HighlightStorage.js').HighlightStorage} options.storage
 * @param {{ init?: Function }} [options.fns={}] - 可選函數導入層，避免循環依賴
 * @param {import('./ui/Toast.js').Toast|null} [options.toast=null] - 可選的 Toast 實例；
 *   若提供，會暴露在 `HighlighterV2.toast` 供 dev tools / cleanup 使用，
 *   業務邏輯（addHighlight / removeHighlight）已透過 manager 注入直接觸發。
 */
export function mountWindowAPI({ manager, storage, fns = {}, toast = null }) {
  const restoreManager = storage;

  // 新版 HighlighterV2 API
  globalThis.HighlighterV2 = buildHighlighterV2API({
    manager,
    restoreManager,
    toast,
    fns,
  });

  // 🔑 向後兼容：設置舊版 notionHighlighter API
  globalThis.notionHighlighter = buildLegacyHighlighterAPI(manager, restoreManager);

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
