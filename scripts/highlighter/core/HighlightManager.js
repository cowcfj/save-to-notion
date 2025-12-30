/**
 * HighlightManager 核心類別
 * 管理標註的核心邏輯，並協調其他模組完成樣式、交互、存儲和遷移工作。
 *
 * @version 2.19.0
 */

import { serializeRange, deserializeRange, findRangeByTextContent } from './Range.js';
import { COLORS } from '../utils/color.js';
import Logger from '../../utils/Logger.js';
import { StorageUtil } from '../utils/StorageUtil.js';

/**
 * HighlightManager
 * 管理所有標註操作，採用組合模式委託具體職責給子模組。
 */
export class HighlightManager {
  /**
   * @param {Object} options - 配置選項
   */
  constructor(options = {}) {
    // 核心數據結構
    this.highlights = new Map(); // ID -> {range, color, text, timestamp, rangeInfo}
    this.nextId = 1;
    this.currentColor = options.defaultColor || 'yellow';

    // 顏色配置（向後兼容，供 Toolbar 等組件使用）
    this.colors = COLORS;

    // 初始化標誌
    this.initializationComplete = Promise.resolve();

    // 子模組依賴（通過 setDependencies 注入）
    this.styleManager = null;
    this.interaction = null;
    this.storage = null;
    this.migration = null;
  }

  /**
   * 注入依賴模組
   * @param {Object} dependencies
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
   * @param {boolean} [skipRestore=false] - 是否跳過恢復標註（用於頁面已刪除的情況）
   */
  async initialize(skipRestore = false) {
    if (!this.migration || !this.storage || !this.styleManager) {
      Logger.warn('[HighlightManager] 依賴未注入，初始化可能不完整');
    }

    try {
      Logger.info('[HighlightManager] 開始初始化');

      // 初始化樣式管理器
      if (this.styleManager) {
        this.styleManager.initialize();
      }

      // 步驟1：檢查並遷移 localStorage 數據
      if (this.migration) {
        await this.checkAndMigrateLegacyData();
      }

      // 步驟2：從存儲恢復標註（如果允許）
      if (!skipRestore) {
        await this.restoreHighlights();
      } else {
        Logger.info('[HighlightManager] 跳過恢復標註（頁面已刪除）');
      }

      Logger.info('[HighlightManager] 初始化完成');
    } catch (error) {
      Logger.error('[HighlightManager] 初始化失敗:', error);
    }
  }

  /**
   * 添加標註
   * @param {Range} range - 選區範圍
   * @param {string} [color] - 標註顏色
   * @returns {string|null} 標註 ID
   */
  addHighlight(range, color = this.currentColor) {
    if (!range || range.collapsed || range.toString().trim().length === 0) {
      return null;
    }

    try {
      const id = `h${this.nextId++}`;
      const text = range.toString();

      // 序列化 Range 用於存儲
      const rangeInfo = serializeRange(range);

      const highlight = {
        id,
        range,
        color,
        text,
        timestamp: Date.now(),
        rangeInfo,
      };

      this.highlights.set(id, highlight);

      // 應用視覺效果
      this.applyHighlightAPI(range, color);

      Logger.debug(`[HighlightManager] Added highlight ${id} (${color})`);

      // 自動保存到存儲
      if (this.storage) {
        this.storage.save();
      }

      return id;
    } catch (error) {
      Logger.error('[HighlightManager] 添加標註失敗:', error);
      return null;
    }
  }

  /**
   * 移除標註
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
    Logger.debug(`[HighlightManager] Removed highlight ${id}`);

    // 保存變更（如有 storage）
    if (this.storage) {
      this.storage.save();
    }

    return true;
  }

  /**
   * 清除所有標註
   */
  clearAll() {
    // 清除視覺效果
    if (this.styleManager) {
      this.styleManager.clearAllHighlights();
    }

    this.highlights.clear();
    Logger.info('[HighlightManager] 已清除所有標註');

    // 保存變更（清空存儲）
    if (this.storage) {
      this.storage.save();
    }
  }

  /**
   * 應用 Highlight API 樣式
   * @param {Range} range
   * @param {string} color
   */
  applyHighlightAPI(range, color) {
    if (!this.styleManager) {
      return;
    }

    const highlightObject = this.styleManager.getHighlightObject(color);
    if (highlightObject) {
      highlightObject.add(range);
    }
  }

  /**
   * 設置當前高亮顏色
   * @param {string} color
   */
  setColor(color) {
    if (COLORS[color]) {
      this.currentColor = color;
    } else {
      Logger.warn(`[HighlightManager] Invalid color: ${color}`);
    }
  }

  /**
   * 獲取當前標註數量
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
   * @param {MouseEvent} event
   * @returns {boolean} 是否處理了點擊
   */
  handleDocumentClick(event) {
    return this.interaction ? this.interaction.handleClick(event) : false;
  }

  /**
   * 檢測點擊位置是否在標註內
   * @param {number} x
   * @param {number} y
   * @returns {string|null}
   */
  getHighlightAtPoint(x, y) {
    return this.interaction ? this.interaction.getHighlightAtPoint(x, y) : null;
  }

  /**
   * 檢測兩個 Range 是否重疊
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
    if (this.styleManager) {
      this.styleManager.initialize();
    }
  }

  injectHighlightStyles() {
    if (this.styleManager) {
      this.styleManager.injectStyles();
    }
  }

  updateStyleMode(newStyleMode) {
    if (this.styleManager) {
      this.styleManager.updateMode(newStyleMode);
    }
  }

  // --- Storage ---

  async saveToStorage() {
    if (this.storage) {
      await this.storage.save();
    }
  }

  async restoreHighlights() {
    if (this.storage) {
      await this.storage.restore();
    }
  }

  collectHighlightsForNotion() {
    return this.storage ? this.storage.collectForNotion() : [];
  }

  // --- Restoration Implementation ---

  async forceRestoreHighlights() {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      const currentUrl = window.normalizeUrl
        ? window.normalizeUrl(window.location.href)
        : window.location.href;

      const data = await StorageUtil.loadHighlights(currentUrl);

      // StorageUtil.loadHighlights 返回數組（已經過 _parseHighlightFormat 處理）
      const highlights = Array.isArray(data) ? data : data?.highlights || [];

      if (highlights.length > 0) {
        // 清除現有（避免重複）
        this.highlights.clear();
        if (this.styleManager) {
          this.styleManager.clearAllHighlights();
        }

        let successCount = 0;

        for (const item of highlights) {
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
              const numId = parseInt(item.id.replace('h', ''), 10);
              if (!isNaN(numId) && numId >= this.nextId) {
                this.nextId = numId + 1;
              }

              successCount++;
            }
          } catch (error) {
            Logger.warn(`Failed to restore highlight ${item.id}`, error);
          }
        }

        Logger.info(`[HighlightManager] Restored ${successCount} highlights`);
        return true;
      }
      return false;
    } catch (error) {
      Logger.error('[HighlightManager] forceRestoreHighlights failed:', error);
      return false;
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

  static convertBgColorToName(bgColor) {
    const colorMap = {
      'rgb(255, 243, 205)': 'yellow',
      '#fff3cd': 'yellow',
      'rgb(212, 237, 218)': 'green',
      '#d4edda': 'green',
      'rgb(204, 231, 255)': 'blue',
      '#cce7ff': 'blue',
      'rgb(248, 215, 218)': 'red',
      '#f8d7da': 'red',
    };
    return colorMap[bgColor] || 'yellow';
  }

  static getSafeExtensionStorage() {
    if (
      typeof window !== 'undefined' &&
      window.chrome &&
      window.chrome.runtime &&
      window.chrome.runtime.id
    ) {
      return window.chrome.storage?.local || null;
    }
    return null;
  }
}
