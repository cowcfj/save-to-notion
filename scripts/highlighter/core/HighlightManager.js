/* global CSS */
/**
 * HighlightManager 核心類別
 * 管理所有標註操作、存儲、遷移和恢復
 *
 * @version 2.19.0
 */

import { serializeRange, restoreRangeWithRetry } from './Range.js';
import { COLORS } from '../utils/color.js';
import { supportsHighlightAPI } from '../utils/dom.js';
import { findTextInPage } from '../utils/textSearch.js';
import Logger from '../../utils/Logger.js';
// 注意：DOM span 遷移已改為 On-Demand 模式，由選項頁面觸發

/**
 * HighlightManager
 * 管理所有標註操作，包括創建、刪除、存儲和恢復標註。
 * 同時支持現代 CSS Highlight API 和傳統 DOM 標註方式。
 */
export class HighlightManager {
  constructor(options = {}) {
    // 核心數據結構
    this.highlights = new Map(); // ID -> {range, color, text, timestamp, rangeInfo}
    this.nextId = 1;
    this.currentColor = options.defaultColor || 'yellow';
    this.colors = COLORS;
    this.highlightObjects = {}; // 顏色 -> Highlight 對象

    // 初始化標誌
    this.initializationComplete = null;

    // 為每種顏色創建 Highlight 對象
    if (typeof window !== 'undefined' && supportsHighlightAPI()) {
      this.initializeHighlightStyles();
    }
  }

  // ...

  /**
   * 異步初始化流程
   */
  async initialize() {
    try {
      Logger.info('[HighlightManager] 開始初始化');

      // 步驟1：檢查並遷移 localStorage 數據
      await this.checkAndMigrateLegacyData();

      // 步驟2：從存儲恢復標註
      await this.restoreHighlights();

      // 步驟3：執行無痛自動遷移（處理 DOM 中的舊 span）
      await this.performSeamlessMigration();

      Logger.info('[HighlightManager] 初始化完成');
    } catch (error) {
      Logger.error('[HighlightManager] 初始化失敗:', error);
    }
  }

  /**
   * 初始化 CSS Highlight 樣式
   */
  initializeHighlightStyles() {
    // 安全性檢查：確保 Highlight 是原生實作，防止原型污染
    const isNativeHighlight =
      typeof window.Highlight === 'function' &&
      window.Highlight.toString().includes('[native code]');

    if (!isNativeHighlight || !window.CSS?.highlights) {
      if (typeof window.Highlight !== 'undefined' && !isNativeHighlight) {
        Logger.warn('[HighlightManager] 檢測到非原生的 Highlight 實作，已略過初始化');
      }
      return;
    }

    // 使用全域 Highlight 建構函式
    const HighlightConstructor = window.Highlight;

    Object.keys(this.colors).forEach(colorName => {
      try {
        // 創建 Highlight 對象
        this.highlightObjects[colorName] = new HighlightConstructor();

        // 註冊到 CSS.highlights
        CSS.highlights.set(`notion-${colorName}`, this.highlightObjects[colorName]);
      } catch (error) {
        Logger.error(`初始化 ${colorName} 顏色樣式失敗:`, error);
      }
    });

    // 注入樣式
    this.injectHighlightStyles();
  }

  /**
   * 注入 CSS 樣式
   */
  injectHighlightStyles() {
    if (document.querySelector('#notion-highlight-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'notion-highlight-styles';
    style.textContent = Object.entries(this.colors)
      .map(
        ([colorName, bgColor]) => `
                ::highlight(notion-${colorName}) {
                    background-color: ${bgColor};
                    cursor: pointer;
                }
            `
      )
      .join('\n');
    document.head.appendChild(style);
  }

  /**
   * 添加標註
   * @param {Range} range - DOM Range
   * @param {string} color - 顏色名稱
   * @returns {string|null} 標註 ID
   */
  addHighlight(range, color = this.currentColor) {
    if (!range || range.collapsed) {
      return null;
    }

    const text = range.toString().trim();
    if (!text) {
      return null;
    }

    // 生成唯一 ID
    let id = `h${this.nextId++}`;
    while (this.highlights.has(id)) {
      id = `h${this.nextId++}`;
    }

    // 保存標註信息
    const highlightData = {
      id,
      range: range.cloneRange(),
      color,
      text,
      timestamp: Date.now(),
      rangeInfo: serializeRange(range),
    };

    this.highlights.set(id, highlightData);

    // 應用視覺高亮
    if (supportsHighlightAPI()) {
      this.applyHighlightAPI(id, range, color);
    } else {
      this.applyTraditionalHighlight(id, range, color);
    }

    // 保存到存儲
    this.saveToStorage();

    return id;
  }

  /**
   * 使用 CSS Highlight API 應用標註
   */
  applyHighlightAPI(id, range, color) {
    if (this.highlightObjects[color]) {
      this.highlightObjects[color].add(range);
    }
  }

  /**
   * 傳統方法應用標註（後備方案）
   */
  applyTraditionalHighlight(id, range, color) {
    try {
      const span = document.createElement('span');
      span.className = 'simple-highlight';
      span.dataset.highlightId = id;
      span.style.backgroundColor = this.colors[color];
      span.style.cursor = 'pointer';

      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);

      // 添加點擊刪除事件
      span.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.removeHighlight(id);
        }
      });
    } catch (_error) {
      Logger.error('傳統標註方法失敗:', _error);
    }
  }

  /**
   * 移除標註
   * @param {string} id - 標註 ID
   */
  removeHighlight(id) {
    const highlightData = this.highlights.get(id);
    if (!highlightData) {
      return false;
    }

    // 從 CSS Highlights 中移除
    if (supportsHighlightAPI()) {
      const color = highlightData.color;
      if (this.highlightObjects[color] && highlightData.range) {
        this.highlightObjects[color].delete(highlightData.range);
      }
    } else {
      // 傳統方法：移除 DOM 元素
      const span = document.querySelector(`[data-highlight-id="${id}"]`);
      if (span) {
        const parent = span.parentNode;
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span);
        }
        parent.removeChild(span);
        parent.normalize();
      }
    }

    this.highlights.delete(id);
    this.saveToStorage();

    return true;
  }

  /**
   * 清除所有標註
   */
  clearAll() {
    if (supportsHighlightAPI()) {
      // 只調用 .clear() 移除 ranges，保留 Highlight 對象引用和 CSS.highlights 註冊
      Object.values(this.highlightObjects).forEach(highlight => highlight.clear());
    } else {
      document.querySelectorAll('.simple-highlight').forEach(span => {
        const parent = span.parentNode;
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span);
        }
        parent.removeChild(span);
        parent.normalize();
      });
    }

    this.highlights.clear();
    this.saveToStorage();
  }

  /**
   * 檢測點擊位置是否在標註內
   * @param {number} x - X 座標
   * @param {number} y - Y 座標
   * @returns {string|null} 標註 ID
   */
  getHighlightAtPoint(x, y) {
    try {
      let range = null;
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(x, y);
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset);
      }

      if (!range) {
        return null;
      }

      for (const [id, highlight] of this.highlights.entries()) {
        if (HighlightManager.rangesOverlap(range, highlight.range)) {
          return id;
        }
      }

      return null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * 檢測兩個 Range 是否重疊
   * @param {Range} range1
   * @param {Range} range2
   * @returns {boolean}
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

  /**
   * 處理文檔點擊事件
   * @param {MouseEvent} event
   * @returns {boolean} 是否處理了點擊
   */
  handleDocumentClick(event) {
    if (!(event.ctrlKey || event.metaKey)) {
      return false;
    }

    const highlightId = this.getHighlightAtPoint(event.clientX, event.clientY);
    if (highlightId) {
      event.preventDefault();
      event.stopPropagation();
      this.removeHighlight(highlightId);
      return true;
    }

    return false;
  }

  /**
   * 設置當前顏色
   * @param {string} color
   */
  setColor(color) {
    if (this.colors[color]) {
      this.currentColor = color;
    }
  }

  /**
   * 獲取標註數量
   * @returns {number}
   */
  getCount() {
    return this.highlights.size;
  }

  /**
   * 保存到存儲
   */
  async saveToStorage() {
    if (typeof window === 'undefined' || !window.StorageUtil) {
      return;
    }

    // 使用標準化 URL 確保存儲鍵一致性
    const currentUrl = window.normalizeUrl
      ? window.normalizeUrl(window.location.href)
      : window.location.href;
    const data = {
      url: currentUrl,
      highlights: Array.from(this.highlights.values()).map(highlight => ({
        id: highlight.id,
        color: highlight.color,
        text: highlight.text,
        timestamp: highlight.timestamp,
        rangeInfo: highlight.rangeInfo,
      })),
    };

    try {
      if (data.highlights.length === 0) {
        await window.StorageUtil.clearHighlights(currentUrl);
        Logger.info('已刪除空白標註記錄');
      } else {
        await window.StorageUtil.saveHighlights(currentUrl, data);
        Logger.info(`已保存 ${data.highlights.length} 個標註`);
      }
    } catch (error) {
      Logger.error('保存標註失敗:', error);
    }
  }

  /**
   * 從存儲恢復標註
   */
  async restoreHighlights() {
    if (typeof window === 'undefined' || !window.StorageUtil) {
      return;
    }

    try {
      // 使用標準化 URL 與存儲保持一致
      const url = window.normalizeUrl
        ? window.normalizeUrl(window.location.href)
        : window.location.href;
      const highlights = await window.StorageUtil.loadHighlights(url);

      if (!highlights || highlights.length === 0) {
        return;
      }

      let restored = 0;
      let failed = 0;

      for (const highlightData of highlights) {
        // 清理舊格式的重複文本
        if (highlightData.rangeInfo?.text) {
          delete highlightData.rangeInfo.text;
        }

        const range = await restoreRangeWithRetry(highlightData.rangeInfo, highlightData.text, 3);

        if (range) {
          // 直接添加到內部結構，避免重複保存
          const id = highlightData.id || `h${this.nextId++}`;
          const highlight = {
            id,
            range: range.cloneRange(),
            color: highlightData.color,
            text: highlightData.text,
            timestamp: highlightData.timestamp || Date.now(),
            rangeInfo: highlightData.rangeInfo,
          };

          this.highlights.set(id, highlight);

          if (supportsHighlightAPI()) {
            this.applyHighlightAPI(id, range, highlightData.color);
          } else {
            this.applyTraditionalHighlight(id, range, highlightData.color);
          }

          restored++;
        } else {
          failed++;
        }
      }

      Logger.info(`恢復標註: 成功 ${restored}, 失敗 ${failed}`);

      // 如果有失敗且需要重新保存
      if (failed > 0) {
        await this.saveToStorage();
      }
    } catch (error) {
      Logger.error('恢復標註失敗:', error);
    }
  }

  /**
   * 強制恢復標註（外部 API）
   */
  async forceRestoreHighlights() {
    this.clearAll();
    await this.restoreHighlights();
  }

  /**
   * 安全獲取擴充功能存儲對象
   * 防止在非受信環境中被注入偽造的 chrome 對象
   * @returns {Object|null} chrome.storage.local 或 null
   */
  static getSafeExtensionStorage() {
    // 優先使用全域 chrome 對象（在擴充功能環境中通常可用）
    // 驗證 runtime.id 存在以確保是在擴充功能上下文中
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

  /**
   * 檢查並遷移 localStorage 中的舊標註數據
   */
  async checkAndMigrateLegacyData() {
    if (typeof window === 'undefined' || typeof window.normalizeUrl !== 'function') {
      return;
    }

    try {
      const currentUrl = window.location.href;
      const normalizedUrl = window.normalizeUrl(currentUrl);

      // 檢查可能的舊 key
      const possibleKeys = [
        `highlights_${normalizedUrl}`,
        `highlights_${currentUrl}`,
        `highlights_${window.location.origin}${window.location.pathname}`,
      ];

      let legacyData = null;
      let foundKey = null;

      // 嘗試所有可能的 key
      for (const key of possibleKeys) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const data = JSON.parse(raw);
            if (Array.isArray(data) && data.length > 0) {
              legacyData = data;
              foundKey = key;
              break;
            }
          } catch {
            // 忽略解析錯誤
          }
        }
      }

      // 如果沒找到，遍歷所有 localStorage
      if (!legacyData) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('highlights_')) {
            const raw = localStorage.getItem(key);
            try {
              const data = JSON.parse(raw);
              if (Array.isArray(data) && data.length > 0) {
                legacyData = data;
                foundKey = key;
                break;
              }
            } catch {
              // 忽略
            }
          }
        }
      }

      if (legacyData && foundKey) {
        // 檢查是否已經遷移過
        const migrationKey = `migration_completed_${normalizedUrl}`;
        const storage = HighlightManager.getSafeExtensionStorage();

        // 只有在 storage 可用時才執行遷移檢查
        if (storage) {
          const migrationStatus = await storage.get(migrationKey);

          if (!migrationStatus[migrationKey]) {
            await this.migrateLegacyDataToNewFormat(legacyData, foundKey);
          }
        }
      }
    } catch (error) {
      Logger.error('檢查舊數據失敗:', error);
    }
  }

  /**
   * 將舊格式數據遷移到新格式
   * @param {Array} legacyData - 舊數據
   * @param {string} oldKey - 舊 key
   */
  async migrateLegacyDataToNewFormat(legacyData, oldKey) {
    try {
      const migratedHighlights = [];
      let successCount = 0;
      let failCount = 0;

      for (const oldItem of legacyData) {
        try {
          let textToFind = null;
          let color = 'yellow';

          if (typeof oldItem === 'object') {
            textToFind = oldItem.text || oldItem.content;

            if (oldItem.color) {
              color = oldItem.color;
            } else if (oldItem.bgColor || oldItem.backgroundColor) {
              color = HighlightManager.convertBgColorToName(
                oldItem.bgColor || oldItem.backgroundColor
              );
            }
          } else if (typeof oldItem === 'string') {
            textToFind = oldItem;
          }

          if (!textToFind || textToFind.trim().length === 0) {
            failCount++;
            continue;
          }

          const range = findTextInPage(textToFind);

          if (range) {
            const newId = `h${this.nextId++}`;
            const rangeInfo = serializeRange(range);

            migratedHighlights.push({
              id: newId,
              color,
              text: textToFind,
              timestamp: oldItem.timestamp || Date.now(),
              rangeInfo,
            });

            successCount++;
          } else {
            failCount++;
          }
        } catch (_error) {
          failCount++;
        }
      }

      if (migratedHighlights.length > 0 && window.StorageUtil) {
        // 使用標準化 URL 保持與存儲格式一致
        const currentUrl = window.normalizeUrl
          ? window.normalizeUrl(window.location.href)
          : window.location.href;

        await window.StorageUtil.saveHighlights(currentUrl, {
          url: currentUrl,
          highlights: migratedHighlights,
        });
      }

      // 標記遷移完成
      const storage = HighlightManager.getSafeExtensionStorage();
      if (storage && window.normalizeUrl) {
        const normalizedUrl = window.normalizeUrl(window.location.href);
        await storage.set({
          [`migration_completed_${normalizedUrl}`]: {
            timestamp: Date.now(),
            oldKey,
            totalCount: legacyData.length,
            successCount,
            failCount,
          },
        });
      }

      // 刪除舊數據
      if (successCount > 0) {
        localStorage.removeItem(oldKey);
      }
    } catch (_error) {
      Logger.error('數據遷移失敗:', _error);
    }
  }

  /**
   * 轉換背景顏色到顏色名稱
   * @param {string} bgColor
   * @returns {string}
   */
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

  /**
   * 收集標註數據用於同步到 Notion
   * @returns {Array} 標註數據數組
   */
  collectHighlightsForNotion() {
    return Array.from(this.highlights.values()).map(highlight => ({
      text: highlight.text,
      color: highlight.color,
      timestamp: highlight.timestamp,
    }));
  }

  /**
   * 清理資源
   */
  cleanup() {
    this.clearAll();

    if (CSS?.highlights) {
      Object.keys(this.highlightObjects).forEach(color => {
        CSS.highlights.delete(`notion-${color}`);
      });
    }

    // 移除樣式
    const styleEl = document.querySelector('#notion-highlight-styles');
    if (styleEl) {
      styleEl.remove();
    }
  }
}
