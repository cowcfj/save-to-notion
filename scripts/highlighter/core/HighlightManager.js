/**
 * HighlightManager 核心類別
 * 管理標註的核心邏輯，並協調其他模組完成樣式、交互、存儲和遷移工作。
 */

import { serializeRange, deserializeRange, findRangeByTextContent } from './Range.js';
import { COLORS } from '../utils/color.js';
import Logger from '../../utils/Logger.js';

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
  }

  /**
   * 注入依賴模組
   *
   * @param {object} dependencies
   * @param {StyleManager} dependencies.styleManager
   * @param {HighlightInteraction} dependencies.interaction
   * @param {HighlightStorage} dependencies.storage
   * @param {HighlightMigration} dependencies.migration
   */
  setDependencies({ styleManager, interaction, storage, migration }) {
    this.styleManager = styleManager;
    this.interaction = interaction;
    this.storage = storage;
    this.migration = migration;
  }

  /**
   * 異步初始化流程
   *
   * @param {boolean} [skipRestore=false] - 是否跳過恢復標註（用於頁面已刪除的情況）
   */
  async initialize(skipRestore = false) {
    try {
      if (!this.migration || !this.storage || !this.styleManager) {
        throw new Error('依賴未注入，初始化中止');
      }

      Logger.start('開始初始化', { action: 'initialize' });

      // 初始化樣式管理器
      if (this.styleManager) {
        this.styleManager.initialize();
      }

      // 步驟1：檢查並遷移 localStorage 數據
      if (this.migration) {
        await this.checkAndMigrateLegacyData();
      }

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
    if (!range || range.collapsed || range.toString().trim().length === 0) {
      return null;
    }

    // 驗證顏色：確保 styleManager 支援該顏色
    let validatedColor = color;
    if (this.styleManager) {
      const style = this.styleManager.getHighlightObject(color);
      if (!style) {
        Logger.warn('顏色無效，回退到預設顏色', {
          action: 'addHighlight',
          color,
          fallback: this.currentColor,
        });
        validatedColor = this.currentColor;
      }
    } else if (!color || typeof color !== 'string') {
      // 無 styleManager 時的基本驗證
      validatedColor = this.currentColor;
    }

    try {
      const id = `h${this.nextId++}`;
      const text = range.toString();

      // 序列化 Range 用於存儲
      const rangeInfo = serializeRange(range);

      const highlight = {
        id,
        range,
        color: validatedColor,
        text,
        timestamp: Date.now(),
        rangeInfo,
      };

      this.highlights.set(id, highlight);

      // 應用視覺效果
      const applied = this.applyHighlightAPI(range, validatedColor);
      if (!applied) {
        // 如果視覺效果應用失敗，回滾標註添加
        this.highlights.delete(id);

        // 不回收 ID (this.nextId--) 以保持 ID 單調遞增，避免並發問題
        Logger.warn('無法應用視覺效果，標註已取消', { action: 'addHighlight' });
        return null;
      }

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
    this.highlights.clear();

    if (this.styleManager) {
      this.styleManager.cleanup();
    }
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
    try {
      return (
        range1.isPointInRange(range2.startContainer, range2.startOffset) ||
        range1.isPointInRange(range2.endContainer, range2.endOffset) ||
        range2.isPointInRange(range1.startContainer, range1.startOffset)
      );
    } catch {
      return false;
    }
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
   * @returns {boolean}
   */
  restoreLocalHighlight(item) {
    try {
      let range = null;
      if (item.rangeInfo) {
        range = deserializeRange(item.rangeInfo);
      }

      // 如果反序列化失敗，嘗試文本搜尋
      if (!range && item.text) {
        range = findRangeByTextContent(item.text);
      }

      if (range) {
        // 重建 highlight
        const highlight = {
          id: item.id,
          range,
          color: item.color || 'yellow',
          text: item.text,
          timestamp: item.timestamp || Date.now(),
          rangeInfo: item.rangeInfo,
        };

        this.highlights.set(item.id, highlight);
        this.applyHighlightAPI(range, highlight.color);

        // 更新 nextId 以避免衝突
        const numId = Number.parseInt(item.id.replace('h', ''), 10);
        if (!Number.isNaN(numId) && numId >= this.nextId) {
          this.nextId = numId + 1;
        }

        return true;
      }
    } catch (error) {
      Logger.warn('恢復標註失敗', {
        action: 'restoreLocalHighlight',
        id: item.id,
        error,
      });
    }
    return false;
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
    if (globalThis.window !== undefined && globalThis.chrome?.runtime?.id) {
      return globalThis.chrome.storage?.local || null;
    }
    return null;
  }
}
