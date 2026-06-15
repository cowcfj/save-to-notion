/**
 * Highlighter V2 - ES6 Module API Entry
 *
 * 整合所有模組並提供統一導出。
 * 此模組為純 API / library 入口；匯入本檔不會觸發 runtime 自動初始化。
 * 若需要 content script 載入時自動初始化，請改由 entryAutoInit.js 作為 side-effect entry。
 */

// Core modules
import { HighlightManager } from './core/HighlightManager.js';
import { StyleManager } from './core/StyleManager.js';
import { HighlightInteraction } from './core/HighlightInteraction.js';
import { HighlightMigration } from './core/HighlightMigration.js';
import { HighlightStorage } from './core/HighlightStorage.js';
import { Toast } from './ui/Toast.js';

// 導入並掛載 normalizeUrl（供 HighlightManager/Storage 使用）
import { normalizeUrl } from '../utils/urlUtils.js';
if (globalThis.window !== undefined && !globalThis.normalizeUrl) {
  globalThis.normalizeUrl = normalizeUrl;
}

// globalThis 掛載層（新版 HighlighterV2 + 向後兼容 notionHighlighter）
import { mountWindowAPI } from './windowAPI.js';

function remountWindowAPI(manager, storage) {
  // toast 由 manager.setDependencies 注入，這裡統一從 manager 讀取，
  // 避免每個 call site 各自把 toast 拼進 state object。
  mountWindowAPI({
    manager,
    storage,
    fns: {
      init: opts => {
        const nextManager = initHighlighter(opts);
        remountWindowAPI(nextManager, nextManager.storage);
        return nextManager;
      },
    },
    toast: manager.toast,
  });
}

/**
 * 創建並注入所有依賴模組到 HighlightManager
 *
 * @param {HighlightManager} manager - HighlightManager 實例
 * @param {object} options - 配置選項
 * @returns {object} 包含所有創建的模組實例
 */
function createAndInjectDependencies(manager, options) {
  const styleManager = new StyleManager(options);
  const interaction = new HighlightInteraction(manager);
  const migration = new HighlightMigration(manager);
  const storage = new HighlightStorage(manager);
  const toast = new Toast();

  manager.setDependencies({
    styleManager,
    interaction,
    migration,
    storage,
    toast,
  });

  return { styleManager, interaction, migration, storage, toast };
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
  createAndInjectDependencies(manager, options);

  // 自動執行初始化
  manager.initializationComplete = manager.initialize();

  return manager;
}

/**
 * 導出所有模組供外部使用
 */

/**
 * 顯式初始化 Highlighter 並掛載到 window。
 * 注意：必須由呼叫端主動執行；單純 import 本模組不會自動初始化。
 *
 * @param {object} [options] - 初始化選項
 * @param {boolean} [options.skipRestore] - 是否跳過恢復標註
 * @returns {object} 包含 manager, restoreManager 的對象
 */
export function setupHighlighter(options = {}) {
  if (globalThis.window === undefined) {
    throw new TypeError('Highlighter V2 requires a browser environment');
  }

  // 初始化 manager
  const manager = initHighlighter(options);

  // 使用已經創建並注入的 HighlighStorage 作為 restoreManager
  const restoreManager = manager.storage;

  // 掛載 globalThis API（新版 HighlighterV2 + 向後兼容 notionHighlighter）
  remountWindowAPI(manager, restoreManager);

  return { manager, restoreManager };
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
export { StyleManager } from './core/StyleManager.js';
export { HighlightInteraction } from './core/HighlightInteraction.js';
export { HighlightMigration } from './core/HighlightMigration.js';
export { isValidColor, isValidRange, isValidHighlightData } from './utils/validation.js';
export { getNodePath, getNodeByPath } from './utils/path.js';
export { waitForDOMStability } from './utils/domStability.js';
