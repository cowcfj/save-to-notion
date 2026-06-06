/**
 * HighlightManager 核心類別
 * 管理標註的核心邏輯，並協調其他模組完成樣式、交互、存儲和遷移工作。
 */

import { serializeRange, restoreRangeWithRetry } from './Range.js';
import { COLORS, convertBgColorToName } from '../utils/color.js';
import Logger from '../../utils/Logger.js';
import { HighlightInteraction } from './HighlightInteraction.js';

const EXTENSION_UI_OWNER_VALUE = 'true';
const EXTENSION_UI_HOSTS = [
  { idPrefix: 'notion-floating-rail-host', ownerAttr: 'data-rail-owner' },
  { idPrefix: 'notion-highlighter-host', ownerAttr: 'data-highlighter-owner' },
  { idPrefix: 'notion-toast-host', ownerAttr: 'data-toast-owner' },
];
const EXTENSION_UI_SELECTOR = EXTENSION_UI_HOSTS.flatMap(({ idPrefix, ownerAttr }) => [
  `#${idPrefix}[${ownerAttr}="${EXTENSION_UI_OWNER_VALUE}"]`,
  `[id^="${idPrefix}-"][${ownerAttr}="${EXTENSION_UI_OWNER_VALUE}"]`,
]).join(', ');

function matchesExtensionUiHostPrefix(id, prefix) {
  if (!id) {
    return false;
  }

  if (id === prefix) {
    return true;
  }

  return id.startsWith(`${prefix}-`);
}

function hasExtensionUiOwner(element, ownerAttr) {
  if (typeof element.getAttribute !== 'function') {
    return false;
  }

  return element.getAttribute(ownerAttr) === EXTENSION_UI_OWNER_VALUE;
}

function isExtensionUiHostElement(element) {
  return EXTENSION_UI_HOSTS.some(
    ({ idPrefix, ownerAttr }) =>
      matchesExtensionUiHostPrefix(element.id, idPrefix) && hasExtensionUiOwner(element, ownerAttr)
  );
}

function isExtensionUiElement(element) {
  if (!element) {
    return false;
  }

  if (isExtensionUiHostElement(element)) {
    return true;
  }

  if (typeof element.closest !== 'function') {
    return false;
  }

  return Boolean(element.closest(EXTENSION_UI_SELECTOR));
}

/**
 * HighlightManager
 * 管理所有標註操作，採用組合模式委託具體職責給子模組。
 */
export class HighlightManager {
  /**
   * 初始化 Promise（預設為已解決狀態）
   * 注意：此屬性會在 index.js 中被覆寫為實際的 initialize() Promise，
   * 以便外部代碼可以 await manager.initializationComplete 來等待初始化完成。
   * 預設值確保在未調用 initialize() 時，await 不會阻塞。
   */
  initializationComplete = Promise.resolve();

  /**
   * @param {object} options - 配置選項
   */
  constructor(options = {}) {
    // 核心數據結構
    this.highlights = new Map(); // ID -> {range, color, text, timestamp, rangeInfo}
    this.nextId = 1;
    this.currentColor = options.defaultColor || 'yellow';

    // 顏色配置（向後兼容，供 Toolbar 等組件使用）
    this.colors = COLORS;

    // 子模組依賴（通過 setDependencies 注入）
    this.styleManager = null;
    this.interaction = null;
    this.storage = null;
    this.migration = null;
    this.toast = null;
    this.isHighlighting = false;
    this.selectionHandler = null;
  }

  /**
   * 注入依賴模組
   *
   * @param {object} dependencies
   * @param {StyleManager} dependencies.styleManager
   * @param {HighlightInteraction} dependencies.interaction
   * @param {HighlightStorage} dependencies.storage
   * @param {HighlightMigration} dependencies.migration
   * @param {Toast} [dependencies.toast] - 選擇性注入；若提供，標註成功/失敗會觸發使用者可見的 toast。
   */
  setDependencies({ styleManager, interaction, storage, migration, toast }) {
    this.styleManager = styleManager;
    this.interaction = interaction;
    this.storage = storage;
    this.migration = migration;
    this.toast = toast || null;
  }

  /**
   * 異步初始化流程
   *
   * @param {boolean} [skipRestore=false] - 是否跳過恢復標註（用於頁面已刪除的情況）
   */
  async initialize(skipRestore = false) {
    try {
      const requiredDependencies = [this.migration, this.storage, this.styleManager];
      if (requiredDependencies.some(dependency => !dependency)) {
        throw new Error('依賴未注入，初始化中止');
      }

      Logger.start('開始初始化', { action: 'initialize' });

      // 初始化樣式管理器（外層已確認 this.styleManager 存在）
      this.styleManager.initialize();

      // 步驟1：檢查並遷移 localStorage 數據（外層已確認 this.migration 存在）
      await this.checkAndMigrateLegacyData();

      // 步驟2：從存儲恢復標註（如果允許）
      if (skipRestore) {
        Logger.info('跳過恢復標註（頁面已刪除）', { action: 'initialize' });
      } else {
        await this.restoreHighlights();
      }

      Logger.success('初始化完成', { action: 'initialize' });
    } catch (error) {
      Logger.error('初始化失敗', { action: 'initialize', error });
    }
  }

  /**
   * 添加標註
   *
   * @param {Range} range - 選區範圍
   * @param {string} [color] - 標註顏色
   * @returns {string|null} 標註 ID
   */
  addHighlight(range, color = this.currentColor) {
    if (!HighlightManager._isHighlightableRange(range)) {
      return null;
    }

    const validatedColor = this._resolveAddHighlightColor(color);

    try {
      const text = range.toString();
      const rangeInfo = serializeRange(range);

      // 先套用視覺效果，成功後才建立 ID 與 Map entry，避免失敗路徑留下 stale state。
      const applied = this.applyHighlightAPI(range, validatedColor);
      if (!applied) {
        return this._cancelFailedHighlightCreation();
      }

      const id = `h${this.nextId++}`;
      const highlight = {
        id,
        range,
        color: validatedColor,
        text,
        timestamp: Date.now(),
        rangeInfo,
      };

      this.highlights.set(id, highlight);

      Logger.debug('已添加標註', { action: 'addHighlight', id, color: validatedColor });

      // 自動保存到存儲
      if (this.storage) {
        this.storage.save();
      }

      return id;
    } catch (error) {
      Logger.error('添加標註失敗', { action: 'addHighlight', error });
      return null;
    }
  }

  static _isHighlightableRange(range) {
    if (!range) {
      return false;
    }

    if (range.collapsed) {
      return false;
    }

    return range.toString().trim().length > 0;
  }

  _resolveAddHighlightColor(color) {
    if (!this.styleManager) {
      return HighlightManager._resolveAddColorWithoutStyleManager(color, this.currentColor);
    }

    const style = this.styleManager.getHighlightObject(color);
    if (style) {
      return color;
    }

    Logger.warn('顏色無效，回退到預設顏色', {
      action: 'addHighlight',
      color,
      fallback: this.currentColor,
    });
    return this.currentColor;
  }

  static _resolveAddColorWithoutStyleManager(color, fallbackColor) {
    if (!color) {
      return fallbackColor;
    }

    if (typeof color !== 'string') {
      return fallbackColor;
    }

    return color;
  }

  _cancelFailedHighlightCreation(id = null) {
    if (id) {
      this.highlights.delete(id);
    }
    Logger.warn('無法應用視覺效果，標註已取消', { action: 'addHighlight' });

    // 失敗路徑統一回報 HIGHLIGHT_FAILED；HIGHLIGHT_DUPLICATE 預留給未來
    // 重複偵測能力（需要先定義 duplicate 判定規則），目前 addHighlight 不做去重。
    this.toast?.show('HIGHLIGHT_FAILED', { level: 'error' });
    return null;
  }

  /**
   * 移除標註
   *
   * @param {string} id - 標註 ID
   * @returns {boolean} 是否成功移除
   */
  removeHighlight(id) {
    const highlight = this.highlights.get(id);
    if (!highlight) {
      return false;
    }

    // 從 CSS Highlight API 移除
    if (this.styleManager) {
      const highlightObject = this.styleManager.getHighlightObject(highlight.color);
      if (highlightObject && highlight.range) {
        highlightObject.delete(highlight.range);
      }
    }

    // 從 Map 移除
    this.highlights.delete(id);
    Logger.debug('已移除標註', { action: 'removeHighlight', id });

    // 保存變更（如有 storage）
    if (this.storage) {
      this.storage.save();
    }

    this.toast?.show('HIGHLIGHT_DELETED', { level: 'success' });
    return true;
  }

  /**
   * 清除所有標註
   *
   * @param {object} [options] - 配置選項
   * @param {boolean} [options.skipStorage] - 是否跳過存儲更新
   */
  clearAll(options = {}) {
    // 清除視覺效果
    if (this.styleManager) {
      this.styleManager.clearAllHighlights();
    }

    this.highlights.clear();
    Logger.success('已清除所有標註', { action: 'clearAll' });

    // 保存變更（清空存儲）
    if (this.storage && !options.skipStorage) {
      this.storage.save();
    }
  }

  /**
   * 應用 Highlight API 樣式
   *
   * @param {Range} range
   * @param {string} color
   * @returns {boolean} 是否成功應用
   */
  applyHighlightAPI(range, color) {
    if (!this.styleManager) {
      throw new Error('applyHighlightAPI called but styleManager not injected');
    }

    const highlightObject = this.styleManager.getHighlightObject(color);
    if (highlightObject) {
      highlightObject.add(range);
      return true;
    }
    return false;
  }

  /**
   * 設置當前高亮顏色
   *
   * @param {string} color
   */
  setColor(color) {
    if (COLORS[color]) {
      this.currentColor = color;
    } else {
      Logger.warn('顏色無效', { action: 'setColor', color });
    }
  }

  /**
   * 獲取當前標註數量
   *
   * @returns {number}
   */
  getCount() {
    return this.highlights.size;
  }

  /**
   * 清理資源
   */
  cleanup() {
    this.stopHighlighting();
    this.highlights.clear();

    if (this.styleManager) {
      this.styleManager.cleanup();
    }
  }

  /**
   * 啟動由 Floating Rail 使用的標註模式。
   *
   * @param {string} [color] - 啟動時套用的標註顏色
   * @returns {false|void} 若 `document` 不存在則提前返回 `false`；否則返回 `void`
   */
  startHighlighting(color = this.currentColor) {
    if (this.isHighlighting) {
      this.setHighlightColor(color);
      return;
    }

    if (globalThis.document === undefined) {
      return false;
    }

    this.setHighlightColor(color);
    this.isHighlighting = true;
    this.selectionHandler = event => {
      this._handleSelectionMouseUp(event);
    };

    document.addEventListener('mouseup', this.selectionHandler);
  }

  _handleSelectionMouseUp(event) {
    if (this._shouldIgnoreSelectionMouseUp(event)) {
      return;
    }

    const selection = this._getActiveTextSelection();
    if (!selection) {
      return;
    }

    const rangeSnapshot = this._cloneSelectionRange(selection);
    if (!rangeSnapshot) {
      return;
    }

    try {
      const id = this.addHighlight(rangeSnapshot, this.currentColor);
      if (id) {
        selection.removeAllRanges?.();
      }
    } catch (error) {
      Logger.error('添加標註失敗', {
        action: 'railSelectionHandler',
        error,
      });
    }
  }

  _shouldIgnoreSelectionMouseUp(event) {
    if (!this.isHighlighting) {
      return true;
    }

    return HighlightManager._isExtensionUiEvent(event);
  }

  _getActiveTextSelection() {
    const selection = globalThis.getSelection?.();
    if (!selection) {
      return null;
    }

    if (selection.isCollapsed) {
      return null;
    }

    if (!selection.toString().trim()) {
      return null;
    }

    return selection;
  }

  _cloneSelectionRange(selection) {
    try {
      return selection.getRangeAt(0).cloneRange();
    } catch (error) {
      Logger.error('添加標註失敗', {
        action: 'railSelectionHandler',
        error,
      });
      return null;
    }
  }

  /**
   * 停止 Floating Rail 標註模式。
   */
  stopHighlighting() {
    this.isHighlighting = false;
    if (this.selectionHandler && globalThis.document !== undefined) {
      document.removeEventListener('mouseup', this.selectionHandler);
    }
    this.selectionHandler = null;
  }

  /**
   * 設置 Floating Rail 使用的目前標註顏色。
   *
   * @param {string} color
   */
  setHighlightColor(color) {
    this.setColor(color);
  }

  /**
   * 判斷 mouseup 是否來自 extension UI，避免點擊 rail/toolbar 時建立標註。
   *
   * @param {Event} event
   * @returns {boolean}
   * @private
   */
  static _isExtensionUiEvent(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    return path.some(element => isExtensionUiElement(element));
  }

  // ========== 委託方法 (Delegation) ==========

  // --- Interaction ---

  /**
   * 處理文檔點擊事件
   *
   * @param {MouseEvent} event
   * @returns {boolean} 是否處理了點擊
   */
  handleDocumentClick(event) {
    if (!this.interaction) {
      throw new Error('handleDocumentClick called but interaction not injected');
    }
    return this.interaction.handleClick(event);
  }

  /**
   * 檢測點擊位置是否在標註內
   *
   * @param {number} x
   * @param {number} y
   * @returns {string|null}
   */
  getHighlightAtPoint(x, y) {
    if (!this.interaction) {
      throw new Error('getHighlightAtPoint called but interaction not injected');
    }
    return this.interaction.getHighlightAtPoint(x, y);
  }

  /**
   * 檢測兩個 Range 是否重疊
   *
   * @param {Range} range1 - 第一個選區
   * @param {Range} range2 - 第二個選區
   * @returns {boolean} 是否重疊
   */
  static rangesOverlap(range1, range2) {
    return HighlightInteraction.rangesOverlap(range1, range2);
  }

  // --- Style ---

  initializeHighlightStyles() {
    if (!this.styleManager) {
      throw new Error('initializeHighlightStyles called but styleManager not injected');
    }
    this.styleManager.initialize();
  }

  injectHighlightStyles() {
    if (!this.styleManager) {
      throw new Error('injectHighlightStyles called but styleManager not injected');
    }
    this.styleManager.injectStyles();
  }

  updateStyleMode(newStyleMode) {
    if (!this.styleManager) {
      throw new Error('updateStyleMode called but styleManager not injected');
    }
    this.styleManager.updateMode(newStyleMode);
  }

  // --- Storage ---

  async saveToStorage() {
    if (!this.storage) {
      throw new Error('saveToStorage called but storage not injected');
    }
    await this.storage.save();
  }

  async restoreHighlights() {
    if (!this.storage) {
      throw new Error('restoreHighlights called but storage not injected');
    }
    await this.storage.restore();
  }

  collectHighlightsForNotion() {
    if (!this.storage) {
      throw new Error('collectHighlightsForNotion called but storage not injected');
    }
    return this.storage.collectForNotion();
  }

  /**
   * 解析候選顏色（恢復流程專用）
   *
   * @param {string} rawColor
   * @returns {string[]}
   * @private
   */
  _buildRestoreColorCandidates(rawColor) {
    const candidates = [];
    const color = typeof rawColor === 'string' ? rawColor.trim().toLowerCase() : '';

    const pushCandidate = value => {
      if (!value || typeof value !== 'string') {
        return;
      }
      if (!candidates.includes(value)) {
        candidates.push(value);
      }
    };

    pushCandidate(color);

    if (color.startsWith('#') || color.startsWith('rgb(')) {
      pushCandidate(convertBgColorToName(color));
    }

    pushCandidate(this.currentColor);
    pushCandidate('yellow');

    return candidates;
  }

  /**
   * 標準化恢復顏色（若無有效顏色則回退）
   *
   * @param {string} rawColor
   * @returns {string}
   * @private
   */
  _normalizeRestoreColor(rawColor) {
    const candidates = this._buildRestoreColorCandidates(rawColor);

    // 若 styleManager 尚未注入，回退到第一個候選值
    if (!this.styleManager) {
      return candidates[0] || 'yellow';
    }

    const matched = candidates.find(candidate => this.styleManager.getHighlightObject(candidate));
    return matched || 'yellow';
  }

  /**
   * 以防禦模式套用標註樣式
   *
   * @param {Range} range
   * @param {string} color
   * @returns {boolean}
   * @private
   */
  _tryApplyHighlight(range, color) {
    try {
      return this.applyHighlightAPI(range, color);
    } catch (error) {
      Logger.warn('套用標註樣式時發生異常', {
        action: 'restoreLocalHighlight',
        color,
        error: error?.message ?? String(error),
      });
      return false;
    }
  }

  static _buildUniqueColorAttempts(colors) {
    const attempts = [];

    for (const color of colors) {
      if (!attempts.includes(color)) {
        attempts.push(color);
      }
    }

    return attempts;
  }

  _tryRestoreColorAttempts(range, colors) {
    for (const color of colors) {
      if (this._tryApplyHighlight(range, color)) {
        return { applied: true, color };
      }
    }

    return null;
  }

  _canReinitializeStyles() {
    return Boolean(this.styleManager && typeof this.styleManager.initialize === 'function');
  }

  /**
   * 恢復流程的樣式套用重試鏈
   * 1) 原顏色
   * 2) fallback 顏色
   * 3) 重建 style object 後重試
   *
   * @param {Range} range
   * @param {string} preferredColor
   * @returns {{applied: boolean, color: string}}
   * @private
   */
  _applyHighlightWithRestoreFallback(range, preferredColor) {
    const normalizedColor = this._normalizeRestoreColor(preferredColor);
    const fallbackColor = this._normalizeRestoreColor(this.currentColor);
    const initialAttempts = HighlightManager._buildUniqueColorAttempts([
      normalizedColor,
      fallbackColor,
    ]);
    const initialResult = this._tryRestoreColorAttempts(range, initialAttempts);
    if (initialResult) {
      return initialResult;
    }

    // 最後嘗試：重建 style objects 後再重試
    if (!this._canReinitializeStyles()) {
      return { applied: false, color: normalizedColor };
    }

    this.styleManager.initialize();
    const retryAttempts = HighlightManager._buildUniqueColorAttempts([
      fallbackColor,
      normalizedColor,
    ]);
    const retryResult = this._tryRestoreColorAttempts(range, retryAttempts);
    return retryResult || { applied: false, color: normalizedColor };
  }

  // --- Restoration Implementation ---
  //
  // 架構說明：恢復邏輯保留在 HighlightManager 而非 HighlightStorage 的原因：
  // 1. 需要直接操作 this.highlights Map（核心數據結構）
  // 2. 需要調用 this.applyHighlightAPI() 應用視覺效果
  // 3. 需要更新 this.nextId 以避免 ID 衝突
  // 4. 需要訪問 this.styleManager 進行樣式操作
  //
  // 如果移至 HighlightStorage，需要通過回調或暴露內部狀態來完成這些操作，
  // 反而會增加耦合度。HighlightStorage 負責「何時恢復」和「從哪裡讀取數據」，
  // 而 HighlightManager 負責「如何重建標註」。

  /**
   * 僅恢復單個標註（由 Storage 調用）
   *
   * @param {object} item - 標註數據
   * @returns {Promise<boolean>}
   */
  async restoreLocalHighlight(item) {
    let id;
    try {
      // 確保 id 存在且為字串，若無則生成新 ID
      id = this._resolveRestoreHighlightId(item);

      // 使用 restoreRangeWithRetry：含 expectedText 驗證、prefix/suffix消歧義、DOM穩定性重試
      const range = await restoreRangeWithRetry(item.rangeInfo, item.text);
      if (!range) {
        return false;
      }

      const highlight = this._buildRestoredHighlight(item, id, range);
      this.highlights.set(id, highlight);

      // 應用視覺效果，失敗時走 fallback + style 重建重試鏈
      const { applied, color } = this._applyHighlightWithRestoreFallback(range, highlight.color);
      if (!applied) {
        return this._cancelFailedRestore(id);
      }

      highlight.color = color;
      this._advanceNextIdFromHighlightId(id);
      return true;
    } catch (error) {
      // 清理可能殘留的 Map 條目（防止 applyHighlightAPI 拋出異常時的殘留）
      this._cleanupRestoreEntry(id);
      Logger.warn('恢復標註失敗', {
        action: 'restoreLocalHighlight',
        id,
        error,
      });
      return false;
    }
  }

  _resolveRestoreHighlightId(item) {
    if (item.id) {
      return String(item.id);
    }

    return `h${this.nextId++}`;
  }

  _buildRestoredHighlight(item, id, range) {
    return {
      id,
      range,
      color: this._normalizeRestoreColor(item.color || 'yellow'),
      text: item.text,
      timestamp: item.timestamp || Date.now(),
      rangeInfo: item.rangeInfo,
    };
  }

  _cancelFailedRestore(id) {
    this.highlights.delete(id);
    Logger.warn('無法應用視覺效果，恢復標註已取消', { action: 'restoreLocalHighlight', id });
    return false;
  }

  _advanceNextIdFromHighlightId(id) {
    const numId = Number.parseInt(id.replace('h', ''), 10);
    if (!Number.isNaN(numId) && numId >= this.nextId) {
      this.nextId = numId + 1;
    }
  }

  _cleanupRestoreEntry(id) {
    if (id) {
      this.highlights.delete(id);
    }
  }

  // --- Migration ---

  async checkAndMigrateLegacyData() {
    if (this.migration) {
      await this.migration.checkAndMigrate();
    }
  }

  migrateLegacyDataToNewFormat(legacyData, oldKey) {
    if (this.migration) {
      return this.migration.migrateToNewFormat(legacyData, oldKey);
    }
    return Promise.resolve();
  }

  static getSafeExtensionStorage() {
    if (globalThis.window === undefined) {
      return null;
    }

    const chromeApi = globalThis.chrome;
    if (!chromeApi) {
      return null;
    }

    if (!chromeApi.runtime?.id) {
      return null;
    }

    if (!chromeApi.storage) {
      return null;
    }

    return chromeApi.storage.local || null;
  }
}
