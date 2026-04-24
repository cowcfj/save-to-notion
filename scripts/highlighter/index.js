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

// UI modules
import { Toolbar } from './ui/Toolbar.js';

// 導入並掛載 normalizeUrl（供 HighlightManager/Storage 使用）
import { normalizeUrl } from '../utils/urlUtils.js';
import { HIGHLIGHTER_ACTIONS } from '../config/runtimeActions/highlighterActions.js';
if (globalThis.window !== undefined && !globalThis.normalizeUrl) {
  globalThis.normalizeUrl = normalizeUrl;
}

// globalThis 掛載層（新版 HighlighterV2 + 向後兼容 notionHighlighter）
import { mountWindowAPI } from './windowAPI.js';

let toggleHighlighterMessageListener = null;

function handleToggleHighlighterMessage(request, _sender, sendResponse) {
  if (request.action === HIGHLIGHTER_ACTIONS.TOGGLE_HIGHLIGHTER) {
    if (globalThis.notionHighlighter) {
      globalThis.notionHighlighter.toggle();
      sendResponse({ success: true, isActive: globalThis.notionHighlighter.isActive() });
      return true;
    }

    sendResponse({ success: false, error: 'notionHighlighter not initialized' });
    return true;
  }

  return false;
}

function bindToggleHighlighterListener() {
  const onMessage = globalThis.chrome?.runtime?.onMessage;
  if (!onMessage?.addListener) {
    return;
  }

  if (toggleHighlighterMessageListener && onMessage.removeListener) {
    onMessage.removeListener(toggleHighlighterMessageListener);
  }

  toggleHighlighterMessageListener = handleToggleHighlighterMessage;
  onMessage.addListener(toggleHighlighterMessageListener);
}

function remountWindowAPI(manager, toolbar, storage) {
  mountWindowAPI(manager, toolbar, storage, {
    init: opts => {
      const nextManager = initHighlighter(opts);
      remountWindowAPI(nextManager, null, nextManager.storage);
      return nextManager;
    },
    initWithToolbar: opts => {
      const nextState = initHighlighterWithToolbar(opts);
      remountWindowAPI(nextState.manager, nextState.toolbar, nextState.storage);
      return nextState;
    },
  });
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
  createAndInjectDependencies(manager, options);

  // 自動執行初始化
  manager.initializationComplete = manager.initialize();

  bindToggleHighlighterListener();

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

  bindToggleHighlighterListener();

  // 附加 storage 到返回值，方便 setupHighlighter 使用
  return { manager, toolbar, storage };
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

  // 掛載 globalThis API（新版 HighlighterV2 + 向後兼容 notionHighlighter）
  remountWindowAPI(manager, toolbar, storage);

  return { manager, toolbar, restoreManager };
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
